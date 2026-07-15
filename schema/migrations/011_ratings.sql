-- ============================================================================
-- 011_ratings.sql — Notes/avis polymorphes (plat, livreur, extensible)
-- ============================================================================
-- Une seule table `ratings` pour tout ce qu'on veut noter (target_type) :
--   - 'menu'   → target_id = id du plat        → moyenne sur menus.rating_avg/count
--   - 'driver' → target_id = uid du livreur    → moyenne sur users.driver_rating_avg/count
-- Chaque note porte son CONTEXTE (order_id, extra_data : heure, zone, durée…),
-- réutilisable pour d'autres cibles plus tard sans nouvelle table.
-- Un couple (target_type, target_id, user_id) = UNE ligne (re-noter = upsert).
-- Les moyennes sont pré-calculées (lecture instantanée) et recalculées de façon
-- INCRÉMENTALE et ATOMIQUE dans rate_target(). Commandes idempotentes.
-- ============================================================================

-- 1) Table polymorphe des notes -----------------------------------------------
CREATE TABLE IF NOT EXISTS ratings (
  id          TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,             -- 'menu' | 'driver' | ...
  target_id   TEXT NOT NULL,             -- id du plat OU uid du livreur
  user_id     TEXT NOT NULL,             -- auteur de la note
  order_id    TEXT,                      -- commande liée (preuve + contexte)
  value       INTEGER NOT NULL CHECK (value >= 1 AND value <= 5),
  comment     TEXT,
  extra_data  JSONB DEFAULT '{}'::jsonb, -- contexte riche (heure, zone, durée, prix…)
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Une seule note par (type, cible, user) → permet l'upsert.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ratings_target_user
  ON ratings (target_type, target_id, user_id);

-- Liste des avis d'une cible (fiche plat / profil livreur), plus récent d'abord.
CREATE INDEX IF NOT EXISTS idx_ratings_target
  ON ratings (target_type, target_id, created_at DESC);

-- 2) Colonnes agrégées sur les cibles -----------------------------------------
ALTER TABLE menus
  ADD COLUMN IF NOT EXISTS rating_avg   NUMERIC(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count INTEGER      NOT NULL DEFAULT 0;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS driver_rating_avg   NUMERIC(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS driver_rating_count INTEGER      NOT NULL DEFAULT 0;

-- 3) Fonction atomique générique : upsert note + maj moyenne de la cible ------
-- Verrouille la ligne cible, recalcule la moyenne incrémentalement, renvoie la
-- note + les agrégats à jour. `target_type` route vers la bonne table cible.
CREATE OR REPLACE FUNCTION rate_target(
  p_rating_id   TEXT,
  p_target_type TEXT,
  p_target_id   TEXT,
  p_user_id     TEXT,
  p_order_id    TEXT,
  p_value       INTEGER,
  p_comment     TEXT,
  p_extra       JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  rating_id     TEXT,
  target_type   TEXT,
  target_id     TEXT,
  user_id       TEXT,
  value         INTEGER,
  comment       TEXT,
  created_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ,
  rating_avg    NUMERIC,
  rating_count  INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_value INTEGER;
  v_count     INTEGER;
  v_avg       NUMERIC;
  v_rating_id TEXT;
  v_new_avg   NUMERIC;
  v_new_count INTEGER;
BEGIN
  IF p_value < 1 OR p_value > 5 THEN
    RAISE EXCEPTION 'value doit être entre 1 et 5';
  END IF;
  IF p_target_type NOT IN ('menu', 'driver') THEN
    RAISE EXCEPTION 'target_type non supporté: %', p_target_type;
  END IF;

  -- Note existante de ce user pour cette cible ?
  SELECT r.value, r.id INTO v_old_value, v_rating_id
  FROM ratings r
  WHERE r.target_type = p_target_type AND r.target_id = p_target_id AND r.user_id = p_user_id
  FOR UPDATE;

  -- Verrou + lecture des agrégats courants selon le type de cible.
  IF p_target_type = 'menu' THEN
    SELECT m.rating_count, m.rating_avg INTO v_count, v_avg
    FROM menus m WHERE m.id = p_target_id FOR UPDATE;
  ELSE
    SELECT u.driver_rating_count, u.driver_rating_avg INTO v_count, v_avg
    FROM users u WHERE u.id = p_target_id FOR UPDATE;
  END IF;

  IF v_count IS NULL THEN
    RAISE EXCEPTION 'Cible introuvable (%: %)', p_target_type, p_target_id;
  END IF;

  IF v_old_value IS NULL THEN
    -- Nouvelle note : insert + count+1.
    INSERT INTO ratings (id, target_type, target_id, user_id, order_id, value, comment, extra_data, created_at, updated_at)
    VALUES (p_rating_id, p_target_type, p_target_id, p_user_id, p_order_id, p_value, p_comment, COALESCE(p_extra, '{}'::jsonb), now(), now());
    v_rating_id := p_rating_id;
    v_new_avg   := ((v_avg * v_count) + p_value) / (v_count + 1);
    v_new_count := v_count + 1;
  ELSE
    -- Re-note : update, count inchangé, retire l'ancien + ajoute le nouveau.
    UPDATE ratings
      SET value = p_value,
          comment = p_comment,
          order_id = COALESCE(p_order_id, order_id),
          extra_data = COALESCE(p_extra, extra_data),
          updated_at = now()
    WHERE id = v_rating_id;
    v_new_count := v_count;
    IF v_count > 0 THEN
      v_new_avg := ((v_avg * v_count) - v_old_value + p_value) / v_count;
    ELSE
      v_new_avg := p_value;
    END IF;
  END IF;

  -- Écrit la moyenne à jour sur la bonne cible.
  IF p_target_type = 'menu' THEN
    UPDATE menus SET rating_avg = ROUND(v_new_avg, 2), rating_count = v_new_count, updated_at = now()
    WHERE id = p_target_id;
  ELSE
    UPDATE users SET driver_rating_avg = ROUND(v_new_avg, 2), driver_rating_count = v_new_count, updated_at = now()
    WHERE id = p_target_id;
  END IF;

  RETURN QUERY
  SELECT r.id, r.target_type, r.target_id, r.user_id, r.value, r.comment, r.created_at, r.updated_at,
         ROUND(v_new_avg, 2)::NUMERIC, v_new_count
  FROM ratings r WHERE r.id = v_rating_id;
END;
$$;
