// ============================================================================
// WA daily menu sends Repository — Supabase (migration 097)
// Boutiques WhatsApp qui ont déjà reçu leur menu du jour (utils/whatsappDailyMenuJob.js).
// ============================================================================
const { supabase } = require('../../config/supabase');

const TABLE = 'wa_daily_menu_sends';

/** Prend les boutiques à servir pour `day` (AAAA-MM-JJ) : renvoie seulement les ids nouvellement insérés (une seule machine envoie). */
exports.claim = async (fastFoodIds, day) => {
  if (!fastFoodIds?.length) return [];
  const rows = fastFoodIds.map(id => ({ fastfood_id: id, day, sent_at: new Date().toISOString() }));
  const { data, error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'fastfood_id,day', ignoreDuplicates: true }).select('fastfood_id');
  if (error) throw error;
  return (data || []).map(r => r.fastfood_id);
};

/** Efface les lignes antérieures à `beforeDay` (AAAA-MM-JJ). */
exports.purgeBefore = async beforeDay => {
  const { error } = await supabase.from(TABLE).delete().lt('day', beforeDay);
  if (error) throw error;
};
