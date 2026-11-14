-- ============================================================================
-- 075 — Remboursements d'annulation (order_refunds)
-- ============================================================================
-- Une commande PAYÉE annulée (client ou marchand) est remboursée au client par
-- un payout MobileWallet, sur le numéro et le réseau du paiement d'origine.
-- Une ligne par (commande, kind) : un rejeu ne rembourse jamais deux fois.
--   kind = 'order'  : remboursement à l'annulation ;
--   kind = 'course' : course gardée à l'annulation (le départ avait d'autres
--                     commandes), rendue quand le départ n'a plus de commande.
-- Calcul : architecture/order-cancel.md. Idempotente.
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_refunds (
  id                TEXT PRIMARY KEY,
  order_id          TEXT NOT NULL,
  user_id           TEXT NOT NULL,
  fastfood_id       TEXT,
  cancelled_by      TEXT NOT NULL,              -- 'user' | 'fastfood'
  kind              TEXT NOT NULL DEFAULT 'order',
  paid              NUMERIC NOT NULL,           -- base remboursable (payé pour cette part)
  fees_kept         NUMERIC NOT NULL DEFAULT 0, -- frais réels retenus au client
  amount            NUMERIC NOT NULL,           -- envoyé au client
  merchant_debit    NUMERIC NOT NULL DEFAULT 0, -- débité du solde marchand
  course_kept       NUMERIC NOT NULL DEFAULT 0, -- course gardée (kind 'order')
  course_released   BOOLEAN NOT NULL DEFAULT false,
  delivery_group_id TEXT,
  phone             TEXT,
  network           TEXT,
  aggregator        TEXT,
  status            TEXT NOT NULL DEFAULT 'pending', -- pending | completed | failed | manual
  mw_payout_id      TEXT,
  failure_reason    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_refunds_order_kind_uniq UNIQUE (order_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_order_refunds_payout ON order_refunds (mw_payout_id);
CREATE INDEX IF NOT EXISTS idx_order_refunds_group ON order_refunds (delivery_group_id);
ALTER TABLE order_refunds ENABLE ROW LEVEL SECURITY;

-- Groupage : une commande qui rejoint un départ déjà payé porte sa course
-- comme offerte, tracée `free_reason = 'grouped'`.
ALTER TABLE order_deliveries DROP CONSTRAINT IF EXISTS order_deliveries_free_reason_chk;
ALTER TABLE order_deliveries ADD CONSTRAINT order_deliveries_free_reason_chk
  CHECK (free_reason IS NULL OR free_reason IN ('bonus', 'campaign', 'grouped'));
