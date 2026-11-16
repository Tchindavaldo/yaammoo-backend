// ============================================================================
// Mappers WhatsApp — conversation marchand, actions IA en attente, messages
// boutique → client (migration 090). Séparés de mappers.js (plafond R3),
// réexportés par lui.
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

const waClientMessageFromSupabase = row =>
  row
    ? {
        id: row.id,
        orderId: row.order_id,
        fastFoodId: row.fastfood_id,
        userId: row.user_id,
        text: row.text,
        expectsAnswer: row.expects_answer === true,
        answer: row.answer,
        status: row.status,
        createdAt: row.created_at,
        answeredAt: row.answered_at,
      }
    : null;

const waClientMessageToSupabase = d => ({
  id: d.id,
  order_id: d.orderId,
  fastfood_id: d.fastFoodId,
  user_id: d.userId,
  text: d.text,
  expects_answer: d.expectsAnswer === true,
});

module.exports = {
  waMessage: { toSupabase: waMessageToSupabase, fromSupabase: waMessageFromSupabase },
  waPendingAction: { toSupabase: waPendingActionToSupabase, fromSupabase: waPendingActionFromSupabase },
  waClientMessage: { toSupabase: waClientMessageToSupabase, fromSupabase: waClientMessageFromSupabase },
};
