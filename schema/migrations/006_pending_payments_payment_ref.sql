-- ============================================================================
-- Migration: pending_payments → clé d'identité `payment_ref`
-- ============================================================================
-- PROBLÈME corrigé :
--   Avant, `end_user_ref` envoyé à MobileWallet = userId (NON unique). Deux
--   paiements du même user étaient indistinguables → le verdict était associé
--   au mauvais contexte via un fallback "dernier paiement du user".
--
-- SOLUTION :
--   `payment_ref` = ID unique généré par nous PAR paiement, envoyé comme
--   end_user_ref à MobileWallet. MobileWallet le renvoie dans le webhook →
--   lookup déterministe. `mw_transaction_id` (ID attribué par MobileWallet)
--   devient une simple colonne (idempotence du verdict), plus la PK.
--
-- Idempotence migration : IF NOT EXISTS / IF EXISTS partout.
-- ============================================================================

-- 1. Ajouter la colonne payment_ref (nullable d'abord pour les lignes existantes)
ALTER TABLE pending_payments
  ADD COLUMN IF NOT EXISTS payment_ref VARCHAR(255);

-- 2. Backfill : les anciennes lignes utilisent leur mw_transaction_id comme ref
UPDATE pending_payments
  SET payment_ref = mw_transaction_id
  WHERE payment_ref IS NULL;

-- 3. mw_transaction_id n'est plus la PK ni obligatoire
ALTER TABLE pending_payments
  DROP CONSTRAINT IF EXISTS pending_payments_pkey;

ALTER TABLE pending_payments
  ALTER COLUMN mw_transaction_id DROP NOT NULL;

-- 4. payment_ref devient la clé primaire
ALTER TABLE pending_payments
  ADD CONSTRAINT pending_payments_pkey PRIMARY KEY (payment_ref);

-- 5. Index sur mw_transaction_id (lookup d'idempotence / debug)
CREATE INDEX IF NOT EXISTS idx_pending_payments_mw_tx
  ON pending_payments(mw_transaction_id);
