// ============================================================================
// enrichBonusForUser — Construit le payload complet d'un bonus pour UN user
// ============================================================================
// Fusionne 4 sources :
//   1. la définition du bonus (stockée telle quelle en base)
//   2. la progression `bonusStats` (calculée depuis les commandes)
//   3. les compteurs (fastFoodBonusCount, totalClaimedCount, userClaimedCount)
//   4. l'état de la demande de CE user (requestStatus, claimedAt, usageCount, redeemed)
// ============================================================================

const { computeBonusStats, applyConsumption, CLAIMED_STATUSES } = require('./bonusStats.util');

// Statuts d'une entrée de demande considérés comme "réclamé/accordé".
const CLAIMED_ENTRY_STATUSES = CLAIMED_STATUSES;

/**
 * Réclamation COURANTE parmi plusieurs lignes d'un même (user, bonus).
 *
 * Depuis la migration 029, chaque réclamation est une ligne distincte : les
 * cycles précédents restent en base comme historique. L'état affiché au user
 * (code, usageCount, armed, credentials) est TOUJOURS celui de la plus récente.
 *
 * @param {Array} requests réclamations d'un même bonus
 * @returns {Object|null}
 */
function pickCurrentRequest(requests) {
  const list = (requests || []).filter(Boolean);
  if (list.length === 0) return null;

  return list.reduce((acc, r) => {
    const t = new Date(r.createdAt || 0).getTime();
    const accT = new Date(acc.createdAt || 0).getTime();
    return t > accT ? r : acc;
  });
}

/**
 * Indexe les réclamations d'un user par bonusId, en ne gardant que la COURANTE.
 * @param {Array} userRequests toutes les lignes du user (tous bonus confondus)
 * @returns {Object} map bonusId -> réclamation courante
 */
function indexCurrentRequestsByBonus(userRequests) {
  const byBonus = {};
  for (const req of userRequests || []) {
    if (!req || !req.bonusId) continue;
    (byBonus[req.bonusId] ||= []).push(req);
  }
  for (const bonusId of Object.keys(byBonus)) {
    byBonus[bonusId] = pickCurrentRequest(byBonus[bonusId]);
  }
  return byBonus;
}

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
    code: null,
    armed: false,
    rewardCredentials: null,
  };
  if (!request) return base;

  const entries = Array.isArray(request.status) ? request.status : [];
  const claimedEntries = entries.filter(e => e && CLAIMED_ENTRY_STATUSES.includes(e.status));
  const hasPending = entries.some(e => e && e.status === 'pending');

  base.userClaimedCount = claimedEntries.length;

  if (hasPending) base.requestStatus = 'pending';
  else if (claimedEntries.length > 0) base.requestStatus = 'approved';

  // Identifiants livrés (Netflix, clé…) portés par la dernière entrée honorée.
  const withCredentials = entries.filter(e => e && e.rewardCredentials);
  if (withCredentials.length > 0) base.rewardCredentials = withCredentials[withCredentials.length - 1].rewardCredentials;

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

  // usageCount / redeemed / code : portés par extra_data de la demande
  if (typeof request.usageCount === 'number') base.usageCount = request.usageCount;
  if (typeof request.redeemed === 'boolean') base.redeemed = request.redeemed;
  if (typeof request.code === 'string') base.code = request.code;
  if (typeof request.armed === 'boolean') base.armed = request.armed;

  return base;
}

/**
 * Date d'expiration du code = claimedAt + claimDuration (jours).
 * @returns {string|null} ISO ou null si non réclamé / durée non définie
 */
function computeExpiresAt(claimedAt, claimDuration) {
  if (!claimedAt || !claimDuration) return null;
  const at = new Date(claimedAt);
  if (Number.isNaN(at.getTime())) return null;
  at.setUTCDate(at.getUTCDate() + Number(claimDuration));
  return at.toISOString();
}

