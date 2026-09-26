-- ============================================================================
-- 054_user_locations.sql
-- ============================================================================
-- Localisation des utilisateurs : l'app demande la permission après celle des
-- notifications, puis envoie la position à chaque connexion (`POST
-- /user/location`), avec la ville / le département / la région trouvés par le
-- géocodage inverse du téléphone. Voir architecture/user-location.md.
--
--   1. users.location_*   — DERNIÈRE position connue (lecture directe, ciblage)
--   2. user_locations     — HISTORIQUE : une ligne par capture, jamais écrasée
--   3. city_user_ids      — audience « ville » des notifications boutique (053)
--
-- Données personnelles : supprimées avec le compte (FK ON DELETE CASCADE).
-- Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Dernière position, sur l'utilisateur
-- ----------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS location_lat        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_lng        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_city       TEXT,
  -- Département (Cameroun) : `subregion` du géocodage inverse.
  ADD COLUMN IF NOT EXISTS location_subregion  TEXT,
  ADD COLUMN IF NOT EXISTS location_region     TEXT,
  -- Quartier / arrondissement quand le géocodeur le donne.
  ADD COLUMN IF NOT EXISTS location_district   TEXT,
  ADD COLUMN IF NOT EXISTS location_country    TEXT,
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_location_city ON users (lower(location_city));

-- ----------------------------------------------------------------------------
-- 2. Historique des positions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_locations (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  latitude         DOUBLE PRECISION NOT NULL,
  longitude        DOUBLE PRECISION NOT NULL,
  accuracy         DOUBLE PRECISION,          -- rayon d'incertitude (m)
  city             TEXT,
  subregion        TEXT,
  region           TEXT,
  district         TEXT,
  street           TEXT,
  postal_code      TEXT,
  country          TEXT,
  iso_country_code TEXT,
  -- login = connexion · app_open = ouverture de l'app · foreground = retour au
  -- premier plan · background = capture app fermée (non utilisée à ce jour)
  source           TEXT NOT NULL,
  platform         TEXT,
  captured_at      TIMESTAMPTZ NOT NULL,       -- heure du téléphone
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_locations_source_chk
    CHECK (source IN ('login', 'app_open', 'foreground', 'background'))
);

CREATE INDEX IF NOT EXISTS idx_user_locations_user ON user_locations(user_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_locations_city ON user_locations(lower(city));

-- ----------------------------------------------------------------------------
-- 3. Audience « ville » des notifications boutique
-- ----------------------------------------------------------------------------
-- Utilisateurs dont la DERNIÈRE ville connue est `p_city` (casse ignorée).
-- Sans localisation (permission refusée, ancienne app), un utilisateur compte
-- pour les villes desservies par les boutiques où il a commandé.
CREATE OR REPLACE FUNCTION city_user_ids(p_city TEXT)
RETURNS TABLE (uid TEXT)
LANGUAGE sql STABLE
AS $$
  SELECT u.id
    FROM users u
   WHERE lower(u.location_city) = lower(p_city)
  UNION
  SELECT o.user_id
    FROM orders o
    JOIN fastfoods f ON f.id = o.fastfood_id
    JOIN users u ON u.id = o.user_id
   WHERE u.location_city IS NULL
     AND o.deleted_at IS NULL
     AND o.status <> 'pendingToBuy'
     AND f.cities ? p_city
  ORDER BY 1;
$$;
