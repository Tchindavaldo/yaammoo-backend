-- ============================================================================
-- 060_geolocation_tracking.sql
-- ============================================================================
-- Géolocalisation : boutiques proches et suivi du livreur en temps réel.
-- Voir architecture/geolocation.md.
--
--   1. fastfoods.latitude / longitude — position de la boutique (posée par le
--                                       marchand, NULL tant qu'il ne l'a pas fait)
--   2. driver_positions               — DERNIÈRE position de chaque livreur
--                                       (une ligne par livreur, écrasée)
--
-- Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Position de la boutique
-- ----------------------------------------------------------------------------
ALTER TABLE fastfoods
  ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- ----------------------------------------------------------------------------
-- 2. Dernière position d'un livreur (suivi des livraisons en cours)
-- ----------------------------------------------------------------------------
-- Pas d'historique : le suivi n'a besoin que du point courant, et la tâche du
-- livreur en envoie un toutes les ~10 s pendant une course. L'historique de
-- localisation reste `user_locations` (à son propre rythme).
CREATE TABLE IF NOT EXISTS driver_positions (
  driver_id   TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  latitude    DOUBLE PRECISION NOT NULL,
  longitude   DOUBLE PRECISION NOT NULL,
  accuracy    DOUBLE PRECISION,          -- rayon d'incertitude (m)
  speed       DOUBLE PRECISION,          -- m/s
  heading     DOUBLE PRECISION,          -- degrés, 0 = nord
  captured_at TIMESTAMPTZ NOT NULL,      -- heure du téléphone
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Commandes en cours d'un livreur (`driver_id` + `status = delivering`).
CREATE INDEX IF NOT EXISTS idx_orders_driver_status ON orders(driver_id, status)
  WHERE driver_id IS NOT NULL;
