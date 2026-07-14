-- 010_driver_applications.sql
-- Candidatures livreur : un user postule pour devenir livreur d'un ou plusieurs
-- fastFoods (une ligne par boutique). Acceptation → pose user.driverId = uid du
-- user (marqueur isDriver). L'appartenance boutique↔livreur est portée par les
-- lignes status='accepted' (un livreur peut servir plusieurs boutiques).
--
-- user.driverId reste porté par users.extra_data (pass-through mapper) : pas de
-- colonne dédiée.

CREATE TABLE IF NOT EXISTS driver_applications (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  fastfood_id   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | refused
  extra_data    JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_applications_fastfood
  ON driver_applications(fastfood_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_applications_user
  ON driver_applications(user_id, status);
