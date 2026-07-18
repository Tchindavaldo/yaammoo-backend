// ============================================================================
// enrichBonusForUser — Construit le payload complet d'un bonus pour UN user
// ============================================================================
// Fusionne 4 sources :
//   1. la définition du bonus (stockée telle quelle en base)
//   2. la progression `bonusStats` (calculée depuis les commandes)
//   3. les compteurs (fastFoodBonusCount, totalClaimedCount, userClaimedCount)
//   4. l'état de la demande de CE user (requestStatus, claimedAt, usageCount, redeemed)
// ============================================================================

const { computeBonusStats } = require('./bonusStats.util');

// Statuts d'une entrée de demande considérés comme "réclamé/accordé".
const CLAIMED_ENTRY_STATUSES = ['approved', 'completed'];

/**
 * Dérive l'état de demande d'un user à partir de son bonus_request.
 * `status` est un tableau d'entrées {status, totalBonus, createdAt}.
 */
function deriveRequestState(request) {
  const base = {
    requestStatus: 'none',
    claimedAt: null,
    usageCount: 0,
    redeemed: false,
    userClaimedCount: 0,
  };
  if (!request) return base;

  const entries = Array.isArray(request.status) ? request.status : [];
  const claimedEntries = entries.filter(e => e && CLAIMED_ENTRY_STATUSES.includes(e.status));
  const hasPending = entries.some(e => e && e.status === 'pending');

  base.userClaimedCount = claimedEntries.length;

  if (hasPending) base.requestStatus = 'pending';
  else if (claimedEntries.length > 0) base.requestStatus = 'approved';

  // Date de réclamation = createdAt de la dernière entrée accordée
  if (claimedEntries.length > 0) {
    const last = claimedEntries.reduce(
      (acc, e) => {
        const t = new Date(e.createdAt || 0).getTime();
        return t > acc.t ? { t, e } : acc;
      },
      { t: -Infinity, e: null }
    ).e;
    base.claimedAt = last ? last.createdAt || null : null;
  }

  // usageCount / redeemed : portés par extra_data de la demande (flux de redemption à venir)
  if (typeof request.usageCount === 'number') base.usageCount = request.usageCount;
  if (typeof request.redeemed === 'boolean') base.redeemed = request.redeemed;

  return base;
}

/**
 * @param {Object} bonus                définition du bonus (mappée)
 * @param {Object} ctx
 * @param {Array}  ctx.orders           commandes du user
 * @param {Object} ctx.userRequestByBonus  map bonusId -> bonus_request du user
 * @param {Object} ctx.fastFoodBonusCounts map fastFoodId -> nb de bonus du fastfood
 * @param {Object} ctx.totalClaimCounts    map bonusId -> nb total de réclamations (tous users)
 * @param {Date}   [ctx.now]
 */
function enrichBonusForUser(bonus, ctx) {
  const { orders = [], userRequestByBonus = {}, fastFoodBonusCounts = {}, totalClaimCounts = {}, now = new Date() } = ctx || {};

  const fastFoodId = bonus.fastFoodId ?? null;

  const bonusStats = computeBonusStats(orders, { fastFoodId, now });
  const requestState = deriveRequestState(userRequestByBonus[bonus.id]);

  return {
    // ── Définition (base) ──
    id: bonus.id,
    type: bonus.type ?? null,
    name: bonus.name ?? null,
    description: bonus.description ?? null,
    criteria: bonus.criteria ?? null,
    fastFoodId,
    fastFoodName: bonus.fastFoodName ?? null,
    active: bonus.active ?? true,
    claimDuration: bonus.claimDuration ?? null,
    usageLimit: bonus.usageLimit ?? null,
    createdAt: bonus.createdAt ?? null,

    // ── Progression du user (calculée) ──
    bonusStats,

    // ── Compteurs ──
    fastFoodBonusCount: fastFoodId ? fastFoodBonusCounts[fastFoodId] || 0 : 0,
    totalClaimedCount: totalClaimCounts[bonus.id] || 0,
    userClaimedCount: requestState.userClaimedCount,

    // ── État de la demande de CE user ──
    requestStatus: requestState.requestStatus,
    claimedAt: requestState.claimedAt,
    usageCount: requestState.usageCount,
    redeemed: requestState.redeemed,
  };
}

module.exports = { enrichBonusForUser, deriveRequestState, CLAIMED_ENTRY_STATUSES };
