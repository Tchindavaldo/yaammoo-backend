-- ============================================================================
-- 053_fastfood_broadcasts.sql
-- ============================================================================
-- Notifications envoyées par une boutique à des clients (Settings → Boutique →
-- Notifications dans l'app). Voir architecture/notifications-broadcast.md.
--
--   1. fastfoods.broadcast_plan  — plan d'envoi de la boutique ('free' par défaut)
--   2. fastfood_broadcasts       — un envoi = une ligne (historique + quota)
--   3. insert_fastfood_broadcast — insertion SOUS QUOTA, atomique par boutique
--   4. fastfood_customer_ids     — destinataires de l'audience « mes clients »
--   5. settings_notification     — plans et bornes de quota, modifiables à chaud
--
-- L'audience « ville » (`city_user_ids`) s'appuie sur la localisation des
-- utilisateurs : elle est définie par la migration 054.
--
-- ⚠️ À appliquer AVANT de déployer le code : `settings.repo` lit la nouvelle
-- table `settings_notification` avec les autres catégories.
--
-- Idempotent : rejouable sans écraser un réglage modifié en production.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Plan de la boutique
-- ----------------------------------------------------------------------------
-- Clé dans le réglage `broadcast_plans` (étape 5). Une clé inconnue retombe sur
-- 'free' côté service : un plan retiré ne doit pas couper l'envoi.
ALTER TABLE fastfoods
  ADD COLUMN IF NOT EXISTS broadcast_plan TEXT NOT NULL DEFAULT 'free';

-- ----------------------------------------------------------------------------
-- 2. Envois
-- ----------------------------------------------------------------------------
-- La table `notifications` range les notifications par DESTINATAIRE : elle ne
-- permet ni l'historique d'une boutique, ni le décompte de son quota. D'où une
-- table dédiée, source de vérité de l'envoi.
CREATE TABLE IF NOT EXISTS fastfood_broadcasts (
  id               TEXT PRIMARY KEY,
  fastfood_id      TEXT NOT NULL REFERENCES fastfoods(id) ON DELETE CASCADE,
  sender_uid       TEXT NOT NULL,
  title            TEXT NOT NULL,
  body             TEXT,
  image_url        TEXT,
  audience         TEXT NOT NULL,
  audience_city    TEXT,
  -- Plan au moment de l'envoi : un changement de plan ne réécrit pas l'historique.
  plan             TEXT NOT NULL,
  -- Renseignés à la fin de la diffusion (asynchrone, après la réponse HTTP).
  recipients_count INTEGER NOT NULL DEFAULT 0,
  pushed_count     INTEGER NOT NULL DEFAULT 0,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fastfood_broadcasts_audience_chk
    CHECK (audience IN ('customers', 'city', 'all')),
  CONSTRAINT fastfood_broadcasts_city_chk
    CHECK (audience <> 'city' OR audience_city IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_fastfood_broadcasts_sent
  ON fastfood_broadcasts(fastfood_id, sent_at DESC);

-- ----------------------------------------------------------------------------
-- 3. Insertion sous quota
-- ----------------------------------------------------------------------------
-- Compte et insère dans la MÊME transaction, sous un verrou propre à la
-- boutique : deux envois simultanés ne peuvent pas franchir le quota ensemble.
-- Les bornes (début du jour, début de semaine) sont calculées par le service,
-- qui porte le fuseau (`broadcast_utc_offset_minutes`).
-- Retour : { ok: true, row } ou { ok: false, reason: 'day' | 'week' }.
CREATE OR REPLACE FUNCTION insert_fastfood_broadcast(
  p_id            TEXT,
  p_fastfood_id   TEXT,
  p_sender_uid    TEXT,
  p_title         TEXT,
  p_body          TEXT,
  p_image_url     TEXT,
  p_audience      TEXT,
  p_audience_city TEXT,
  p_plan          TEXT,
  p_day_start     TIMESTAMPTZ,
  p_week_start    TIMESTAMPTZ,
  p_day_limit     INTEGER,
  p_week_limit    INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_day  INTEGER;
  v_week INTEGER;
  v_row  fastfood_broadcasts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fastfood_broadcast:' || p_fastfood_id));

  SELECT COUNT(*) FILTER (WHERE b.sent_at >= p_day_start), COUNT(*)
    INTO v_day, v_week
    FROM fastfood_broadcasts b
   WHERE b.fastfood_id = p_fastfood_id
     AND b.sent_at >= p_week_start;

  IF v_week >= p_week_limit THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'week');
  END IF;
  IF v_day >= p_day_limit THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'day');
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
$$;

-- ----------------------------------------------------------------------------
-- 4. Destinataires « mes clients »
-- ----------------------------------------------------------------------------
-- « Client » = a passé au moins une commande réelle : `pendingToBuy` (panier non
-- payé) exclu, annulations incluses (le client existe). Triés pour une lecture
-- paginée stable (PostgREST plafonne un appel à 1000 lignes).
CREATE OR REPLACE FUNCTION fastfood_customer_ids(p_fastfood_id TEXT)
RETURNS TABLE (uid TEXT)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT o.user_id
    FROM orders o
   WHERE o.fastfood_id = p_fastfood_id
     AND o.deleted_at IS NULL
     AND o.status <> 'pendingToBuy'
   ORDER BY 1;
$$;

-- ----------------------------------------------------------------------------
-- 5. Réglages : catégorie « notification »
-- ----------------------------------------------------------------------------
-- Même forme que les autres tables `settings_*` (migration 046).
CREATE TABLE IF NOT EXISTS settings_notification (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO settings_notification (key, value, description) VALUES
  ('broadcast_plans',
   '{"free": {"label": "Gratuit", "dayLimit": 3, "weekLimit": 10, "audiences": ["customers", "city", "all"]}}'::jsonb,
   'Plans d''envoi de notifications boutique, par cle (= fastfoods.broadcast_plan) : libelle, quota par jour et par semaine, audiences autorisees (customers, city, all).'),
  ('broadcast_utc_offset_minutes', '60'::jsonb,
   'Decalage horaire (minutes) des bornes de quota : le jour commence a minuit, la semaine le lundi. 60 = Cameroun (UTC+1).')
ON CONFLICT (key) DO NOTHING;
