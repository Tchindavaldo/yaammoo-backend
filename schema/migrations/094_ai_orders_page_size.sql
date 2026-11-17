-- ============================================================================
-- 094 — Agent IA WhatsApp : commandes remises au modèle et taille des pages
-- ============================================================================
-- Décision du 17/11/2026 : l'agent gère les commandes en cours, il ne lit pas
-- l'historique (détail : l'app). Il ne reçoit plus les commandes des 30 derniers jours
-- (environ 3 000 pour une boutique à 100 commandes par jour) : seulement les commandes en
-- cours, les `ai_orders_page_size` plus récentes d'office, les autres par pages
-- (list_orders / list_my_orders). Sur demande : une commande par son n° (get_order) et le
-- bilan d'un jour (day_summary). Détail : architecture/whatsapp-ai.md. Idempotente.
-- ============================================================================

INSERT INTO settings_app (key, value, description) VALUES
  ('ai_orders_page_size', '20'::jsonb, 'Agent IA WhatsApp : commandes en cours montrées d''office au modèle, et commandes au plus par page (list_orders, list_my_orders).')
ON CONFLICT (key) DO NOTHING;
