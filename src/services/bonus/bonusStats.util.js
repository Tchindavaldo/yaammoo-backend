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

// Statuts d'une entrée de réclamation considérés comme accordés (bonus obtenu).
const CLAIMED_STATUSES = ['approved', 'completed'];

// Statuts qui MOBILISENT le solde. `pending` en fait partie : un bonus à
// livraison manuelle réserve ses commandes dès le claim, sinon le user pourrait
// réclamer plusieurs bonus avec le même solde pendant le traitement.
// Seul un refus (`rejected`) rendrait les commandes — cf. rejet non implémenté.
const CONSUMING_STATUSES = [...CLAIMED_STATUSES, 'pending'];

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
 * IDs des commandes déjà dépensées par les réclamations accordées du user.
 * Une commande dépensée l'est définitivement : elle ne peut plus financer un
 * autre palier, même si elle est annulée après coup (le bonus est déjà accordé).
 *
 * @param {Array|Object} requests  réclamation(s) du user
 * @returns {Set<string>} ids de commandes déjà consommées
 */
function collectSpentOrderIds(requests) {
  const spent = new Set();
  if (!requests) return spent;

  const list = Array.isArray(requests) ? requests : [requests];
  for (const request of list) {
    const entries = Array.isArray(request?.status) ? request.status : [];
    for (const e of entries) {
      if (!e || !CONSUMING_STATUSES.includes(e.status)) continue;
      for (const id of e.consumedOrderIds || []) spent.add(id);
    }
  }

  return spent;
}

/**
 * Somme des paliers déjà consommés par le user, sur la fenêtre courante.
 * Chaque réclamation accordée persiste les COMMANDES qu'elle a dépensées
 * (`consumedOrderIds`) : c'est l'historique des activations.
 *
 * ⚠️ La fenêtre se juge sur la date des COMMANDES consommées, pas sur celle de
 * la réclamation. Un claim d'aujourd'hui peut avoir dépensé des commandes du
 * début du mois : elles ne doivent grever que le solde `month`, pas le `day`.
 *
 * @param {Array|Object} requests  réclamation(s) du user (peut être null)
 * @param {string} period          'day' | 'week' | 'month'
 * @param {Array}  [orders]        commandes du user, pour dater les IDs consommés
 * @param {Date}   [now]
 * @returns {{count:number, amount:number}} total consommé dans la fenêtre
 */
function consumedInWindow(requests, period, orders = [], now = new Date()) {
  const total = { count: 0, amount: 0 };
  if (!requests) return total;

  // POT COMMUN : on somme les paliers consommés sur TOUTES les réclamations du
  // user (tous bonus, plateforme et fastfood confondus), pas seulement celles
  // du bonus courant. Les commandes sont une monnaie : réclamer un bonus les
  // dépense pour tous les autres.
  const list = Array.isArray(requests) ? requests : [requests];
  const start = windowStart(period, now);
  const orderById = new Map((orders || []).filter(o => o && o.id).map(o => [o.id, o]));

  for (const request of list) {
    const entries = Array.isArray(request?.status) ? request.status : [];
    for (const e of entries) {
      if (!e || !CONSUMING_STATUSES.includes(e.status)) continue;

      if (Array.isArray(e.consumedOrderIds) && e.consumedOrderIds.length > 0) {
        // Modèle soldé : chaque commande dépensée pèse sur les fenêtres qui la
        // contiennent, et sur elles seules.
        for (const id of e.consumedOrderIds) {
          const order = orderById.get(id);
          if (!order || !order.createdAt) continue;
          const at = new Date(order.createdAt);
          if (Number.isNaN(at.getTime()) || at < start) continue;
          total.count += 1;
          total.amount += Number(order.total) || 0;
        }
        continue;
      }

      // Legacy (réclamations sans IDs) : on retombe sur la date du claim.
      const at = new Date(e.createdAt || 0);
      if (Number.isNaN(at.getTime()) || at < start) continue;

      if (e.consumedCount != null || e.consumedAmount != null) {
        total.count += Number(e.consumedCount) || 0;
        total.amount += Number(e.consumedAmount) || 0;
      } else {
        // Plus ancien encore : seul `target` est connu, dans l'unité d'origine.
        const legacy = Number(e.target) || 0;
        if (e.kind === 'order_count') total.count += legacy;
        else total.amount += legacy;
      }
    }
  }

  return total;
}

