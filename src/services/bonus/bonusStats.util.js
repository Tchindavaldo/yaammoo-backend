// ============================================================================
// bonusStats.util — Calcul du solde accumulé d'un user (day/week/month)
// ============================================================================
// Le solde progresse à chaque commande NON annulée du user. On agrège, par
// fenêtre glissante (jour/semaine/mois calendaires, UTC), le nombre de
// commandes (`count`) et le montant cumulé (`amount`) pour un fastfood donné.
//
// ⚠️ La décrémentation du solde de `criteria.target` à chaque bonus activé
// relève du flux d'ACTIVATION (à venir) et n'est PAS faite ici : ce module
// ne calcule que la progression brute lue au GET.
// ============================================================================

// Statuts de commande EXCLUS du calcul (commande annulée = ne compte pas).
// Cohérent avec les statuts utilisés dans le domaine `order`.
const EXCLUDED_STATUSES = ['cancelByUser', 'cancelByFastFood'];

// Statuts d'une entrée de réclamation considérés comme accordés (= palier consommé).
const CLAIMED_STATUSES = ['approved', 'completed'];

const PERIODS = ['day', 'week', 'month'];

/**
 * Début (UTC) de la fenêtre pour une période donnée, relatif à `now`.
 * - day   : minuit UTC du jour courant
 * - week  : lundi 00:00 UTC de la semaine courante
 * - month : 1er du mois 00:00 UTC
 */
function windowStart(period, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === 'day') return d;
  if (period === 'week') {
    // getUTCDay(): 0 = dimanche … 6 = samedi. On ramène au lundi.
    const day = d.getUTCDay();
    const diff = (day + 6) % 7; // nb de jours depuis lundi
    d.setUTCDate(d.getUTCDate() - diff);
    return d;
  }
  if (period === 'month') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
  return d;
}

function emptyStats() {
  return {
    day: { count: 0, amount: 0 },
    week: { count: 0, amount: 0 },
    month: { count: 0, amount: 0 },
  };
}

/**
 * Agrège les commandes d'un user en bonusStats {day,week,month}.
 *
 * @param {Array} orders      commandes du user (déjà mappées, camelCase)
 * @param {Object} opts
 * @param {string|null} opts.fastFoodId  si défini, ne compte que les commandes
 *                                        de ce fastfood ; sinon toutes (bonus plateforme)
 * @param {Date}  [opts.now]
 * @returns {{day:{count,amount},week:{count,amount},month:{count,amount}}}
 */
function computeBonusStats(orders, { fastFoodId = null, now = new Date() } = {}) {
  const stats = emptyStats();
  if (!Array.isArray(orders) || orders.length === 0) return stats;

  const starts = {};
  for (const p of PERIODS) starts[p] = windowStart(p, now);

  for (const order of orders) {
    if (!order || !order.createdAt) continue;
    if (EXCLUDED_STATUSES.includes(order.status)) continue;
    if (fastFoodId && order.fastFoodId !== fastFoodId) continue;

    const created = new Date(order.createdAt);
    if (Number.isNaN(created.getTime())) continue;

    const amount = Number(order.total) || 0;

    for (const p of PERIODS) {
      if (created >= starts[p]) {
        stats[p].count += 1;
        stats[p].amount += amount;
      }
    }
  }

  return stats;
}

/**
 * Somme des paliers déjà consommés par le user pour un bonus, sur la fenêtre
 * courante. Chaque réclamation accordée persiste son `target` dans le tableau
 * `status` du bonus_request : c'est l'historique des activations.
 *
 * ⚠️ On ne déduit QUE les entrées tombant dans la fenêtre courante. Une
 * réclamation du mois dernier ne doit pas grever le solde du mois en cours
 * (le brut, lui, repart de 0 au changement de fenêtre).
 *
 * @param {Object} request  bonus_request du user (peut être null)
 * @param {string} period   'day' | 'week' | 'month'
 * @param {Date}   [now]
 * @returns {number} total des targets consommés dans la fenêtre
 */
function consumedInWindow(request, period, now = new Date()) {
  if (!request) return 0;
  const entries = Array.isArray(request.status) ? request.status : [];
  const start = windowStart(period, now);

  return entries.reduce((sum, e) => {
    if (!e || !CLAIMED_STATUSES.includes(e.status)) return sum;
    const at = new Date(e.createdAt || 0);
    if (Number.isNaN(at.getTime()) || at < start) return sum;
    return sum + (Number(e.target) || 0);
  }, 0);
}

/**
 * Applique le décrément au solde brut : solde affiché = brut − consommé.
 * Le brut vient des commandes (immuable) ; c'est le consommé qui monte à
 * chaque activation, produisant l'effet "redescend puis remonte".
 *
 * Seule la métrique correspondant à `criteria.kind` est décrémentée
 * (order_count → count ; amount_spent → amount), et uniquement sur la période
 * du critère. Jamais en dessous de 0.
 *
 * @param {Object} stats    bonusStats brut {day,week,month}
 * @param {Object} bonus    définition du bonus
 * @param {Object} request  bonus_request du user
 * @param {Date}   [now]
 * @returns {Object} nouveau bonusStats décrémenté
 */
function applyConsumption(stats, bonus, request, now = new Date()) {
  const criteria = bonus.criteria || {};
  // Bonus welcome : pas de palier, donc rien à décrémenter.
  if (!criteria.kind || criteria.kind === 'welcome') return stats;

  const period = criteria.period || 'month';
  const consumed = consumedInWindow(request, period, now);
  if (consumed <= 0) return stats;

  const metricKey = criteria.kind === 'order_count' ? 'count' : 'amount';
  const window = stats[period];
  if (!window) return stats;

  return {
    ...stats,
    [period]: { ...window, [metricKey]: Math.max(0, window[metricKey] - consumed) },
  };
}

/**
 * Évalue si un user atteint le palier d'un bonus (source de vérité backend).
 * Le solde évalué est le solde DÉCRÉMENTÉ : un palier déjà consommé ne peut pas
 * être réclamé une 2e fois sans de nouvelles commandes.
 *
 * @param {Object} bonus     définition (criteria.kind/target/period, fastFoodId)
 * @param {Array}  orders    commandes du user
 * @param {Object} [request] bonus_request du user (pour le décrément)
 * @param {Date}   [now]
 * @returns {{eligible:boolean, metric:number, target:number|null, kind:string}}
 */
function isBonusEligible(bonus, orders, request = null, now = new Date()) {
  const criteria = bonus.criteria || {};
  const kind = criteria.kind;

  // Bonus d'accueil : offert d'office, aucun palier à atteindre.
  if (kind === 'welcome') {
    return { eligible: true, metric: 0, target: null, kind };
  }

  const period = criteria.period || 'month';
  const target = Number(criteria.target) || 0;
  const raw = computeBonusStats(orders, { fastFoodId: bonus.fastFoodId ?? null, now });
  const stats = applyConsumption(raw, bonus, request, now);
  const window = stats[period] || { count: 0, amount: 0 };

  // order_count → nb de commandes ; amount_spent → montant cumulé
  const metric = kind === 'order_count' ? window.count : window.amount;

  return { eligible: target > 0 && metric >= target, metric, target, kind };
}

module.exports = {
  computeBonusStats,
  windowStart,
  isBonusEligible,
  consumedInWindow,
  applyConsumption,
  EXCLUDED_STATUSES,
  CLAIMED_STATUSES,
  PERIODS,
};
