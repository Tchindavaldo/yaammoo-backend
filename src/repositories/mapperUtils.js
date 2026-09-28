// ============================================================================
// Helpers de conversion partagés par les mappers (mappers.js et fichiers dédiés)
// ============================================================================

const toIso = v => {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  return null;
};

const toDate = v => {
  if (!v) return null;
  if (typeof v === 'string') {
    // 'YYYY-MM-DD' ou ISO complet
    return v.length >= 10 ? v.substring(0, 10) : null;
  }
  if (v instanceof Date) return v.toISOString().substring(0, 10);
  return null;
};

module.exports = { toIso, toDate };
