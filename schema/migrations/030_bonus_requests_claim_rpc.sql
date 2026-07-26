-- 030_bonus_requests_claim_rpc.sql
-- Ouverture atomique d'un cycle de réclamation.
--
-- POURQUOI : ouvrir un cycle demande DEUX écritures — démoter la réclamation
-- courante (is_current = false) puis insérer la nouvelle. En deux appels
-- Supabase séparés, un crash entre les deux laisse le (user, bonus) SANS ligne
-- courante : le user paraît n'avoir jamais réclamé (ni code, ni armement) alors
-- que son historique existe.
--
-- Une fonction PL/pgSQL s'exécute dans une transaction implicite : les deux
-- écritures réussissent ensemble ou aucune ne s'applique.
--
-- L'ordre démote-puis-insère est imposé par l'index unique partiel
-- `idx_bonus_requests_current` (migration 029) : deux lignes courantes
-- simultanées sont rejetées par la base.

CREATE OR REPLACE FUNCTION bonus_request_open_cycle(
  p_id          TEXT,
  p_user_id     TEXT,
  p_bonus_id    TEXT,
  p_status      JSONB,
  p_code        TEXT,
  p_usage_count INTEGER,
  p_redeemed    BOOLEAN,
  p_armed       BOOLEAN,
  p_extra_data  JSONB,
  p_created_at  TIMESTAMPTZ
)
RETURNS bonus_requests
LANGUAGE plpgsql
AS $$
DECLARE
  v_row bonus_requests;
BEGIN
  -- 1. Le cycle précédent devient de l'historique.
  UPDATE bonus_requests
     SET is_current = FALSE,
         updated_at = NOW()
   WHERE user_id = p_user_id
     AND bonus_id = p_bonus_id
     AND is_current;

  -- 2. Le nouveau cycle devient le courant.
  INSERT INTO bonus_requests (
    id, user_id, bonus_id, status, code,
    usage_count, redeemed, armed, is_current,
    extra_data, created_at, updated_at
  )
  VALUES (
    p_id, p_user_id, p_bonus_id, COALESCE(p_status, '[]'::jsonb), p_code,
    COALESCE(p_usage_count, 0), COALESCE(p_redeemed, FALSE), COALESCE(p_armed, FALSE), TRUE,
    COALESCE(p_extra_data, '{}'::jsonb), COALESCE(p_created_at, NOW()), NOW()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
