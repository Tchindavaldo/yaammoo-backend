-- ============================================================================
-- 093 — Livreurs des boutiques WhatsApp (agent IA livreur, versement au livreur)
-- ============================================================================
-- Boutique WhatsApp : le marchand confie ses commandes à un livreur rattaché ; l'agent
-- IA échange avec le livreur sur WhatsApp. Au scan du QR du client par le livreur, la
-- part du marchand part sur le numéro Orange Money / MTN MoMo du livreur.
-- Détail : architecture/whatsapp-ai.md, architecture/wallet.md.
--
--  - withdrawals.driver_id : livreur qui a reçu le versement d'une commande (kind 'order').
--    Le débit reste sur le solde du marchand (user_id).
--  - wa_number_claims : validation sans code d'un numéro OM / MoMo par WhatsApp. Le
--    livreur reçoit un lien qui ouvre WhatsApp sur le téléphone de ce numéro avec
--    « NUMERO <jeton> » ; le message reçu DE ce numéro prouve qu'il le détient.
--  - whatsapp_numbers.source + 'inbound' : numéro prouvé par un message reçu de lui
--    (le livreur écrit à Yaammoo, ou envoie « NUMERO <jeton> »).
--  - wa_conversation_messages.author : 'driver' en plus (texte libre, sans contrainte).
--  - settings_app.wa_number_claim_ttl_minutes : durée de validité du lien (30 min).
--  - settings_deployment.payout_number_whatsapp_min_app_version (R11) : version d'app
--    qui gère `verified: true` sans code (numéro déjà validé sur WhatsApp). 999.0.0 tant
--    que l'app ne le gère pas.
-- Idempotente.
-- ============================================================================

ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS driver_id TEXT;
CREATE INDEX IF NOT EXISTS idx_withdrawals_driver ON withdrawals (driver_id) WHERE driver_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS wa_number_claims (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,                 -- compte qui enregistre le numéro (livreur)
  phone       TEXT NOT NULL,                 -- numéro OM / MoMo à prouver (E.164)
  purpose     TEXT NOT NULL DEFAULT 'payout_number' CHECK (purpose IN ('payout_number')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wa_number_claims_user ON wa_number_claims (user_id, created_at DESC);
ALTER TABLE wa_number_claims ENABLE ROW LEVEL SECURITY;

ALTER TABLE whatsapp_numbers DROP CONSTRAINT IF EXISTS whatsapp_numbers_source_check;
ALTER TABLE whatsapp_numbers ADD CONSTRAINT whatsapp_numbers_source_check CHECK (source IN ('otp', 'login', 'inbound'));

INSERT INTO settings_app (key, value, description) VALUES
  ('wa_number_claim_ttl_minutes', '30'::jsonb, 'Minutes de validité du lien WhatsApp qui valide sans code un numéro OM / MoMo de livreur.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings_deployment (key, value, description) VALUES
  ('payout_number_whatsapp_min_app_version', '"999.0.0"'::jsonb, 'Version d''app qui gère un numéro de retrait validé sans code SMS (déjà validé sur WhatsApp, réponse verified: true). En dessous : code SMS comme avant.')
ON CONFLICT (key) DO NOTHING;
