-- ============================================================================
-- Migration: Nettoyage pending_payments — suppression des colonnes inutilisées
-- ============================================================================
-- Le contexte de commande vit désormais entièrement dans `items` (tableau de
-- commandes complètes, chacune avec son fastFoodId). Les colonnes order_id,
-- fastfood_id et order_ctx ne sont plus écrites ni lues par le code.
--
-- Idempotence: "IF EXISTS" → safe si rejouée ou si la table a déjà été nettoyée.
-- ============================================================================

ALTER TABLE pending_payments DROP COLUMN IF EXISTS order_id;
ALTER TABLE pending_payments DROP COLUMN IF EXISTS fastfood_id;
ALTER TABLE pending_payments DROP COLUMN IF EXISTS order_ctx;
