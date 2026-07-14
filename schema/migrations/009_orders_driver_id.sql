-- 009_orders_driver_id.sql
-- Délégation d'une commande à un livreur (driver).
-- Ajoute la colonne driver_id sur orders + index pour GET /order/driver/:driverId.
-- user.driverId reste porté par users.extra_data (pass-through mapper) : pas de
-- colonne dédiée nécessaire côté users pour la simple lecture par GET /user/:uid.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS driver_id TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_driver ON orders(driver_id);
