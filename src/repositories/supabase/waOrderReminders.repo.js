// ============================================================================
// WA order reminders Repository — Supabase (migration 087)
// Commandes déjà rappelées au marchand sur WhatsApp (utils/whatsappReminderJob.js).
// ============================================================================
const { supabase } = require('../../config/supabase');

/** Prend les commandes à rappeler : renvoie seulement les ids nouvellement insérés (une seule machine envoie). */
exports.claim = async orderIds => {
  if (!orderIds?.length) return [];
  const rows = orderIds.map(id => ({ order_id: id, sent_at: new Date().toISOString() }));
  const { data, error } = await supabase.from('wa_order_reminders').upsert(rows, { onConflict: 'order_id', ignoreDuplicates: true }).select('order_id');
  if (error) throw error;
  return (data || []).map(r => r.order_id);
};

/** Ids déjà rappelés parmi ceux-ci. */
exports.sentAmong = async orderIds => {
  if (!orderIds?.length) return [];
  const { data, error } = await supabase.from('wa_order_reminders').select('order_id').in('order_id', orderIds);
  if (error) throw error;
  return (data || []).map(r => r.order_id);
};
