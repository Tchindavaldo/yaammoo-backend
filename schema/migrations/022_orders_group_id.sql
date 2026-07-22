-- ============================================================================
-- 022_orders_group_id.sql
-- ============================================================================
-- Regroupement des commandes d'un même panier.
--
-- Une commande = UN plat. Un panier de 3 plats arrive donc chez le marchand
-- comme 3 commandes distinctes, alors qu'il s'agit d'un seul client, d'une
-- seule livraison. `group_id` permet de les réafficher ensemble.
--
-- Renseigné au passage en `pending` (updateOrders), c'est-à-dire quand le
-- panier est payé : avant, il peut encore être modifié.
--
-- ⚠️ À distinguer de `order_deliveries.delivery_group_id`, qui groupe par
-- (panier, BOUTIQUE) pour la comptabilité : un panier peut couvrir deux
-- boutiques, donc deux courses, mais reste un seul panier pour le client.
--
-- Idempotent.
-- ============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS group_id TEXT;

-- Reconstitution d'un panier côté marchand comme côté client.
CREATE INDEX IF NOT EXISTS idx_orders_group
  ON orders(group_id) WHERE group_id IS NOT NULL;
