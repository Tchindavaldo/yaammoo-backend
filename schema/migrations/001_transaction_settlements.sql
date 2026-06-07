-- ============================================================================
-- Migration: Idempotence des verdicts (webhook + socket)
-- ============================================================================
-- Cette table garantit qu'un verdict (socket OU webhook) n'est traité qu'UNE FOIS,
-- même si les deux canaux envoient le signal en parallèle.
--
-- Schéma:
--   - transaction_id: référence unique au paiement MobileWallet
--   - settled_by: 'socket' | 'webhook' — qui a traité en premier
--   - status: statut final ('successful' | 'cancelled' | 'failed')
--   - settled_at: horodate du règlement
--
-- Utilisation:
--   - Avant de traiter un verdict, réserver: INSERT OR UPDATE
--   - Si déjà présent, l'autre chemin (socket/webhook) l'a déjà traité → skip
--
-- Idempotence:
--   - "IF NOT EXISTS" → safe si migration rejouée
-- ============================================================================

-- Pour Firestore (émulation via une collection)
-- Note: Firestore ne supporte pas les constraints UNIQUE directement,
-- donc on utilise le pattern document ID = transaction_id pour garantir l'unicité.

-- Pour Supabase (PostgreSQL natif)
CREATE TABLE IF NOT EXISTS transaction_settlements (
  id BIGSERIAL PRIMARY KEY,
  transaction_id VARCHAR(255) UNIQUE NOT NULL,
  settled_by VARCHAR(20) NOT NULL CHECK (settled_by IN ('socket', 'webhook')),
  status VARCHAR(50) NOT NULL,
  settled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index sur transaction_id pour les lookups rapides
CREATE INDEX IF NOT EXISTS idx_transaction_settlements_tx_id
  ON transaction_settlements(transaction_id);

-- Index sur settled_by pour auditer qui a traité
CREATE INDEX IF NOT EXISTS idx_transaction_settlements_settled_by
  ON transaction_settlements(settled_by);
