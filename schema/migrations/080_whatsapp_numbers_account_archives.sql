-- 080 : numéros WhatsApp vérifiés + archives des comptes supprimés.
-- whatsapp_numbers : numéro vérifié par un code LIVRÉ SUR WHATSAPP (étape OTP
-- de la boutique, WhatsApp seul, ou connexion par numéro quand Bird a livré par
-- WhatsApp ; un repli SMS ne vérifie pas le WhatsApp).
CREATE TABLE IF NOT EXISTS whatsapp_numbers (
  user_id      TEXT NOT NULL,
  phone_number TEXT NOT NULL,            -- E.164
  source       TEXT NOT NULL CHECK (source IN ('otp', 'login')),
  verified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, phone_number)
);
ALTER TABLE whatsapp_numbers ENABLE ROW LEVEL SECURITY;

-- account_archives : profil d'un compte supprimé, gardé jusqu'à retain_until.
-- 10 ans si paiements réels étalés sur au moins 1 an, sinon 90 jours ; à
-- échéance, `accountPurgeJob` efface toutes les données du compte.
CREATE TABLE IF NOT EXISTS account_archives (
  uid            TEXT PRIMARY KEY,
  user_data      JSONB NOT NULL,
  fastfood_ids   TEXT[] NOT NULL DEFAULT '{}',
  long_retention BOOLEAN NOT NULL,
  deleted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  retain_until   TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS account_archives_retain_idx ON account_archives (retain_until);
ALTER TABLE account_archives ENABLE ROW LEVEL SECURITY;

-- Boutique supprimée AVEC le compte (restaurable par son propriétaire), à
-- distinguer d'une suppression par un administrateur (jamais restaurable).
ALTER TABLE fastfoods ADD COLUMN IF NOT EXISTS deleted_reason TEXT;
