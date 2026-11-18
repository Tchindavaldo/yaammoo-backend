// ============================================================================
// Mappers WhatsApp — conversation (marchand, livreur), actions IA en attente
// (migration 090), alertes et actions de l'agent admin (migration 098).
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
        payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
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
  payload: d.payload || {},
  summary: d.summary || '',
});

// Alertes aux super-administrateurs (migration 098).
const waAdminAlertFromSupabase = row =>
  row
    ? {
        id: row.id,
        source: row.source,
        sourcePhone: row.source_phone,
        fastFoodId: row.fastfood_id,
        threadId: row.thread_id,
        summary: row.summary,
        details: row.details,
        status: row.status,
        createdAt: row.created_at,
        closedAt: row.closed_at,
      }
    : null;

const waAdminAlertToSupabase = d => ({
  id: d.id,
  source: d.source,
  source_phone: d.sourcePhone ?? null,
  fastfood_id: d.fastFoodId ?? null,
  thread_id: d.threadId ?? null,
  summary: d.summary || '',
  details: d.details || '',
});

// Actions de l'agent admin en attente de confirmation (migration 098).
const waAdminActionFromSupabase = row =>
  row
    ? {
        id: row.id,
        phone: row.phone,
        action: row.action,
        params: row.params && typeof row.params === 'object' ? row.params : {},
        summary: row.summary,
        status: row.status,
        result: row.result,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
      }
    : null;

const waAdminActionToSupabase = d => ({
  id: d.id,
  phone: d.phone,
  action: d.action,
  params: d.params || {},
  summary: d.summary || '',
});

module.exports = {
  waMessage: { toSupabase: waMessageToSupabase, fromSupabase: waMessageFromSupabase },
  waPendingAction: { toSupabase: waPendingActionToSupabase, fromSupabase: waPendingActionFromSupabase },
  waAdminAlert: { toSupabase: waAdminAlertToSupabase, fromSupabase: waAdminAlertFromSupabase },
  waAdminAction: { toSupabase: waAdminActionToSupabase, fromSupabase: waAdminActionFromSupabase },
};
