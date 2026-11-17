// ============================================================================
// App Errors Repository — Supabase (migration 068)
// ============================================================================
// Journal persistant des erreurs importantes. Écriture best-effort : une panne
// du journal ne doit jamais casser le flux qui l'appelle.
// ============================================================================
const { supabase } = require('../../config/supabase');

/**
 * @param {{ scope:string, code:string, message:string, orderId?, userId?, fastFoodId?, context?:Object }} e
 */
exports.record = async e => {
  try {
    const { error } = await supabase.from('app_errors').insert({
      scope: e.scope,
      code: e.code,
      message: e.message,
      order_id: e.orderId ?? null,
      user_id: e.userId ?? null,
      fastfood_id: e.fastFoodId ?? null,
      context: e.context ?? {},
    });
    if (error) console.error(`[appErrors] ❌ journal non écrit (${e.scope}/${e.code}) : ${error.message}`);
  } catch (err) {
    console.error(`[appErrors] ❌ journal non écrit (${e.scope}/${e.code}) : ${err.message}`);
  }
};

/** true si une alerte (scope, code) existe déjà pour cette commande (évite d'en écrire une par heure). */
exports.existsForOrder = async (scope, code, orderId) => {
  if (!orderId) return false;
  const { count, error } = await supabase.from('app_errors').select('id', { count: 'exact', head: true }).eq('scope', scope).eq('code', code).eq('order_id', orderId);
  if (error) throw error;
  return (count || 0) > 0;
};
