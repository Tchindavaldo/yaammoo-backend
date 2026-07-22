-- ============================================================================
-- 020_order_deliveries.sql
-- ============================================================================
-- Vérité COMPTABLE de la livraison d'une commande.
--
-- Jusqu'ici, `orders.delivery` (JSONB) ne portait qu'un seul montant : `prix`.
-- Impossible d'y distinguer les trois montants qui n'ont pas le même
-- destinataire ni la même audience :
--
--   real_price      → ce que touche le fastfood (prix de la zone choisie)
--   charged_price   → ce que le user a payé pour la livraison
--   platform_margin → l'écart, bénéfice Yaammoo (JAMAIS négatif)
--
-- Le user voit `charged_price`, le fastfood voit `real_price`, la plateforme
-- voit l'écart : trois audiences, trois montants, une seule commande.
--
-- ⚠️ `orders.delivery` n'est NI supprimé NI modifié : les apps en production le
-- lisent. Cette table le complète, elle ne le remplace pas — aucune rupture de
-- compatibilité, donc aucun seuil de version d'app à gérer ici.
--
-- Idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_deliveries (
  order_id        TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,
  fastfood_id     TEXT,

  zone            TEXT,
  real_price      NUMERIC(12,2) NOT NULL DEFAULT 0,
  charged_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
  platform_margin NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Motif de gratuité. NULL = livraison facturée normalement.
  free_reason     TEXT,
  -- Qui renonce au montant : 'fastfood' (bonus de boutique) ou 'platform'
  -- (bonus plateforme / campagne). NULL si pas de gratuité.
  covered_by      TEXT,
  bonus_id        TEXT,
  bonus_code      TEXT,

  created_at      TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT order_deliveries_free_reason_chk
    CHECK (free_reason IS NULL OR free_reason IN ('bonus', 'campaign')),
  CONSTRAINT order_deliveries_covered_by_chk
    CHECK (covered_by IS NULL OR covered_by IN ('fastfood', 'platform')),
  -- La marge plateforme n'est jamais négative : la gratuité fait renoncer à un
  -- gain, elle ne crée pas une dépense.
  CONSTRAINT order_deliveries_margin_chk CHECK (platform_margin >= 0)
);

-- Comptabilité : marge par boutique et par période.
CREATE INDEX IF NOT EXISTS idx_order_deliveries_fastfood
  ON order_deliveries(fastfood_id, created_at);

-- Suivi de l'usage réel des bonus livraison.
CREATE INDEX IF NOT EXISTS idx_order_deliveries_bonus
  ON order_deliveries(bonus_id) WHERE bonus_id IS NOT NULL;
