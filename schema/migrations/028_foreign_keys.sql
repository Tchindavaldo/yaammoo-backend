-- 028_foreign_keys.sql
-- Liaison explicite des tables par FOREIGN KEY.
--
-- Jusqu'ici la plupart des colonnes `*_id` étaient de simples TEXT : aucune
-- intégrité référentielle, aucune navigation par clic dans le dashboard Supabase,
-- et rien n'empêchait un id orphelin (bonus supprimé → réclamations fantômes).
--
-- ⚠️ Une FK échoue si des lignes orphelines existent : chaque bloc NETTOIE d'abord
-- (NULL pour les colonnes nullables, DELETE pour les lignes qui n'ont aucun sens
-- sans leur parent), puis pose la contrainte. Migration idempotente.
--
-- Choix des ON DELETE :
--   CASCADE  → la ligne n'a aucun sens sans son parent (réclamation, candidature…)
--   SET NULL → la ligne doit survivre : historique financier, ou référence
--              accessoire (menu supprimé, livreur désassigné).

-- ============================================================================
-- users.fastfood_id → fastfoods
-- ============================================================================
-- SET NULL : supprimer une boutique ne doit jamais supprimer son propriétaire
-- (il redevient simplement non-marchand — cf. isMarchand calculé).
UPDATE users SET fastfood_id = NULL
 WHERE fastfood_id IS NOT NULL
   AND fastfood_id NOT IN (SELECT id FROM fastfoods);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_fastfood_id_fkey;
ALTER TABLE users
  ADD CONSTRAINT users_fastfood_id_fkey
  FOREIGN KEY (fastfood_id) REFERENCES fastfoods(id) ON DELETE SET NULL;

-- ============================================================================
-- fastfoods.user_id → users
-- ============================================================================
-- CASCADE : une boutique sans propriétaire n'a pas d'existence.
DELETE FROM fastfoods WHERE user_id NOT IN (SELECT id FROM users);

ALTER TABLE fastfoods DROP CONSTRAINT IF EXISTS fastfoods_user_id_fkey;
ALTER TABLE fastfoods
  ADD CONSTRAINT fastfoods_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ============================================================================
-- orders → users / fastfoods / menus / users (driver)
-- ============================================================================
-- user_id et fastfood_id sont NOT NULL : on ne peut pas les annuler, donc on
-- supprime les commandes orphelines (données inexploitables de toute façon).
DELETE FROM orders WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM orders WHERE fastfood_id NOT IN (SELECT id FROM fastfoods);

UPDATE orders SET menu_id = NULL
 WHERE menu_id IS NOT NULL AND menu_id NOT IN (SELECT id FROM menus);
UPDATE orders SET driver_id = NULL
 WHERE driver_id IS NOT NULL AND driver_id NOT IN (SELECT id FROM users);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_user_id_fkey;
ALTER TABLE orders
  ADD CONSTRAINT orders_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_fastfood_id_fkey;
ALTER TABLE orders
  ADD CONSTRAINT orders_fastfood_id_fkey
  FOREIGN KEY (fastfood_id) REFERENCES fastfoods(id) ON DELETE CASCADE;

-- SET NULL : la commande reste un historique valide même si le menu disparaît
-- (son contenu est figé dans la colonne `menu` JSONB).
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_menu_id_fkey;
ALTER TABLE orders
  ADD CONSTRAINT orders_menu_id_fkey
  FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE SET NULL;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_driver_id_fkey;
ALTER TABLE orders
  ADD CONSTRAINT orders_driver_id_fkey
  FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================================
-- rank_counters.fastfood_id → fastfoods
-- ============================================================================
DELETE FROM rank_counters WHERE fastfood_id NOT IN (SELECT id FROM fastfoods);

ALTER TABLE rank_counters DROP CONSTRAINT IF EXISTS rank_counters_fastfood_id_fkey;
ALTER TABLE rank_counters
  ADD CONSTRAINT rank_counters_fastfood_id_fkey
  FOREIGN KEY (fastfood_id) REFERENCES fastfoods(id) ON DELETE CASCADE;

-- ============================================================================
-- transactions.user_id → users
-- ============================================================================
DELETE FROM transactions WHERE user_id NOT IN (SELECT id FROM users);

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_user_id_fkey;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ============================================================================
-- bonus_requests → users / bonus
-- ============================================================================
-- CASCADE : une réclamation n'existe que par son user ET son bonus.
DELETE FROM bonus_requests WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM bonus_requests WHERE bonus_id NOT IN (SELECT id FROM bonus);

ALTER TABLE bonus_requests DROP CONSTRAINT IF EXISTS bonus_requests_user_id_fkey;
ALTER TABLE bonus_requests
  ADD CONSTRAINT bonus_requests_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE bonus_requests DROP CONSTRAINT IF EXISTS bonus_requests_bonus_id_fkey;
