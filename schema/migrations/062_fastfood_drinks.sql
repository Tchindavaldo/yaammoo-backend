-- ============================================================================
-- 062_fastfood_drinks.sql
-- ============================================================================
-- Boissons rattachées à la BOUTIQUE (plus au plat). Voir
-- architecture/menus-detailed.md § « Boissons de la boutique ».
--
--   fastfoods.drinks : [{ id, name, prix, status, menuIds }]
--     menuIds = null → boisson proposée avec TOUS les plats (défaut)
--     menuIds = [..] → seulement ces plats
--
-- `menus.drink` est conservé (anciennes apps, boutiques sans catalogue
-- boissons) : il n'est plus lu dès que la boutique a au moins une boisson.
-- Idempotent.
-- ============================================================================

ALTER TABLE fastfoods
  ADD COLUMN IF NOT EXISTS drinks JSONB NOT NULL DEFAULT '[]'::jsonb;
