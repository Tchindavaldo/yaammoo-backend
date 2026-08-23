// ============================================================================
// Bird Costs Repository — Supabase
// ============================================================================
// Journal des dépenses Bird. Bird ne propose aucune vue agrégée par API : le
// coût n'est lisible qu'en interrogeant chaque vérification une par une. Sans
// trace locale, il devient impossible de savoir ce qui a été dépensé.
// ============================================================================
const { supabase } = require('../../config/supabase');

const TABLE = 'bird_costs';

const fromSupabase = row =>
  row
    ? {
        id: row.id,
        phoneNumber: row.phone_number,
        email: row.email,
        userId: row.user_id,
        status: row.status,
        destinationCountry: row.destination_country,
        totalCost: row.total_cost != null ? Number(row.total_cost) : null,
        currencyCode: row.currency_code,
        attempts: row.attempts || [],
        deliveredChannel: row.delivered_channel,
        verified: !!row.verified,
        sendCount: row.send_count,
        sentAt: row.sent_at,
        lastSentAt: row.last_sent_at,
        resolvedAt: row.resolved_at,
      }
    : null;

exports.getById = async id => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return fromSupabase(data);
};

/**
 * Crée la trace d'un envoi, ou incrémente le compteur si la ligne existe déjà.
 *
 * Bird réutilise le même `verificationId` lors d'un renvoi tant que la demande
 * est valide, mais facture chaque envoi. On incrémente donc un compteur au lieu
 * d'écraser la trace, sans quoi le total sous-estimerait la dépense réelle.
 */
exports.recordSent = async ({ id, phoneNumber, email, userId }) => {
  const now = new Date().toISOString();
  const existing = await exports.getById(id);

  if (existing) {
    const { error } = await supabase
      .from(TABLE)
      .update({ send_count: (existing.sendCount || 1) + 1, last_sent_at: now })
      .eq('id', id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from(TABLE).insert({
    id,
    phone_number: phoneNumber || null,
    email: email || null,
    user_id: userId || null,
    status: 'pending',
    // Renseignés à la vérification, quand Bird a résolu les tentatives.
    total_cost: null,
    currency_code: null,
    attempts: [],
    verified: false,
    send_count: 1,
    sent_at: now,
    last_sent_at: now,
    resolved_at: null,
  });
  if (error) throw error;
};

/**
 * Complète (ou crée) la trace avec les coûts réels.
 * Upsert et non update : la trace d'envoi peut manquer si l'écriture initiale a
 * échoué, et on ne veut pas perdre le coût pour autant.
 */
exports.recordResolved = async ({ id, payload }) => {
  const { error } = await supabase.from(TABLE).upsert(
    {
      id,
      status: payload.status ?? null,
      destination_country: payload.destinationCountry ?? null,
      total_cost: payload.totalCost ?? null,
      currency_code: payload.currencyCode ?? null,
      attempts: payload.attempts || [],
      delivered_channel: payload.deliveredChannel ?? null,
      verified: !!payload.verified,
      ...(payload.userId ? { user_id: payload.userId } : {}),
      resolved_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  if (error) throw error;
};

/**
 * Lignes de la période, pour le récapitulatif.
 *
 * @param {object} [params]
 * @param {string} [params.from] Date ISO de début (incluse)
 * @param {string} [params.to]   Date ISO de fin (exclue)
 */
exports.listByPeriod = async ({ from, to } = {}) => {
  let query = supabase.from(TABLE).select('*');
  if (from) query = query.gte('sent_at', from);
  if (to) query = query.lt('sent_at', to);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(fromSupabase);
};
