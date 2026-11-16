-- ============================================================================
-- 091 — Annulation sur demande (boutique WhatsApp)
-- ============================================================================
-- Boutique WhatsApp : le client ne peut plus annuler seul une commande en attente,
-- il le DEMANDE au marchand (order.cancelRequest, dans orders.extra_data : aucune
-- colonne). Détail : architecture/order-cancel.md (« Annulation sur demande »).
--
--  - cancel_request_min_app_version (settings_deployment, R11) : version d'app qui
--    affiche « En attente de la réponse du marchand ». Sous le seuil : refus 409
--    portant le message (au lieu d'un succès lu « Commande annulée »).
--    Valeur : 1.1.5 en test (OTA), 1.1.6 en PROD (appliquée le 16/11/2026 : l'app 1.1.5
--    des stores ne gère pas la demande).
--  - wa_ai_pending_actions : l'agent IA peut aussi proposer d'accepter / refuser
--    la demande (actions cancel_accept, cancel_refuse).
-- Idempotente.
-- ============================================================================

INSERT INTO settings_deployment (key, value, description) VALUES
  ('cancel_request_min_app_version', '"1.1.5"'::jsonb, 'Version d''app qui gère l''annulation sur demande (boutique WhatsApp : « En attente de la réponse du marchand »). En dessous : refus 409 avec le message.')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE wa_ai_pending_actions DROP CONSTRAINT IF EXISTS wa_ai_pending_actions_action_check;
ALTER TABLE wa_ai_pending_actions ADD CONSTRAINT wa_ai_pending_actions_action_check
  CHECK (action IN ('accept', 'refuse', 'finished', 'delivering', 'cancel_accept', 'cancel_refuse'));
