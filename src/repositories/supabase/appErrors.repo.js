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
