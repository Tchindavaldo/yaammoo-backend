-- ============================================================================
-- 033_notifications_null_all_notif_guard.sql
-- ============================================================================
-- Probleme : si all_notif est NULL (vidage manuel du champ dans Supabase),
-- l'expression `jsonb_build_array(p_notif) || all_notif` renvoie NULL.
-- Chaque append ecrasait donc le groupe en NULL silencieusement : plus aucune
-- notification stockee alors que la fonction ne remontait aucune erreur.
--
-- Correctif :
--   1. Repare les lignes existantes (NULL -> '[]')
--   2. Blinde append_notification avec COALESCE
--   3. Contrainte DEFAULT + NOT NULL pour empecher que ca se reproduise
-- ============================================================================

-- 1. Reparation des donnees existantes
UPDATE notifications SET all_notif = '[]'::jsonb WHERE all_notif IS NULL;

-- 2. Protection au niveau colonne
ALTER TABLE notifications ALTER COLUMN all_notif SET DEFAULT '[]'::jsonb;
ALTER TABLE notifications ALTER COLUMN all_notif SET NOT NULL;

-- 3. Fonction blindee
CREATE OR REPLACE FUNCTION append_notification(
  p_group_id        TEXT,        -- doit etre genere cote Node (nanoid/uuid)
  p_user_id         TEXT,        -- nullable
  p_fastfood_id     TEXT,        -- nullable
  p_target          TEXT,        -- 'all' pour broadcast
  p_notif           JSONB        -- { id, title, body, type, isRead:[], createdAt }
) RETURNS JSONB AS $$
DECLARE
  v_existing_id   TEXT;
  v_result        JSONB;
  v_now           TIMESTAMPTZ := NOW();
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM notifications WHERE user_id = p_user_id LIMIT 1;
  ELSIF p_fastfood_id IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM notifications WHERE fastfood_id = p_fastfood_id LIMIT 1;
  END IF;

  IF v_existing_id IS NULL THEN
    INSERT INTO notifications (id, user_id, fastfood_id, target, all_notif, updated_at, created_at)
    VALUES (
      p_group_id,
      p_user_id,
      p_fastfood_id,
      CASE WHEN p_fastfood_id IS NOT NULL THEN COALESCE(p_target, 'all') ELSE p_target END,
      jsonb_build_array(p_notif),
      v_now,
      v_now
    )
    RETURNING to_jsonb(notifications.*) INTO v_result;
  ELSE
    UPDATE notifications
       SET all_notif = jsonb_build_array(p_notif) || COALESCE(all_notif, '[]'::jsonb),
           updated_at = v_now
     WHERE id = v_existing_id
    RETURNING to_jsonb(notifications.*) INTO v_result;
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;
