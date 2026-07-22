-- ============================================================================
-- 023_order_deliveries_delivered.sql
-- ============================================================================
-- Distinguer explicitement une commande LIVRÉE d'une commande à emporter.
--
-- Sans ce champ, le seul indice serait `real_price = 0` — or 0 peut aussi
-- signifier « boutique sans zone déclarée » ou « course mutualisée ». Déduire
-- le mode de livraison d'un montant nul serait une inférence fragile, et la
-- comptabilité en dépend.
--
-- ⚠️ Une commande à emporter est TOUT DE MÊME facturée `charged_price` : le
-- supplément livraison est fondu dans le prix du plat depuis le home, avant
-- que le user ait choisi son mode. S'il vient chercher lui-même, il n'y a
-- aucune course à payer au fastfood — le montant part donc INTÉGRALEMENT en
-- marge plateforme. C'est le modèle économique retenu.
--
-- Marge pure sur une commande =  delivered = FALSE
--
-- Idempotent.
-- ============================================================================

ALTER TABLE order_deliveries
  ADD COLUMN IF NOT EXISTS delivered BOOLEAN NOT NULL DEFAULT TRUE;

-- Les lignes existantes portent toutes une livraison : avant cette migration,
-- les commandes à emporter n'étaient tout simplement pas enregistrées.
-- Le DEFAULT TRUE est donc correct pour l'historique.

-- Suivi des commandes à emporter (marge pure) par boutique et par période.
CREATE INDEX IF NOT EXISTS idx_order_deliveries_pickup
  ON order_deliveries(fastfood_id, created_at) WHERE delivered = FALSE;
