-- ============================================================================
-- 102 — Marchands et livreurs en mode « app seule » (WhatsApp coupé)
-- ============================================================================
-- Deux modes seulement (décision du 18/11/2026) : « les 2 » (WhatsApp + app, défaut, pas de
-- ligne) ou « app seule » (une ligne ici). À chaque connexion à l'app par code, l'agent
-- demande sur WhatsApp s'il garde le mode WhatsApp. App seule : marchand = boutique WhatsApp
-- coupée, livreur = plus aucun message WhatsApp. S'il écrit, l'agent propose de réactiver.
-- Les données restent les mêmes : le compte est le même dans l'app et sur WhatsApp.
-- Détail : architecture/whatsapp-ai.md (« Mode app seule »). Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS wa_app_only (
  user_id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('merchant', 'driver')),
  fastfood_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wa_app_only_phone_idx ON wa_app_only (phone);
ALTER TABLE wa_app_only ENABLE ROW LEVEL SECURITY;
