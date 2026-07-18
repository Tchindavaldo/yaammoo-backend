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

module.exports = { computeBonusStats, windowStart, EXCLUDED_STATUSES, PERIODS };
