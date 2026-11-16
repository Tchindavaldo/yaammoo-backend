-- ============================================================================
-- 092 — Renvoi d'une demande d'annulation sans réponse (boutique WhatsApp)
-- ============================================================================
-- Le marchand WhatsApp ne répond pas à la demande d'annulation du client : passé
-- ce délai (`order.cancelRequest.resendAt`), l'app propose « Renvoyer la demande »
-- et le marchand reçoit une relance. Détail : architecture/order-cancel.md.
-- Idempotente.
-- ============================================================================

INSERT INTO settings_app (key, value, description) VALUES
  ('cancel_request_resend_minutes', '15'::jsonb, 'Minutes sans réponse du marchand WhatsApp avant que le client puisse renvoyer sa demande d''annulation.')
ON CONFLICT (key) DO NOTHING;
