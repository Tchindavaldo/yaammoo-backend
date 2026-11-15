// ============================================================================
// Frais des codes SMS de validation des numéros de retrait (CGU art. 12.5 bis)
// ============================================================================
// Chaque code envoyé par SMS pour vérifier un numéro Orange Money / MTN est
// débité au marchand (transaction `sms_fee`, débit du solde du réseau vérifié) :
//   frais = ⌈ coût Bird réel (USD) × taux USD→XAF du jour ⌉
// Bird ne connaît le coût qu'après la livraison : on débite le DELTA entre le
// coût total connu et la part déjà débitée (renvoi = même verificationId).
// Le solde peut devenir négatif ; ce négatif NE bloque PAS la boutique
// (merchantDebtGuard ne regarde que `merchant_debit`).
// Taux : settings_app.usd_xaf_rate { rate, fetchedAt }, rafraîchi 1×/jour par
// smsFeeJob depuis un service de change public ; en panne, dernier taux connu.
// ============================================================================
const { supabase } = require('../../config/supabase');
const repos = require('../../repositories');
const { AGGREGATORS } = require('../../utils/paymentAggregator');
const { toPayNetwork } = require('../../utils/mobileNetwork');

const RATE_KEY = 'usd_xaf_rate';
const RATE_URL = process.env.FX_RATE_URL;

/** Taux USD→XAF en base, ou null si jamais récupéré. */
exports.getUsdXafRate = async () => {
  const v = await repos.settings.get('app', RATE_KEY).catch(() => null);
  const rate = Number(v?.rate ?? v);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
};

/** Récupère le taux du jour et l'écrit en base. Échec = dernier taux gardé. */
exports.refreshUsdXafRate = async () => {
  if (!RATE_URL) return console.warn('[smsFee] FX_RATE_URL absent : taux non rafraîchi');
  try {
    const res = await fetch(RATE_URL);
    const json = await res.json();
    const rate = Number(json?.rates?.XAF);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error(`taux XAF absent de la réponse (${res.status})`);
    await repos.settings.set('app', RATE_KEY, { rate, fetchedAt: new Date().toISOString() }, 'Taux USD -> XAF du jour (frais SMS des numéros de retrait)');
    console.log(`[smsFee] taux USD->XAF = ${rate}`);
  } catch (e) {
    console.warn(`[smsFee] taux du jour indisponible (${e.message}) : dernier taux gardé`);
  }
};

/** Marque un envoi de code comme facturable au marchand. */
exports.markPayoutSend = async (verificationId, network) => {
  if (!verificationId || !['orange', 'mtn'].includes(network)) return;
  const { error } = await supabase.from('bird_costs').update({ fee_purpose: 'payout_number', fee_network: network }).eq('id', verificationId);
  if (error) console.warn(`[smsFee] marquage ${verificationId}: ${error.message}`);
};

/**
 * Estimation affichée AVANT l'envoi : moyenne des coûts SMS réels déjà
 * facturés par Bird (50 derniers), convertie au taux du jour, ⌈⌉.
 */
exports.estimateSmsFee = async () => {
  const rate = await exports.getUsdXafRate();
  if (!rate) return null;
  const { data, error } = await supabase.from('bird_costs').select('total_cost, send_count').eq('delivered_channel', 'sms').eq('currency_code', 'USD').not('total_cost', 'is', null).order('sent_at', { ascending: false }).limit(50);
  if (error || !data?.length) return null;
  const perSend = data.map(r => Number(r.total_cost) / Math.max(1, r.send_count || 1)).filter(n => Number.isFinite(n) && n > 0);
  if (!perSend.length) return null;
  const avgUsd = perSend.reduce((a, b) => a + b, 0) / perSend.length;
  return { amount: Math.ceil(avgUsd * rate), currency: 'XAF', rate };
};

/** Débite le delta de coût d'un envoi résolu. Idempotent. */
async function chargeRow(row, rate) {
  const owner = row.user_id;
  const cost = Number(row.total_cost) || 0;
  const deltaUsd = Math.round((cost - (Number(row.fee_debited_usd) || 0)) * 10000) / 10000;
  if (!owner || deltaUsd <= 0) return;
  const amount = Math.ceil(deltaUsd * rate);
  if (amount <= 0) return;
  // Réserve d'abord (fee_debited_usd), puis écrit la transaction : un double
  // passage concurrent ne peut pas débiter deux fois le même delta.
  const { data: claimed, error: cErr } = await supabase.from('bird_costs').update({ fee_debited_usd: cost, fee_debited_xaf: (Number(row.fee_debited_xaf) || 0) + amount }).eq('id', row.id).eq('fee_debited_usd', row.fee_debited_usd ?? 0).select('id');
  if (cErr) throw cErr;
  if (!claimed?.length) return;
  try {
    await repos.transactions.create({
      type: 'sms_fee',
      userId: owner,
      amount,
      name: 'Frais SMS de vérification du numéro de retrait',
      payBy: 'sms',
      aggregator: AGGREGATORS.PAWAPAY,
      network: toPayNetwork(row.fee_network),
      status: 'success',
      verificationId: row.id,
      costUsd: deltaUsd,
      usdXafRate: rate,
      phone: row.phone_number,
    });
  } catch (e) {
    await repos.appErrors.record({ scope: 'sms_fee', code: 'sms_fee_debit_failed', message: `Frais SMS NON débités (${amount} F) : ${e.message}. À régulariser à la main.`, userId: owner, context: { verificationId: row.id, deltaUsd, rate } });
  }
}

/** Passe sur les envois facturables résolus et non encore entièrement débités. */
exports.chargePendingSmsFees = async (onlyId = null) => {
  const rate = await exports.getUsdXafRate();
  let q = supabase.from('bird_costs').select('id, user_id, phone_number, total_cost, currency_code, delivered_channel, fee_network, fee_debited_usd, fee_debited_xaf').eq('fee_purpose', 'payout_number').not('total_cost', 'is', null);
  if (onlyId) q = q.eq('id', onlyId);
  const { data, error } = await q.limit(200);
  if (error) throw error;
  const due = (data || []).filter(r => r.currency_code === 'USD' && Number(r.total_cost) > (Number(r.fee_debited_usd) || 0));
  if (!due.length) return;
  if (!rate) {
    await repos.appErrors.record({ scope: 'sms_fee', code: 'sms_fee_no_rate', message: `Taux USD->XAF inconnu : ${due.length} frais SMS en attente de débit.`, context: { ids: due.map(r => r.id) } });
    return;
  }
  for (const row of due) await chargeRow(row, rate).catch(e => console.warn(`[smsFee] ${row.id}: ${e.message}`));
};

/** Coût des envois jamais validés : relu chez Bird après 15 min (lecture gratuite). */
exports.resolveAbandonedSends = async () => {
  const { getVerificationDetails } = require('../notification/bird/getVerification.service');
  const { recordVerificationCost } = require('../notification/bird/birdCost.service');
  const before = new Date(Date.now() - 15 * 60000).toISOString();
  const { data } = await supabase.from('bird_costs').select('id, user_id').eq('fee_purpose', 'payout_number').is('total_cost', null).lt('last_sent_at', before).limit(50);
  for (const r of data || []) {
    const d = await getVerificationDetails({ verificationId: r.id }).catch(() => null);
    if (d?.success) await recordVerificationCost({ verificationId: r.id, verification: d.data.raw, verified: false, userId: r.user_id });
  }
};
