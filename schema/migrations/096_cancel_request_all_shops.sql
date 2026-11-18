-- ============================================================================
-- 096 — Annulation sur demande pour TOUTES les boutiques (pas seulement WhatsApp)
-- ============================================================================
-- true : le client d'une boutique gérée dans l'app DEMANDE l'annulation, le
-- marchand accepte ou refuse dans l'app (POST /order/:orderId/cancel-request/accept|refuse,
-- app >= 1.1.7). false : seules les boutiques WhatsApp (comportement d'avant).
-- Posé à false : à passer à true quand les marchands ont l'app 1.1.7.
-- Détail : architecture/order-cancel.md. Idempotente.
-- ============================================================================

INSERT INTO settings_app (key, value, description) VALUES
  ('cancel_request_all_shops', 'false'::jsonb, 'true = le client demande l''annulation au marchand pour toutes les boutiques (réponse dans l''app) ; false = boutiques WhatsApp seulement.')
ON CONFLICT (key) DO NOTHING;
