-- ============================================================================
-- 037_withdrawal_fees_platform_delivery.sql
-- ============================================================================
-- Deux évolutions tarifaires :
--
-- 1. FRAIS DE RETRAIT (MTN / Orange). L'argent encaissé doit ressortir du
--    portefeuille de l'opérateur, et ce retrait coûte. Ce coût était supporté
--    en silence ; il entre désormais dans le prix affiché, comme la commission
--    de l'agrégateur. Barème à SEUIL : un montant fixe en dessous, un
--    pourcentage + un fixe au-dessus.
--
--    Chaque opérateur a ses PROPRES valeurs (mêmes chiffres aujourd'hui, mais
--    des clés distinctes : un opérateur qui change son barème ne doit pas
--    entraîner l'autre).
--
-- 2. LIVRAISON PLATEFORME. Une boutique est livrée soit par elle-même, soit par
--    la plateforme (`fastfoods.delivery_by`, décidé par l'admin) :
--
--      'fastfood'  → régime actuel : zone la plus chère, aucun arrondi, la
--                    course n'est pas amortie.
--      'platform'  → zones PLATEFORME (`fastfoods.platform_delivery_hours`),
--                    prix affiché calé sur un multiple de `price_rounding_step`.
--                    Descendre plutôt que monter tant que le manque reste sous
--                    `driver_amortization_max` : c'est la course du livreur qui
--                    l'absorbe. Tout surplus revient à la plateforme.
--
-- Idempotente : rejouable sans effet de bord.
-- ============================================================================

-- ── 1. Réglages tarifaires (pilotables à chaud, cf. 019) ───────────────────
INSERT INTO settings (key, value, description) VALUES
  ('withdrawal_fee_mtn_threshold',
   '4200'::jsonb,
   'MTN — seuil (FCFA) séparant le frais fixe du barème en pourcentage.'),
  ('withdrawal_fee_mtn_flat',
   '54'::jsonb,
   'MTN — frais de retrait fixe (FCFA) appliqué SOUS le seuil.'),
  ('withdrawal_fee_mtn_percent',
   '1.2'::jsonb,
   'MTN — frais de retrait en % appliqué AU-DESSUS du seuil.'),
  ('withdrawal_fee_mtn_addend',
   '4'::jsonb,
   'MTN — fixe (FCFA) ajouté au pourcentage au-dessus du seuil.'),

  ('withdrawal_fee_orange_threshold',
   '4200'::jsonb,
   'Orange — seuil (FCFA) séparant le frais fixe du barème en pourcentage.'),
  ('withdrawal_fee_orange_flat',
   '54'::jsonb,
   'Orange — frais de retrait fixe (FCFA) appliqué SOUS le seuil.'),
  ('withdrawal_fee_orange_percent',
   '1.2'::jsonb,
   'Orange — frais de retrait en % appliqué AU-DESSUS du seuil.'),
  ('withdrawal_fee_orange_addend',
   '4'::jsonb,
   'Orange — fixe (FCFA) ajouté au pourcentage au-dessus du seuil.'),

  ('price_rounding_step',
   '500'::jsonb,
   'Pas d''arrondi (FCFA) du prix affiché en livraison PLATEFORME. Le prix client est toujours un multiple de ce pas.'),
  ('driver_amortization_max',
   '100'::jsonb,
   'Montant maximal (FCFA) que la course du livreur peut absorber pour arrondir le prix VERS LE BAS. Au-delà, on arrondit vers le haut et le surplus va à la marge plateforme.')
ON CONFLICT (key) DO NOTHING;

-- ── 2. Qui livre la boutique ───────────────────────────────────────────────
ALTER TABLE fastfoods
  ADD COLUMN IF NOT EXISTS delivery_by TEXT NOT NULL DEFAULT 'fastfood';

-- Zones de livraison PLATEFORME. Même forme que `delivery_hours` (periodicZones
-- / expressZones par créneau) : le front n'a qu'une structure à connaître.
ALTER TABLE fastfoods
  ADD COLUMN IF NOT EXISTS platform_delivery_hours JSONB DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fastfoods_delivery_by_chk'
  ) THEN
    ALTER TABLE fastfoods
      ADD CONSTRAINT fastfoods_delivery_by_chk
      CHECK (delivery_by IN ('fastfood', 'platform'));
  END IF;
END $$;

-- Les boutiques livrées par la plateforme se comptent : index partiel.
CREATE INDEX IF NOT EXISTS idx_fastfoods_delivery_by_platform
  ON fastfoods(delivery_by) WHERE delivery_by = 'platform';

-- ── 3. Traçabilité comptable du règlement ──────────────────────────────────
-- `withdrawal_fee` : la part du montant encaissé qui servira à sortir l'argent
-- du portefeuille opérateur. Elle est fondue dans le prix affiché, donc
-- présente dans `items_charged` — sans cette colonne, elle serait créditée au
-- fastfood alors qu'elle ne lui revient pas.
--
-- `driver_amount` : ce qui reste réellement au livreur en régime PLATEFORME,
-- après que la course a absorbé l'arrondi vers le bas. Distinct de
-- `order_deliveries.real_price`, qui est le tarif de la zone AVANT amortissement.
-- `withdrawal_group_id` : relie les commandes qui partagent UNE ponction de
-- retrait — celles d'un même panier ET d'une même boutique. Un panier chez deux
-- boutiques vide deux portefeuilles, donc porte deux groupes.
-- Pendant du `delivery_group_id` de `order_deliveries`, avec la même mécanique :
-- un id généré, stocké, et un booléen disant qui porte la ponction.
ALTER TABLE order_settlements
  ADD COLUMN IF NOT EXISTS withdrawal_fee      NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS driver_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS withdrawal_group_id TEXT,
  ADD COLUMN IF NOT EXISTS withdrawal_billed   BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_order_settlements_withdrawal_group
  ON order_settlements(withdrawal_group_id) WHERE withdrawal_group_id IS NOT NULL;
