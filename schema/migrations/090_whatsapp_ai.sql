-- ============================================================================
-- 090 — Agent IA des boutiques WhatsApp (OpenRouter)
-- ============================================================================
-- Le marchand WhatsApp écrit librement (fenêtre de 24 h ouverte) : un agent IA lit
-- toute la conversation et les commandes de la boutique, répond, et agit par les
-- services existants. Détail : architecture/whatsapp-ai.md.
--
--  - wa_conversation_messages : chaque message reçu du numéro d'une boutique ou
--    envoyé vers lui (historique lu par l'agent), gardé
--    `ai_conversation_retention_days` jours (purge : utils/whatsappAiPurgeJob.js).
--  - wa_ai_pending_actions : action proposée par l'agent (accepter, refuser,
--    avancer un statut), exécutée seulement après confirmation du marchand
--    (bouton Confirmer ou réponse écrite).
--
-- Réglages (settings_app) : ai_enabled, ai_models (essayés dans l'ordre),
-- ai_timeout_ms, ai_conversation_retention_days, ai_history_max_messages.
-- Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS wa_conversation_messages (
  id          BIGSERIAL PRIMARY KEY,
  phone       TEXT NOT NULL,                       -- numéro E.164 de la boutique
  direction   TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  author      TEXT NOT NULL DEFAULT 'system',      -- merchant | ai | system
  kind        TEXT NOT NULL DEFAULT 'text',        -- text, button, interactive, template, image, audio…
  body        TEXT NOT NULL DEFAULT '',
  message_id  TEXT,                                -- id Rauval (entrant) ou id d'envoi
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_conv_phone_created ON wa_conversation_messages (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conv_created ON wa_conversation_messages (created_at);
ALTER TABLE wa_conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS wa_ai_pending_actions (
  id           TEXT PRIMARY KEY,
  phone        TEXT NOT NULL,
  fastfood_id  TEXT NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('accept', 'refuse', 'finished', 'delivering')),
  order_ids    JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary      TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled', 'expired')),
  result       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wa_ai_pending_phone_status ON wa_ai_pending_actions (phone, status);
ALTER TABLE wa_ai_pending_actions ENABLE ROW LEVEL SECURITY;

INSERT INTO settings_app (key, value, description) VALUES
  ('ai_enabled', 'true'::jsonb, 'Agent IA des boutiques WhatsApp : true = les messages libres du marchand sont traités par l''IA (OpenRouter).'),
  ('ai_models', '["z-ai/glm-5.3-flash", "qwen/qwen3.7-flash"]'::jsonb, 'Modèles OpenRouter de l''agent IA WhatsApp, essayés dans l''ordre (repli si le premier échoue). [] = IA coupée.'),
  ('ai_timeout_ms', '30000'::jsonb, 'Délai max (ms) d''un appel OpenRouter de l''agent IA WhatsApp.'),
  ('ai_conversation_retention_days', '30'::jsonb, 'Jours de conservation des conversations WhatsApp marchands (agent IA).'),
  ('ai_history_max_messages', '100'::jsonb, 'Nombre max de messages de la conversation relus par l''agent IA à chaque réponse.')
ON CONFLICT (key) DO NOTHING;
