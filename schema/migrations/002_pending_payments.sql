-- ============================================================================
-- Migration: Persistance du contexte de paiement MobileWallet (pending_payments)
-- ============================================================================
-- Remplace la Map en mémoire `mwTransactionMap` (volatile, non multi-instance).
--
-- Au moment de l'initiation (`POST /transaction`, payBy=mobilemoney), on persiste
-- ici le contexte de commande lié au paiement. Quand le verdict arrive (webhook
-- HTTP OU socket MobileWallet), on relit cette ligne pour retrouver userId +
-- contexte de commande et déclencher la confirmation.
--
-- Lookup:
--   - par mw_transaction_id (clé primaire)
--   - fallback par user_id (MobileWallet peut renvoyer un tx_id différent)
--
-- Idempotence:
--   - "IF NOT EXISTS" → safe si migration rejouée
-- ============================================================================

CREATE TABLE IF NOT EXISTS pending_payments (
  mw_transaction_id VARCHAR(255) PRIMARY KEY,
  user_id           VARCHAR(255) NOT NULL,
  order_id          VARCHAR(255),
  fastfood_id       VARCHAR(255),
  items             JSONB,
  order_ctx         JSONB,
  amount            NUMERIC,
  network           VARCHAR(50),
  phone             VARCHAR(50),
  email             VARCHAR(255),
  status            VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fallback lookup par user_id quand le tx_id diffère
CREATE INDEX IF NOT EXISTS idx_pending_payments_user_id
  ON pending_payments(user_id);

-- Pour purge des entrées anciennes (cron éventuel)
CREATE INDEX IF NOT EXISTS idx_pending_payments_created_at
  ON pending_payments(created_at);