/**
 * @param {Object} bonus                définition du bonus (mappée)
 * @param {Object} ctx
 * @param {Array}  ctx.orders           commandes du user
 * @param {Object} ctx.userRequestByBonus  map bonusId -> réclamation COURANTE du user
 * @param {Object} ctx.userRequestsByBonus  map bonusId -> TOUTES ses réclamations
 *                                          (historique : alimente userClaimedCount)
 * @param {Object} ctx.fastFoodBonusCounts map fastFoodId -> nb de bonus du fastfood
 * @param {Object} ctx.totalClaimCounts    map bonusId -> nb total de réclamations (tous users)
 * @param {Date}   [ctx.now]
 */
function enrichBonusForUser(bonus, ctx) {
  const { orders = [], userRequestByBonus = {}, userRequestsByBonus = {}, userRequests = [], fastFoodBonusCounts = {}, totalClaimCounts = {}, now = new Date() } = ctx || {};

  const fastFoodId = bonus.fastFoodId ?? null;

  const request = userRequestByBonus[bonus.id];
  const requestState = deriveRequestState(request);

  // Historique : une réclamation = une LIGNE (migration 029). Le nombre de fois
  // que CE user a réclamé CE bonus se compte donc sur toutes ses lignes, pas
  // sur les seules entrées `status` de la ligne courante.
  const allForBonus = userRequestsByBonus[bonus.id] || (request ? [request] : []);
  const userClaimedCount = allForBonus.reduce((n, r) => n + deriveRequestState(r).userClaimedCount, 0);

  // Solde affiché = brut (commandes) − paliers consommés sur la fenêtre.
  // Pot commun : on déduit les réclamations de TOUS les bonus du user.
  const rawStats = computeBonusStats(orders, { fastFoodId, now });
  const bonusStats = applyConsumption(rawStats, bonus, userRequests, orders, now);

  const expiresAt = computeExpiresAt(requestState.claimedAt, bonus.claimDuration);
  const expired = expiresAt ? new Date(expiresAt) < now : false;

  // Cycle terminé (code épuisé ou périmé) : la réclamation n'est plus active.
  // On repasse en `none` pour que le front propose de réclamer à nouveau dès que
  // le palier est de nouveau atteint. L'historique (`userClaimedCount`) est
  // conservé, et le code périmé n'est plus exposé.
  const cycleClosed = requestState.requestStatus === 'approved' && (requestState.redeemed || expired);

  const requestStatus = cycleClosed ? 'none' : requestState.requestStatus;
  const code = cycleClosed ? null : requestState.code;
  const claimedAt = cycleClosed ? null : requestState.claimedAt;

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
    userClaimedCount,

    // ── État de la demande de CE user ──
    // `requestId` : identifie la réclamation COURANTE. Indispensable au front
    // pour cibler une ligne précise (livraison des credentials, historique) —
    // depuis la migration 029 il en existe une par cycle.
    requestId: cycleClosed ? null : (request?.id ?? null),
    // Un cycle terminé (épuisé/expiré) est remis à zéro : le user peut
    // re-réclamer dès que le palier est de nouveau atteint.
    requestStatus,
    claimedAt,
    usageCount: cycleClosed ? 0 : requestState.usageCount,
    redeemed: cycleClosed ? false : requestState.redeemed,
    // Armement global (page bonus) : le bonus s'appliquera à la prochaine
    // commande éligible. Un cycle terminé n'est plus armable.
    armed: cycleClosed ? false : requestState.armed,

    // ── Code de réclamation & validité ──
    code,
    // Identifiants livrés pour les bonus `requiresRewardCredentials` (null tant que
    // la réclamation est `pending`, ou une fois le cycle terminé).
    rewardCredentials: cycleClosed ? null : requestState.rewardCredentials,
    expiresAt: cycleClosed ? null : expiresAt,
    expired: cycleClosed ? false : expired,
    remainingUses: bonus.usageLimit != null ? (cycleClosed ? Number(bonus.usageLimit) : Math.max(0, Number(bonus.usageLimit) - requestState.usageCount)) : null,
  };
}

module.exports = { enrichBonusForUser, deriveRequestState, computeExpiresAt, pickCurrentRequest, indexCurrentRequestsByBonus, CLAIMED_ENTRY_STATUSES };
