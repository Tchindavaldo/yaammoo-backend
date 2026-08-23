-- ============================================================================
-- 045_phone_auth_bird.sql
-- Authentification par numéro de téléphone via Bird (Verify API).
-- ============================================================================
-- Deux tables :
--   phone_otp   : trace de la demande en cours (verification_id Bird + cooldown)
--   bird_costs  : journal des coûts Bird (Bird n'expose aucune vue agrégée)
--
-- Le CODE OTP n'est JAMAIS stocké : Bird le génère, le valide, gère son
-- expiration et le nombre de tentatives. On ne conserve que l'identifiant de
-- vérification, nécessaire à l'étape de contrôle et à la lecture du coût.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE: phone_otp
-- ----------------------------------------------------------------------------
-- Une ligne par numéro (le numéro E.164 est la clé) : une nouvelle demande
-- écrase la précédente. `created_at` porte le verrou anti-renvoi (cooldown).
CREATE TABLE IF NOT EXISTS phone_otp (
  phone_number    TEXT PRIMARY KEY,
  verification_id TEXT NOT NULL,
  user_id         TEXT,
  status          TEXT DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phone_otp_verification_id ON phone_otp(verification_id);

-- ----------------------------------------------------------------------------
-- TABLE: bird_costs
-- ----------------------------------------------------------------------------
-- Journal des dépenses Bird. Une ligne est écrite dès l'envoi (coût encore
-- inconnu : Bird ne le résout qu'une fois les tentatives de livraison
-- terminées), puis complétée à la vérification. Les demandes jamais validées
-- restent donc visibles en `pending` plutôt que d'être absentes.
CREATE TABLE IF NOT EXISTS bird_costs (
  id                   TEXT PRIMARY KEY,          -- verification_id
  phone_number         TEXT,
  email                TEXT,
  user_id              TEXT,
  status               TEXT DEFAULT 'pending',
  destination_country  TEXT,
  total_cost           NUMERIC(12, 4),
  currency_code        TEXT,
  -- Une entrée par canal tenté par Bird : WhatsApp d'abord, SMS en repli si la
  -- livraison échoue. Chaque tentative porte son propre coût et ses segments.
  attempts             JSONB DEFAULT '[]'::jsonb,
  delivered_channel    TEXT,
  verified             BOOLEAN DEFAULT FALSE,
  send_count           INTEGER DEFAULT 1,
  sent_at              TIMESTAMPTZ DEFAULT NOW(),
  last_sent_at         TIMESTAMPTZ DEFAULT NOW(),
  resolved_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bird_costs_sent_at ON bird_costs(sent_at);
CREATE INDEX IF NOT EXISTS idx_bird_costs_phone_number ON bird_costs(phone_number);
-- Résolution des coûts en attente : filtre `total_cost IS NULL`.
CREATE INDEX IF NOT EXISTS idx_bird_costs_pending ON bird_costs(sent_at) WHERE total_cost IS NULL;
