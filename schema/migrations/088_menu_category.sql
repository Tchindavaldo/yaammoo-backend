-- 088_menu_category.sql
-- Catégorie libre d'un plat (saisie par le marchand, ex. « Poulet », « Pizza »).
-- Sert au filtre catégorie du home : GET /fastfood/all?category=...
ALTER TABLE menus
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS menus_category_lower_idx
  ON menus (lower(category))
  WHERE deleted_at IS NULL;
