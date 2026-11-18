-- ============================================================================
-- 097 — Menu du jour des boutiques WhatsApp (agent IA)
-- ============================================================================
-- Chaque jour, à `ai_daily_menu_hour` (heure du Cameroun), chaque boutique WhatsApp
-- reçoit la liste de ses plats avec ses prix (message libre si la fenêtre de 24 h est
-- ouverte, sinon template `yam_menu_du_jour` + bouton « Voir mon menu ») pour confirmer
-- ce qui est disponible. Boutique sans plat : l'agent lui demande ses plats et prix
-- (texte ou photo de la carte) et les crée après confirmation.
-- Détail : architecture/whatsapp-ai.md.
--
--  - wa_daily_menu_sends : une ligne par boutique et par jour, prise AVANT l'envoi
--    (une seule machine envoie).
--  - wa_ai_pending_actions : actions menu_availability (disponibilité des plats) et
--    menu_create (création de plats), détail dans `payload`.
--
-- Réglages (settings_app) : ai_daily_menu_hour (8 ; -1 = envoi coupé),
-- ai_default_menu_image_url ('' = image servie par le backend, /assets/menu-default.png).
-- Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS wa_daily_menu_sends (
  fastfood_id  TEXT NOT NULL,
  day          DATE NOT NULL,                       -- jour au Cameroun
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (fastfood_id, day)
);
ALTER TABLE wa_daily_menu_sends ENABLE ROW LEVEL SECURITY;

ALTER TABLE wa_ai_pending_actions ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE wa_ai_pending_actions DROP CONSTRAINT IF EXISTS wa_ai_pending_actions_action_check;
ALTER TABLE wa_ai_pending_actions ADD CONSTRAINT wa_ai_pending_actions_action_check
  CHECK (action IN ('accept', 'refuse', 'finished', 'delivering', 'cancel_accept', 'cancel_refuse', 'menu_availability', 'menu_create'));

INSERT INTO settings_app (key, value, description) VALUES
  ('ai_daily_menu_hour', '8'::jsonb, 'Heure (Cameroun, 0-23) de l''envoi quotidien du menu aux boutiques WhatsApp pour confirmer les plats disponibles. -1 = envoi coupé.'),
  ('ai_default_menu_image_url', '""'::jsonb, 'Image des plats créés par l''agent IA WhatsApp en attendant la photo du marchand. Vide = image du backend (/assets/menu-default.png).')
ON CONFLICT (key) DO NOTHING;
