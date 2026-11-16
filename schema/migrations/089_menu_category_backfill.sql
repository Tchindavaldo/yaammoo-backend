-- 089 : catégorie par défaut des plats existants, déduite du nom.
-- Idempotent : ne touche que les plats sans catégorie.
UPDATE menus SET category = 'Poulet'
 WHERE category IS NULL AND (coalesce(name,'') || ' ' || coalesce(titre,'')) ILIKE '%poulet%';
UPDATE menus SET category = 'Burger'
 WHERE category IS NULL AND (coalesce(name,'') || ' ' || coalesce(titre,'')) ILIKE '%burger%';
UPDATE menus SET category = 'Pizza'
 WHERE category IS NULL AND (coalesce(name,'') || ' ' || coalesce(titre,'')) ILIKE '%pizza%';
