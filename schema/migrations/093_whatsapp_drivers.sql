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
--  - whatsapp_numbers.source + 'inbound' : numéro prouvé par un message reçu de lui
--    (le livreur écrit à Yaammoo et donne ce numéro comme numéro OM / MoMo). Un autre
--    numéro se valide par code SMS (payout_numbers), frais à la boutique.
--  - wa_conversation_messages.author : 'driver' en plus (texte libre, sans contrainte).
--  - settings_deployment.payout_number_whatsapp_min_app_version (R11) : version d'app
--    qui gère `verified: true` sans code (numéro déjà validé sur WhatsApp). 999.0.0 tant
--    que l'app ne le gère pas.
-- Idempotente.
-- ============================================================================

ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS driver_id TEXT;
CREATE INDEX IF NOT EXISTS idx_withdrawals_driver ON withdrawals (driver_id) WHERE driver_id IS NOT NULL;

ALTER TABLE whatsapp_numbers DROP CONSTRAINT IF EXISTS whatsapp_numbers_source_check;
ALTER TABLE whatsapp_numbers ADD CONSTRAINT whatsapp_numbers_source_check CHECK (source IN ('otp', 'login', 'inbound'));

INSERT INTO settings_deployment (key, value, description) VALUES
  ('payout_number_whatsapp_min_app_version', '"999.0.0"'::jsonb, 'Version d''app qui gère un numéro de retrait validé sans code SMS (déjà validé sur WhatsApp, réponse verified: true). En dessous : code SMS comme avant.')
ON CONFLICT (key) DO NOTHING;
