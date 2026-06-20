// ============================================================================
// period — bornes de date pour les filtres de portefeuille
// ============================================================================
// Deux entrées possibles (cf. routes /wallet) :
//   - from / to : dates ISO explicites (intervalle libre)
//   - period    : raccourci 'today' | 'week' | 'month' | 'all'
// `period` calcule from/to côté backend ; from/to explicites priment dessus.
// ============================================================================

/** Début de la journée (00:00:00) en ISO. */
const startOfDay = d => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/**
 * Résout { from, to } (ISO strings ou null) à partir des query params.
 * @param {{ from?:string, to?:string, period?:string }} params
 * @returns {{ from:string|null, to:string|null }}
 */
const resolvePeriod = ({ from, to, period } = {}) => {
  // from/to explicites priment
  if (from || to) {
    return { from: from || null, to: to || null };
  }

  const now = new Date();
  switch (period) {
    case 'today':
      return { from: startOfDay(now).toISOString(), to: null };
    case 'week': {
      const d = startOfDay(now);
      d.setDate(d.getDate() - 7);
      return { from: d.toISOString(), to: null };
    }
    case 'month': {
      const d = startOfDay(now);
      d.setMonth(d.getMonth() - 1);
      return { from: d.toISOString(), to: null };
    }
    case 'all':
    default:
      return { from: null, to: null };
  }
};

/**
 * Clé de regroupement d'une date selon la granularité.
 *   day   -> 'YYYY-MM-DD'
 *   week  -> 'YYYY-Www' (semaine ISO)
 *   month -> 'YYYY-MM'
 * @returns {string}
 */
const groupKey = (isoDate, groupBy = 'day') => {
  const d = new Date(isoDate);
  const y = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');

  if (groupBy === 'month') return `${y}-${mm}`;
  if (groupBy === 'week') {
    // Semaine ISO 8601
    const tmp = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate()));
    const day = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  return `${y}-${mm}-${dd}`;
};

module.exports = { resolvePeriod, groupKey };
