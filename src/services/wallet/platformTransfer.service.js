// ============================================================================
// platformTransfer.service — Verser de la marge plateforme à une boutique (admin)
// ============================================================================
// Il n'y a pas de « solde plateforme » : la part de Yaammoo d'une commande est
// le résidu `order_settlements.platform_margin`, qui reste sur le compte de
// l'agrégateur. Un admin peut en verser une partie sur le portefeuille d'une
// boutique, en prélevant sur la marge d'une ou plusieurs boutiques sources.
//
// Règles (choix produit) :
//   - montant PAR source ; chaque source = une boutique + un réseau ;
//   - plafond : marge encore disponible de la source SUR CE RÉSEAU
//     (gagnée − déjà transférée), cf. platformTransfers.repo ;
//   - réseau conservé : marge MTN → solde MTN, marge Orange → solde Orange.
//     La réserve de retrait pawaPay a été prélevée au dépôt sur TOUT le
//     paiement, marge comprise : le retrait même réseau reste gratuit ;
//   - frais kiosque (1,2 % + 4) INCLUS dans le montant : rien n'est ajouté,
//     le marchand touchera un peu moins en espèces.
//
// Écriture : une transaction `platform_transfer` par source, créditée au
// propriétaire de la boutique destinataire, en UNE insertion (tout ou rien).
// Verrou en base (table platform_transfer_locks) par boutique source : un
// second transfert simultané sur une même source est refusé (409).
// ============================================================================

const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { reliableEmit } = require('../../utils/reliableEmit');
const { WALLET_AGGREGATORS } = require('../../utils/paymentAggregator');
const { toBalanceKey } = require('../../utils/mobileNetwork');

const TRANSFER_NAME = 'Crédit Yaammoo';

const fail = (httpStatus, code, message, data) => ({ success: false, httpStatus, code, message, ...(data ? { data } : {}) });

/** Regroupe les sources identiques (même boutique + même réseau). */
function mergeSources(sources) {
  const byKey = new Map();
  for (const s of sources) {
    const key = `${s.fastFoodId}|${s.network}`;
    const prev = byKey.get(key);
    byKey.set(key, { fastFoodId: s.fastFoodId, network: s.network, amount: (prev?.amount || 0) + Number(s.amount) });
  }
  return [...byKey.values()];
}

/** Marge disponible d'une boutique, par réseau. */
async function availableMargin(fastFoodId) {
  const [earned, transferred] = await Promise.all([repos.platformTransfers.getEarnedMarginByNetwork(fastFoodId), repos.platformTransfers.getTransferredByNetwork(fastFoodId)]);
  const net = k => Math.floor(earned[k] - transferred[k]);
  return { earned, transferred, available: { mtn: net('mtn'), orange: net('orange') } };
}

/**
 * @param {{ toFastFoodId:string, sources:Array<{fastFoodId,network,amount}>, reason?:string, adminUid:string }} params
 * @returns {Promise<{ success:true, data } | { success:false, httpStatus, code, message, data? }>}
 */
exports.transferPlatformMargin = async ({ toFastFoodId, sources, reason, adminUid }) => {
  const dest = await repos.fastfoods.getById(toFastFoodId);
  if (!dest) return fail(404, 'destination_not_found', 'Boutique destinataire introuvable');
  if (!dest.userId) return fail(400, 'destination_without_owner', 'La boutique destinataire n’a pas de propriétaire');

  const merged = mergeSources(sources);
  const sourceIds = [...new Set(merged.map(s => s.fastFoodId))];
  if (!(await repos.platformTransfers.acquireLocks(sourceIds, adminUid))) {
    return fail(409, 'transfer_in_progress', 'Un transfert est déjà en cours sur une des boutiques sources');
  }
  try {
    return await runTransfer({ dest, toFastFoodId, merged, reason, adminUid });
  } finally {
    await repos.platformTransfers.releaseLocks(sourceIds);
  }
};

async function runTransfer({ dest, toFastFoodId, merged, reason, adminUid }) {

  // Contrôle du plafond, source par source (une boutique peut apparaître sur
  // ses deux réseaux : sa marge n'est lue qu'une fois).
  const marginCache = new Map();
  const refused = [];
  for (const s of merged) {
    if (!marginCache.has(s.fastFoodId)) {
      const shop = s.fastFoodId === toFastFoodId ? dest : await repos.fastfoods.getById(s.fastFoodId);
      marginCache.set(s.fastFoodId, shop ? await availableMargin(s.fastFoodId) : null);
    }
    const margin = marginCache.get(s.fastFoodId);
    if (!margin) {
      refused.push({ fastFoodId: s.fastFoodId, network: s.network, amount: s.amount, available: 0, reason: 'source_not_found' });
      continue;
    }
    const available = margin.available[toBalanceKey(s.network)];
    if (s.amount > available) refused.push({ fastFoodId: s.fastFoodId, network: s.network, amount: s.amount, available: Math.max(0, available), reason: 'exceeds_available_margin' });
  }
  if (refused.length) {
    console.warn(`[PlatformTransfer] ❌ refusé (admin=${adminUid}, dest=${toFastFoodId}) : ${JSON.stringify(refused)}`);
    return fail(400, 'insufficient_margin', 'Montant supérieur à la marge disponible pour au moins une source', { refused });
  }

  const rows = merged.map(s => ({
    userId: dest.userId,
    amount: s.amount,
    name: TRANSFER_NAME,
    payBy: 'platform',
    // Marge encaissée par l'agrégateur du portefeuille : comptée et retirable.
    aggregator: WALLET_AGGREGATORS[0],
    network: s.network,
    // extra_data : traçabilité du transfert.
    fastFoodId: toFastFoodId,
    sourceFastFoodId: s.fastFoodId,
    reason: reason || null,
    adminUid,
  }));
  const created = await repos.platformTransfers.createMany(rows);
  console.info(`[PlatformTransfer] ✓ admin=${adminUid} → dest=${toFastFoodId} (user=${dest.userId}) : ${created.map(t => `${t.amount} ${t.network} depuis ${t.sourceFastFoodId}`).join(', ')}`);

  // Même événement que le crédit d'une commande : le solde du marchand bouge.
  for (const tx of created) {
    try {
      await reliableEmit(getIO(), dest.userId, 'wallet.credited', {
        transactionId: tx.id,
        type: 'platform_transfer',
        direction: 'payin',
        amount: tx.amount,
        network: tx.network,
        name: tx.name,
        fastFoodId: toFastFoodId,
        createdAt: tx.createdAt,
      });
    } catch (e) {
      console.warn(`[PlatformTransfer] émission socket wallet.credited non critique: ${e.message}`);
    }
  }

  const balance = await repos.transactions.getMerchantBalance(dest.userId);
  return {
    success: true,
    data: {
      transfers: created.map(t => ({ id: t.id, amount: t.amount, network: t.network, sourceFastFoodId: t.sourceFastFoodId, createdAt: t.createdAt })),
      total: created.reduce((sum, t) => sum + t.amount, 0),
      destination: { fastFoodId: toFastFoodId, userId: dest.userId, balance: { balance: balance.balance, mtn: balance.mtn, orange: balance.orange } },
    },
  };
}
