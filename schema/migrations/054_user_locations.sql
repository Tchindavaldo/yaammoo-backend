-- ============================================================================
-- 054_user_locations.sql
-- ============================================================================
-- Localisation des utilisateurs : l'app demande la permission après celle des
-- notifications, puis envoie la position à chaque connexion, au retour au
-- premier plan et, si l'utilisateur l'autorise, app fermée (`POST
-- /user/location`), avec le lieu trouvé par le géocodage inverse du téléphone.
-- Voir architecture/user-location.md.
--
--   1. user_locations  — TOUT est ici : une ligne par capture, jamais écrasée.
--                        La dernière position d'un user = sa ligne la plus
--                        récente. La table `users` ne porte AUCUNE colonne de
--                        localisation.
--   2. city_user_ids   — audience « ville » des notifications boutique (053)
--
-- Données personnelles : supprimées avec le compte (FK ON DELETE CASCADE).
-- Idempotent, y compris sur une base où une version antérieure de cette
-- migration (colonnes users.location_*) a déjà été appliquée.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Historique des positions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_locations (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Coordonnées (capteur du téléphone)
  latitude          DOUBLE PRECISION NOT NULL,
  longitude         DOUBLE PRECISION NOT NULL,
  accuracy          DOUBLE PRECISION,          -- rayon d'incertitude (m)
  altitude          DOUBLE PRECISION,          -- m
  speed             DOUBLE PRECISION,          -- m/s
  heading           DOUBLE PRECISION,          -- degrés, 0 = nord
  -- Lieu (géocodage inverse du téléphone ; NULL s'il a échoué)
  city              TEXT,
  subregion         TEXT,                      -- département (Cameroun)
  region            TEXT,
  district          TEXT,                      -- quartier / arrondissement
  street            TEXT,
  street_number     TEXT,
  place_name        TEXT,                      -- nom du lieu (bâtiment, repère)
  formatted_address TEXT,                      -- adresse complète (Android)
  postal_code       TEXT,
  country           TEXT,
  iso_country_code  TEXT,
  timezone          TEXT,                      -- ex. Africa/Douala (iOS)
  -- Contexte de la capture
  -- login = connexion · app_open = ouverture de l'app · foreground = retour au
  -- premier plan · background = app fermée ou en arrière-plan
  source            TEXT NOT NULL,
  platform          TEXT,
  captured_at       TIMESTAMPTZ NOT NULL,      -- heure du téléphone
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_locations_source_chk
    CHECK (source IN ('login', 'app_open', 'foreground', 'background'))
);

-- Base où la première version de 054 a été appliquée : colonnes ajoutées depuis.
ALTER TABLE user_locations
  ADD COLUMN IF NOT EXISTS altitude          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS speed             DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS heading           DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS street_number     TEXT,
  ADD COLUMN IF NOT EXISTS place_name        TEXT,
  ADD COLUMN IF NOT EXISTS formatted_address TEXT,
  ADD COLUMN IF NOT EXISTS timezone          TEXT;

-- Historique d'un user, du plus récent au plus ancien.
CREATE INDEX IF NOT EXISTS idx_user_locations_user ON user_locations(user_id, captured_at DESC);
-- Dernière ville connue d'un user (audience « ville ») : une lecture d'index.
CREATE INDEX IF NOT EXISTS idx_user_locations_user_city
  ON user_locations(user_id, captured_at DESC) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_locations_city ON user_locations(lower(city));

-- Première version de 054 : la dernière position était recopiée sur `users`.
-- Abandonné (tout est dans user_locations) — colonnes retirées si présentes.
DROP INDEX IF EXISTS idx_users_location_city;
ALTER TABLE users
  DROP COLUMN IF EXISTS location_lat,
  DROP COLUMN IF EXISTS location_lng,
  DROP COLUMN IF EXISTS location_city,
  DROP COLUMN IF EXISTS location_subregion,
  DROP COLUMN IF EXISTS location_region,
  DROP COLUMN IF EXISTS location_district,
  DROP COLUMN IF EXISTS location_country,
  DROP COLUMN IF EXISTS location_updated_at;

-- ----------------------------------------------------------------------------
-- 2. Audience « ville » des notifications boutique
-- ----------------------------------------------------------------------------
-- Utilisateurs dont la DERNIÈRE ville connue (capture la plus récente ayant une
-- ville) est `p_city`, casse ignorée. Sans aucune ville connue (permission
-- refusée, ancienne app), un utilisateur compte pour les villes desservies par
-- les boutiques où il a commandé.
CREATE OR REPLACE FUNCTION city_user_ids(p_city TEXT)
RETURNS TABLE (uid TEXT)
LANGUAGE sql STABLE
AS $$
  WITH last_city AS (
    SELECT u.id AS user_id, lc.city
      FROM users u
      CROSS JOIN LATERAL (
        SELECT l.city
          FROM user_locations l
         WHERE l.user_id = u.id
           AND l.city IS NOT NULL
         ORDER BY l.captured_at DESC
         LIMIT 1
      ) lc
  )
  SELECT user_id FROM last_city WHERE lower(city) = lower(p_city)
  UNION
  SELECT o.user_id
    FROM orders o
    JOIN fastfoods f ON f.id = o.fastfood_id
   WHERE o.deleted_at IS NULL
     AND o.status <> 'pendingToBuy'
     AND f.cities ? p_city
     AND NOT EXISTS (SELECT 1 FROM last_city lc WHERE lc.user_id = o.user_id)
  ORDER BY 1;
$$;
