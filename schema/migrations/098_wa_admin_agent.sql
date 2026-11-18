-- ============================================================================
-- 098 — Agent IA admin sur WhatsApp (super-administrateurs de la plateforme)
-- ============================================================================
-- Les super-administrateurs (numéros de `ai_admin_phones`) sont prévenus sur WhatsApp
-- quand l'agent d'une boutique ou d'un livreur bute sur un problème grave
-- (alert_admin) et à chaque message d'un utilisateur au support de la plateforme
-- (fil sans boutique). Ils pilotent ensuite par un agent IA admin : répondre au
-- support, relayer au marchand ou au livreur, push, boutiques, commandes, réglages,
-- chaque action confirmée par les boutons Confirmer / Annuler.
-- Détail : architecture/whatsapp-ai.md.
--
--  - wa_admin_alerts  : alertes envoyées aux administrateurs (ouvertes / closes).
--  - wa_admin_actions : actions proposées par l'agent admin, exécutées après confirmation.
--  - wa_ai_pending_actions : action push_customers (push d'une boutique WhatsApp à ses
--    clients, dans le quota de son plan).
--
-- Réglage (settings_app) : ai_admin_phones ([] = personne ; numéros E.164 posés à part,
-- jamais dans le dépôt).
-- Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS wa_admin_alerts (
  id            TEXT PRIMARY KEY,
  source        TEXT NOT NULL CHECK (source IN ('merchant', 'driver', 'support')),
  source_phone  TEXT,                                   -- WhatsApp du marchand / livreur (null : support)
  fastfood_id   TEXT,
  thread_id     TEXT,                                   -- fil support (source = support)
  summary       TEXT NOT NULL,
  details       TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wa_admin_alerts_status ON wa_admin_alerts (status, created_at DESC);
ALTER TABLE wa_admin_alerts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS wa_admin_actions (
  id           TEXT PRIMARY KEY,
  phone        TEXT NOT NULL,                           -- administrateur qui a donné l'ordre
  action       TEXT NOT NULL,
  params       JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary      TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled', 'expired')),
  result       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wa_admin_actions_phone_status ON wa_admin_actions (phone, status);
ALTER TABLE wa_admin_actions ENABLE ROW LEVEL SECURITY;

-- Boutique WhatsApp : l'agent propose aussi une notification push à ses clients (quota
-- du plan de la boutique), confirmée par les boutons comme les autres propositions.
ALTER TABLE wa_ai_pending_actions DROP CONSTRAINT IF EXISTS wa_ai_pending_actions_action_check;
ALTER TABLE wa_ai_pending_actions ADD CONSTRAINT wa_ai_pending_actions_action_check
  CHECK (action IN ('accept', 'refuse', 'finished', 'delivering', 'cancel_accept', 'cancel_refuse', 'menu_availability', 'menu_create', 'push_customers'));

INSERT INTO settings_app (key, value, description) VALUES
  ('ai_admin_phones', '[]'::jsonb, 'Numéros WhatsApp (E.164) des super-administrateurs : alertes de l''agent IA, messages au support de la plateforme, agent admin. [] = personne.')
ON CONFLICT (key) DO NOTHING;
