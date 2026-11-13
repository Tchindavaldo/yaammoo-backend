-- ============================================================================
-- 070 — Quota de notifications boutique PAR AUDIENCE
-- ============================================================================
-- Un plan (`broadcast_plans`) porte en plus `audienceLimits` :
--   { "customers": { "dayLimit": 1, "weekLimit": 7 }, "city": { ... } }
-- Le quota global du plan (dayLimit / weekLimit) reste verifie ; celui de
-- l'audience l'est en plus, dans la MEME transaction et sous le MEME verrou.
--
-- Nouvelle surcharge a 15 parametres : l'ancienne (13) reste pour le code deja
-- deploye. NULL sur une limite d'audience = pas de plafond propre a l'audience.
-- Raisons de refus : week | day (plan) ; audience_week | audience_day.
-- Idempotent (CREATE OR REPLACE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.insert_fastfood_broadcast(
  p_id text, p_fastfood_id text, p_sender_uid text, p_title text, p_body text,
  p_image_url text, p_audience text, p_audience_city text, p_plan text,
  p_day_start timestamp with time zone, p_week_start timestamp with time zone,
  p_day_limit integer, p_week_limit integer,
  p_audience_day_limit integer, p_audience_week_limit integer
)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_day       INTEGER;
  v_week      INTEGER;
  v_aud_day   INTEGER;
  v_aud_week  INTEGER;
  v_row       fastfood_broadcasts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fastfood_broadcast:' || p_fastfood_id));

  SELECT COUNT(*) FILTER (WHERE b.sent_at >= p_day_start),
         COUNT(*),
         COUNT(*) FILTER (WHERE b.sent_at >= p_day_start AND b.audience = p_audience),
         COUNT(*) FILTER (WHERE b.audience = p_audience)
    INTO v_day, v_week, v_aud_day, v_aud_week
    FROM fastfood_broadcasts b
   WHERE b.fastfood_id = p_fastfood_id
     AND b.sent_at >= p_week_start;

  IF v_week >= p_week_limit THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'week');
  END IF;
  IF p_audience_week_limit IS NOT NULL AND v_aud_week >= p_audience_week_limit THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'audience_week');
  END IF;
  IF v_day >= p_day_limit THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'day');
  END IF;
  IF p_audience_day_limit IS NOT NULL AND v_aud_day >= p_audience_day_limit THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'audience_day');
  END IF;

  INSERT INTO fastfood_broadcasts (
    id, fastfood_id, sender_uid, title, body, image_url,
    audience, audience_city, plan, sent_at
  ) VALUES (
    p_id, p_fastfood_id, p_sender_uid, p_title, p_body, p_image_url,
    p_audience, p_audience_city, p_plan, NOW()
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'row', to_jsonb(v_row));
END;
$function$;

-- Plan gratuit (decision du 13/11/2026) : clients 1/jour et 7/semaine, ville
-- 1/semaine, tous : 0 (audience retiree du plan gratuit). Quota global = somme
-- des audiences (2/jour, 8/semaine), lu par les apps deja installees.
-- A appliquer APRES le deploiement du code qui lit `audienceLimits`.
-- UPDATE settings_notification SET value = '{"free":{"label":"Gratuit","dayLimit":2,"weekLimit":8,"audiences":["customers","city"],"audienceLimits":{"customers":{"dayLimit":1,"weekLimit":7},"city":{"dayLimit":1,"weekLimit":1}}}}'::jsonb WHERE key = 'broadcast_plans';
