-- ============================================================================
-- Migration: Retraits marchand (withdrawals)
-- ============================================================================
-- Le portefeuille marchand est CALCULÉ depuis la table `transactions`
-- (crédits `merchant_credit` − débits `withdrawal`), il n'y a donc pas de
-- colonne de solde figée. Cette table trace les DEMANDES de retrait et leur
-- statut (cycle de vie côté payout MobileWallet).
--
-- Quand un retrait est demandé (POST /wallet/withdraw) :
--   1. on vérifie le solde dérivé (>= montant),
--   2. on insère une ligne ici (status='pending'),
--   3. on crée une transaction `type='withdrawal'` (débite le solde dérivé),
--   4. (à venir) on appelle l'endpoint MobileWallet payout → status completed/failed.
--
-- Idempotence: "IF NOT EXISTS" → safe si migration rejouée.
-- ============================================================================

CREATE TABLE IF NOT EXISTS withdrawals (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,            -- marchand (users.id propriétaire du fastfood)
  fastfood_id     TEXT,
  amount          NUMERIC(12,2) NOT NULL,
  phone           TEXT,
  network         TEXT,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | completed | failed
  mw_payout_id    TEXT,                     -- rempli quand l'appel MobileWallet sera branché
  failure_reason  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Historique des retraits d'un marchand
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);
