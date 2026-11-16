// ============================================================================
// Mappers WhatsApp — conversation (marchand, livreur), actions IA en attente
// (migration 090).
// Séparés de mappers.js (plafond R3), réexportés par lui.
// ============================================================================

const waMessageFromSupabase = row =>
  row
    ? {
        id: row.id,
        phone: row.phone,
        direction: row.direction,
        author: row.author,
        kind: row.kind,
        body: row.body,
        messageId: row.message_id,
        createdAt: row.created_at,
      }
    : null;

const waMessageToSupabase = d => ({
  phone: d.phone,
  direction: d.direction,
  author: d.author || 'system',
  kind: d.kind || 'text',
  body: d.body || '',
  message_id: d.messageId ?? null,
});

const waPendingActionFromSupabase = row =>
  row
    ? {
        id: row.id,
        phone: row.phone,
        fastFoodId: row.fastfood_id,
        action: row.action,
        orderIds: Array.isArray(row.order_ids) ? row.order_ids : [],
        summary: row.summary,
        status: row.status,
        result: row.result,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
      }
    : null;

const waPendingActionToSupabase = d => ({
  id: d.id,
  phone: d.phone,
  fastfood_id: d.fastFoodId,
  action: d.action,
  order_ids: d.orderIds || [],
  summary: d.summary || '',
});

module.exports = {
  waMessage: { toSupabase: waMessageToSupabase, fromSupabase: waMessageFromSupabase },
  waPendingAction: { toSupabase: waPendingActionToSupabase, fromSupabase: waPendingActionFromSupabase },
};
