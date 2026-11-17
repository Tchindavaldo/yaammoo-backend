-- ============================================================================
-- 094 — Agent IA WhatsApp : commandes chargées d'office et taille des pages
-- ============================================================================
-- Décision du 17/11/2026 : l'agent ne reçoit plus d'office les commandes des 30 derniers
-- jours (environ 3 000 pour une boutique à 100 commandes par jour). Il reçoit toutes les
-- commandes en cours, plus les terminées des `ai_orders_window_days` derniers jours ; au-delà,
-- il cherche lui-même en base (outils list_orders / list_my_orders par pages, get_order par
-- numéro, sans limite de date). La conversation garde ai_conversation_retention_days (30).
-- Détail : architecture/whatsapp-ai.md. Idempotente.
-- ============================================================================

INSERT INTO settings_app (key, value, description) VALUES
  ('ai_orders_window_days', '3'::jsonb, 'Agent IA WhatsApp : jours de commandes terminées (livrées, annulées) remises d''office au modèle. Les commandes en cours le sont toutes ; au-delà, l''agent cherche en base.'),
  ('ai_orders_page_size', '20'::jsonb, 'Agent IA WhatsApp : commandes au plus par page de recherche (list_orders, list_my_orders) et commandes en cours montrées d''office.')
ON CONFLICT (key) DO NOTHING;