/**
 * Contrepartie d'un palier dans LES DEUX unités, mesurée sur les commandes
 * réellement passées : on consomme les commandes les plus anciennes de la
 * fenêtre jusqu'à atteindre le palier.
 *
 * Ex. palier 10 000 FCFA atteint avec 3 commandes de 4 000 → on consomme
 * 12 000 FCFA ET 3 commandes (on ne fractionne pas une commande).
 *
 * ⚠️ Modèle SOLDÉ : les commandes déjà dépensées par une réclamation antérieure
 * sont exclues. Sans ça, chaque claim reconsommerait les mêmes commandes les
 * plus anciennes et le total consommé dépasserait le total réellement commandé.
 *
 * @param {Object} bonus  définition du bonus réclamé
 * @param {Array}  orders commandes du user
 * @param {Object} [opts]
 * @param {Set<string>} [opts.spentOrderIds]  commandes déjà dépensées (pot commun)
 * @param {Date}   [opts.now]
 * @returns {{consumedCount:number, consumedAmount:number, consumedOrderIds:string[]}}
 */
function measureConsumption(bonus, orders, { spentOrderIds = new Set(), now = new Date() } = {}) {
  const criteria = bonus.criteria || {};
  const target = Number(criteria.target) || 0;
  if (!criteria.kind || target <= 0) {
    return { consumedCount: 0, consumedAmount: 0, consumedOrderIds: [] };
  }

  const period = criteria.period || 'month';
  const start = windowStart(period, now);
  const fastFoodId = bonus.fastFoodId ?? null;

  const eligible = (orders || [])
    .filter(o => {
      if (!o || !o.createdAt) return false;
      if (EXCLUDED_STATUSES.includes(o.status)) return false;
      if (fastFoodId && o.fastFoodId !== fastFoodId) return false;
      if (spentOrderIds.has(o.id)) return false;
      const at = new Date(o.createdAt);
      return !Number.isNaN(at.getTime()) && at >= start;
    })
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  let count = 0;
  let amount = 0;
  const consumedOrderIds = [];
  for (const o of eligible) {
    count += 1;
    amount += Number(o.total) || 0;
    consumedOrderIds.push(o.id);
    const reached = criteria.kind === 'order_count' ? count >= target : amount >= target;
    if (reached) break;
  }

  return { consumedCount: count, consumedAmount: amount, consumedOrderIds };
}

/**
 * Applique le décrément au solde brut : solde affiché = brut − consommé.
 * Le brut vient des commandes (immuable) ; c'est le consommé qui monte à
 * chaque activation, produisant l'effet "redescend puis remonte".
 *
 * Chaque métrique est décrémentée dans SA propre unité : `count` avec les
 * commandes consommées, `amount` avec les montants consommés. Jamais sous 0.
 *
 * POT COMMUN : le décrément agrège les réclamations de TOUS les bonus du user.
 *
 * @param {Object} stats     bonusStats brut {day,week,month}
 * @param {Object} bonus     définition du bonus
 * @param {Array}  requests  TOUTES les réclamations du user (pot commun)
 * @param {Array}  [orders]  commandes du user, pour dater les IDs consommés
 * @param {Date}   [now]
 * @returns {Object} nouveau bonusStats décrémenté
 */
function applyConsumption(stats, bonus, requests, orders = [], now = new Date()) {
  // TOUTES les périodes sont décrémentées, chacune avec les COMMANDES consommées
  // tombant dans SA propre fenêtre : une commande dépensée aujourd'hui impacte
  // day, week et month ; une commande du début du mois n'impacte que month.
  const out = {};
  for (const p of PERIODS) {
    const window = stats[p];
    if (!window) continue;
    const consumed = consumedInWindow(requests, p, orders, now);
    out[p] = {
      count: Math.max(0, window.count - consumed.count),
      amount: Math.max(0, window.amount - consumed.amount),
    };
  }
  return { ...stats, ...out };
}

/**
 * Évalue si un user atteint le palier d'un bonus (source de vérité backend).
 * Le solde évalué est le solde DÉCRÉMENTÉ : un palier déjà consommé ne peut pas
 * être réclamé une 2e fois sans de nouvelles commandes.
 *
 * @param {Object} bonus      définition (criteria.kind/target/period, fastFoodId)
 * @param {Array}  orders     commandes du user
 * @param {Array}  [requests] TOUTES les réclamations du user (pot commun)
 * @param {Date}   [now]
 * @returns {{eligible:boolean, metric:number, target:number|null, kind:string}}
 */
function isBonusEligible(bonus, orders, requests = null, now = new Date()) {
  const criteria = bonus.criteria || {};
  const kind = criteria.kind;
  const period = criteria.period || 'month';
  const target = Number(criteria.target) || 0;
  const raw = computeBonusStats(orders, { fastFoodId: bonus.fastFoodId ?? null, now });
  const stats = applyConsumption(raw, bonus, requests, orders, now);
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
  collectSpentOrderIds,
  measureConsumption,
  applyConsumption,
  EXCLUDED_STATUSES,
  CLAIMED_STATUSES,
  CONSUMING_STATUSES,
  PERIODS,
};