ALTER TABLE bonus_requests
  ADD CONSTRAINT bonus_requests_bonus_id_fkey
  FOREIGN KEY (bonus_id) REFERENCES bonus(id) ON DELETE CASCADE;

-- ============================================================================
-- notifications → users / fastfoods (colonnes nullables)
-- ============================================================================
UPDATE notifications SET user_id = NULL
 WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users);
UPDATE notifications SET fastfood_id = NULL
 WHERE fastfood_id IS NOT NULL AND fastfood_id NOT IN (SELECT id FROM fastfoods);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_fastfood_id_fkey;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_fastfood_id_fkey
  FOREIGN KEY (fastfood_id) REFERENCES fastfoods(id) ON DELETE CASCADE;

-- ============================================================================
-- driver_applications → users / fastfoods
-- ============================================================================
DELETE FROM driver_applications WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM driver_applications WHERE fastfood_id NOT IN (SELECT id FROM fastfoods);

ALTER TABLE driver_applications DROP CONSTRAINT IF EXISTS driver_applications_user_id_fkey;
ALTER TABLE driver_applications
  ADD CONSTRAINT driver_applications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE driver_applications DROP CONSTRAINT IF EXISTS driver_applications_fastfood_id_fkey;
ALTER TABLE driver_applications
  ADD CONSTRAINT driver_applications_fastfood_id_fkey
  FOREIGN KEY (fastfood_id) REFERENCES fastfoods(id) ON DELETE CASCADE;

-- ============================================================================
-- order_deliveries → users / fastfoods / bonus
-- ============================================================================
-- SET NULL sur fastfood_id et bonus_id : la ligne de livraison porte des
-- montants (marge plateforme) qui doivent survivre à la suppression du parent.
DELETE FROM order_deliveries WHERE user_id NOT IN (SELECT id FROM users);
UPDATE order_deliveries SET fastfood_id = NULL
 WHERE fastfood_id IS NOT NULL AND fastfood_id NOT IN (SELECT id FROM fastfoods);
UPDATE order_deliveries SET bonus_id = NULL
 WHERE bonus_id IS NOT NULL AND bonus_id NOT IN (SELECT id FROM bonus);

ALTER TABLE order_deliveries DROP CONSTRAINT IF EXISTS order_deliveries_user_id_fkey;
ALTER TABLE order_deliveries
  ADD CONSTRAINT order_deliveries_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE order_deliveries DROP CONSTRAINT IF EXISTS order_deliveries_fastfood_id_fkey;
ALTER TABLE order_deliveries
  ADD CONSTRAINT order_deliveries_fastfood_id_fkey
  FOREIGN KEY (fastfood_id) REFERENCES fastfoods(id) ON DELETE SET NULL;

ALTER TABLE order_deliveries DROP CONSTRAINT IF EXISTS order_deliveries_bonus_id_fkey;
ALTER TABLE order_deliveries
  ADD CONSTRAINT order_deliveries_bonus_id_fkey
  FOREIGN KEY (bonus_id) REFERENCES bonus(id) ON DELETE SET NULL;

-- ============================================================================
-- order_settlements → users / fastfoods
-- ============================================================================
DELETE FROM order_settlements WHERE user_id NOT IN (SELECT id FROM users);
UPDATE order_settlements SET fastfood_id = NULL
 WHERE fastfood_id IS NOT NULL AND fastfood_id NOT IN (SELECT id FROM fastfoods);

ALTER TABLE order_settlements DROP CONSTRAINT IF EXISTS order_settlements_user_id_fkey;
ALTER TABLE order_settlements
  ADD CONSTRAINT order_settlements_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE order_settlements DROP CONSTRAINT IF EXISTS order_settlements_fastfood_id_fkey;
ALTER TABLE order_settlements
  ADD CONSTRAINT order_settlements_fastfood_id_fkey
  FOREIGN KEY (fastfood_id) REFERENCES fastfoods(id) ON DELETE SET NULL;

-- ============================================================================
-- platform_revenues → users / fastfoods
-- ============================================================================
-- SET NULL partout : le revenu encaissé par la plateforme est un fait comptable
-- qui ne doit JAMAIS disparaître avec la suppression d'un compte ou d'une boutique.
UPDATE platform_revenues SET user_id = NULL
 WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users);
UPDATE platform_revenues SET fastfood_id = NULL
 WHERE fastfood_id IS NOT NULL AND fastfood_id NOT IN (SELECT id FROM fastfoods);

ALTER TABLE platform_revenues DROP CONSTRAINT IF EXISTS platform_revenues_user_id_fkey;
ALTER TABLE platform_revenues
  ADD CONSTRAINT platform_revenues_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE platform_revenues DROP CONSTRAINT IF EXISTS platform_revenues_fastfood_id_fkey;
ALTER TABLE platform_revenues
  ADD CONSTRAINT platform_revenues_fastfood_id_fkey
  FOREIGN KEY (fastfood_id) REFERENCES fastfoods(id) ON DELETE SET NULL;
