-- ============================================================================
-- 021_order_deliveries_group.sql
-- ============================================================================
-- Panier : une seule course par boutique, et traçabilité de ce choix.
--
-- Une commande = UN plat. Un panier de plusieurs plats produit donc plusieurs
-- commandes, alors que le livreur ne se déplace qu'UNE fois par boutique.
--
-- Plutôt que de mettre `real_price = 0` sur les commandes non facturées — ce qui
-- effacerait l'information — on garde le prix réel de la zone sur CHAQUE ligne,
-- et on marque laquelle porte réellement la course :
--
--   delivery_group_id → commandes du même panier ET de la même boutique
--   course_billed     → TRUE sur une seule ligne du groupe
--
-- La comptabilité somme donc `real_price WHERE course_billed = TRUE`. On voit à
-- la fois le vrai prix de la zone sur chaque commande, et pourquoi elle n'a pas
-- été facturée.
--
-- Ajout également du détail des montants hors livraison (plat, extras, boissons)
-- et des frais de paiement, désormais INCLUS dans les prix affichés : aucune
-- ligne de frais n'est jamais présentée au user, la base doit donc rester la
-- seule source de vérité sur ce qu'il a réellement payé.
--
-- Idempotent.
-- ============================================================================

ALTER TABLE order_deliveries
  ADD COLUMN IF NOT EXISTS delivery_group_id TEXT,
  ADD COLUMN IF NOT EXISTS course_billed     BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS items_real        NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS items_charged     NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_fee       NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Reconstitution d'un panier, et somme des courses réellement dues.
CREATE INDEX IF NOT EXISTS idx_order_deliveries_group
  ON order_deliveries(delivery_group_id) WHERE delivery_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_deliveries_billed
  ON order_deliveries(fastfood_id, created_at) WHERE course_billed = TRUE;
