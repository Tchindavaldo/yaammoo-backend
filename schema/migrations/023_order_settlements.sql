-- ============================================================================
-- 023_order_settlements.sql
-- ============================================================================
-- Sépare le RÈGLEMENT d'une commande de sa LIVRAISON.
--
-- Problème corrigé : la migration 021 avait posé les montants globaux
-- (items_real, items_charged, payment_fee, platform_margin) sur
-- `order_deliveries`. Or toute commande a un règlement — y compris celles à
-- emporter, qui n'ont aucune livraison. Il aurait fallu créer une ligne dans une
-- table « deliveries » pour une commande sans livraison : incohérent, et pénible
-- à exploiter en statistiques plus tard.
--
--   order_settlements → UNE ligne par commande, TOUJOURS. L'argent : ce que
--                       touche le fastfood, ce que prend le prestataire, la
--                       marge plateforme.
--   order_deliveries  → une ligne UNIQUEMENT si la commande est livrée. La
--                       course : zone, prix réel, prix facturé, mutualisation.
--
-- ⚠️ Une commande à emporter est TOUT DE MÊME facturée pour la livraison : le
-- supplément est fondu dans le prix du plat depuis le home, avant que le user
-- ait choisi son mode. Sans course à verser au fastfood, ce montant part
-- INTÉGRALEMENT en marge. C'est le modèle économique retenu.
--
--   Marge pure d'une commande  =  order_settlements sans order_deliveries
--
-- Idempotent.
-- ============================================================================

-- ── 1. Table de règlement ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_settlements (
  order_id        TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,
  fastfood_id     TEXT,
  -- Panier du client (orders.group_id) recopié ici pour agréger un panier
  -- entier sans jointure sur `orders`.
  group_id        TEXT,

  -- Ce que touche le fastfood pour les articles : plat + extras + boissons,
  -- hors livraison, hors frais, hors marge.
  items_real      NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Ce que le user a réellement payé pour cette commande (TTC, frais inclus).
  items_charged   NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Frais du prestataire de paiement, CONTENUS dans items_charged.
  payment_fee     NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Bénéfice plateforme : marge plat + écart livraison. Jamais négatif — une
  -- gratuité fait renoncer à un gain, elle ne crée pas une dépense.
  platform_margin NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Mode retenu. Redondant avec l'existence d'une ligne order_deliveries, mais
  -- explicite : les stats sur la marge pure ne doivent pas dépendre d'un
  -- LEFT JOIN ... IS NULL.
  delivered       BOOLEAN NOT NULL DEFAULT TRUE,

  created_at      TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT order_settlements_margin_chk CHECK (platform_margin >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_settlements_fastfood
  ON order_settlements(fastfood_id, created_at);

CREATE INDEX IF NOT EXISTS idx_order_settlements_group
  ON order_settlements(group_id) WHERE group_id IS NOT NULL;

-- Commandes à emporter : marge pure, l'agrégat le plus consulté.
CREATE INDEX IF NOT EXISTS idx_order_settlements_pickup
  ON order_settlements(fastfood_id, created_at) WHERE delivered = FALSE;

-- ── 2. Reprise des lignes déjà écrites (migrations 020/021) ─────────────────
-- Aucune donnée attendue en production, mais un rejeu doit rester sûr.
INSERT INTO order_settlements (order_id, user_id, fastfood_id, items_real, items_charged, payment_fee, platform_margin, delivered, created_at)
SELECT order_id, user_id, fastfood_id, items_real, items_charged, payment_fee, platform_margin, TRUE, created_at
FROM order_deliveries
ON CONFLICT (order_id) DO NOTHING;

-- ── 3. `order_deliveries` ne garde que la course ────────────────────────────
ALTER TABLE order_deliveries
  DROP COLUMN IF EXISTS items_real,
  DROP COLUMN IF EXISTS items_charged,
  DROP COLUMN IF EXISTS payment_fee,
  DROP COLUMN IF EXISTS platform_margin;

-- La contrainte portait sur une colonne désormais absente.
ALTER TABLE order_deliveries
  DROP CONSTRAINT IF EXISTS order_deliveries_margin_chk;
