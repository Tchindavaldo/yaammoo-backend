-- ============================================================================
-- 087 — Rappel WhatsApp d'une nouvelle commande sans réponse (yam_rappel_commande)
-- ============================================================================
-- Boutique WhatsApp : une commande payée encore `pending` au bout de
-- `whatsapp_reminder_minutes` minutes reçoit UN rappel (utils/whatsappReminderJob.js).
-- `wa_order_reminders` garde les commandes déjà rappelées : la ligne est prise
-- avant l'envoi (une seule machine envoie). 0 en base = rappel désactivé.
-- Idempotente. Détail : architecture/whatsapp.md.
-- ============================================================================

CREATE TABLE IF NOT EXISTS wa_order_reminders (
  order_id TEXT PRIMARY KEY,
  sent_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE wa_order_reminders ENABLE ROW LEVEL SECURITY;

INSERT INTO settings_app (key, value, description) VALUES
  ('whatsapp_reminder_minutes', '10'::jsonb, 'Minutes sans réponse du marchand (boutique WhatsApp) avant le rappel yam_rappel_commande. 0 = désactivé.')
ON CONFLICT (key) DO NOTHING;
