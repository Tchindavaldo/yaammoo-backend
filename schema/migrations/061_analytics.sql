-- ============================================================================
-- 061_analytics.sql
-- ============================================================================
-- Statistiques d'usage (consultation réservée à l'admin). Voir
-- architecture/analytics.md.
--
--   1. analytics_connections   — une ligne par connexion socket (join_user) :
--                           qui, quand, combien de temps. Ouverte = en ligne.
--   2. analytics_sessions       — une ligne par ouverture de l'app (durée, appareil).
--   3. analytics_events   — événements envoyés par l'app (scroll du home,
--                           boutiques vues, entonnoir, recherches, bannières).
--   4. Fonctions d'agrégat lues par GET /analytics/*.
--
-- Données personnelles : supprimées avec le compte (ON DELETE CASCADE).
-- Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Connexions socket
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_connections (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  socket_id        TEXT,
  server_id        TEXT,                       -- machine qui tient le socket
  app_version      TEXT,
  platform         TEXT,
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at  TIMESTAMPTZ                 -- NULL = en ligne
);
CREATE INDEX IF NOT EXISTS idx_analytics_connections_user ON analytics_connections (user_id, connected_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_connections_at ON analytics_connections (connected_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_connections_open ON analytics_connections (server_id) WHERE disconnected_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2. Sessions de l'app (une ouverture = une session, id généré par l'app)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_sessions (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at        TIMESTAMPTZ NOT NULL,
  last_activity_at  TIMESTAMPTZ NOT NULL,
  ended_at          TIMESTAMPTZ,
  duration_ms       BIGINT NOT NULL DEFAULT 0,
  app_version       TEXT,
  platform          TEXT,
  os_version        TEXT,
  device_model      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_user ON analytics_sessions (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_at ON analytics_sessions (started_at DESC);

-- ----------------------------------------------------------------------------
-- 3. Événements
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_events (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id   TEXT,
  type         TEXT NOT NULL,
  fastfood_id  TEXT,
  menu_id      TEXT,
  banner_id    TEXT,
  data         JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at  TIMESTAMPTZ NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events (type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_fastfood ON analytics_events (fastfood_id, type) WHERE fastfood_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events (session_id);

-- ----------------------------------------------------------------------------
-- 4. Agrégats (bornes [p_from, p_to[)
-- ----------------------------------------------------------------------------

-- Connexions par utilisateur : nombre, première / dernière, temps connecté.
CREATE OR REPLACE FUNCTION analytics_connection_stats(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
  user_id TEXT, connection_count BIGINT, first_connected_at TIMESTAMPTZ,
  last_connected_at TIMESTAMPTZ, total_connected_s BIGINT, online BOOLEAN
) LANGUAGE sql STABLE AS $$
  SELECT c.user_id,
         COUNT(*),
         MIN(c.connected_at),
         MAX(c.connected_at),
         COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(c.disconnected_at, NOW()) - c.connected_at)))::BIGINT, 0),
         BOOL_OR(c.disconnected_at IS NULL)
  FROM analytics_connections c
  WHERE c.connected_at >= p_from AND c.connected_at < p_to
  GROUP BY c.user_id
  ORDER BY MAX(c.connected_at) DESC;
$$;

-- Sessions par utilisateur : nombre, temps total / moyen dans l'app.
CREATE OR REPLACE FUNCTION analytics_session_stats(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
  user_id TEXT, sessions BIGINT, total_ms BIGINT, avg_ms BIGINT, last_session_at TIMESTAMPTZ
) LANGUAGE sql STABLE AS $$
  SELECT s.user_id, COUNT(*), SUM(s.duration_ms)::BIGINT, AVG(s.duration_ms)::BIGINT, MAX(s.started_at)
  FROM analytics_sessions s
  WHERE s.started_at >= p_from AND s.started_at < p_to
  GROUP BY s.user_id
  ORDER BY MAX(s.started_at) DESC;
$$;

-- Scroll du home par utilisateur : pages chargées, page la plus profonde,
-- boutiques distinctes vues, temps moyen passé avant de charger la page suivante.
CREATE OR REPLACE FUNCTION analytics_home_scroll(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
  user_id TEXT, pages_loaded BIGINT, max_page INT, shops_seen BIGINT,
  avg_ms_before_next_page BIGINT
) LANGUAGE sql STABLE AS $$
  WITH pages AS (
    SELECT e.user_id,
           COUNT(*) AS pages_loaded,
           MAX((e.data->>'page')::INT) AS max_page,
           AVG((e.data->>'msSincePrevious')::NUMERIC)
             FILTER (WHERE (e.data->>'page')::INT > 1 AND e.data ? 'msSincePrevious') AS avg_ms
    FROM analytics_events e
    WHERE e.type = 'home_page_loaded' AND e.occurred_at >= p_from AND e.occurred_at < p_to
    GROUP BY e.user_id
  ), seen AS (
    SELECT e.user_id, COUNT(DISTINCT e.fastfood_id) AS shops_seen
    FROM analytics_events e
    WHERE e.type = 'shop_impression' AND e.occurred_at >= p_from AND e.occurred_at < p_to
    GROUP BY e.user_id
  )
  SELECT COALESCE(p.user_id, s.user_id), COALESCE(p.pages_loaded, 0), p.max_page,
         COALESCE(s.shops_seen, 0), p.avg_ms::BIGINT
  FROM pages p FULL OUTER JOIN seen s ON s.user_id = p.user_id;
$$;

-- Boutiques : affichages, personnes distinctes, temps moyen à l'écran,
-- ouvertures de la boutique et de ses menus.
CREATE OR REPLACE FUNCTION analytics_shop_views(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
  fastfood_id TEXT, impressions BIGINT, viewers BIGINT, avg_visible_ms BIGINT,
  opens BIGINT, menu_opens BIGINT, add_to_cart BIGINT
) LANGUAGE sql STABLE AS $$
  SELECT e.fastfood_id,
         COUNT(*) FILTER (WHERE e.type = 'shop_impression'),
         COUNT(DISTINCT e.user_id) FILTER (WHERE e.type = 'shop_impression'),
         AVG((e.data->>'visibleMs')::NUMERIC) FILTER (WHERE e.type = 'shop_impression')::BIGINT,
         COUNT(*) FILTER (WHERE e.type = 'shop_open'),
         COUNT(*) FILTER (WHERE e.type = 'menu_open'),
         COUNT(*) FILTER (WHERE e.type = 'add_to_cart')
  FROM analytics_events e
  WHERE e.fastfood_id IS NOT NULL AND e.occurred_at >= p_from AND e.occurred_at < p_to
  GROUP BY e.fastfood_id
  ORDER BY 2 DESC;
$$;

-- Entonnoir commande : personnes et événements par étape.
CREATE OR REPLACE FUNCTION analytics_funnel(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (step TEXT, users BIGINT, events BIGINT) LANGUAGE sql STABLE AS $$
  WITH steps(step, ord) AS (
    VALUES ('shop_open', 1), ('menu_open', 2), ('add_to_cart', 3),
           ('checkout_start', 4), ('payment_success', 5), ('payment_failed', 6)
  ), ev AS (
    SELECT e.user_id,
           CASE WHEN e.type = 'payment_result' THEN 'payment_' || COALESCE(e.data->>'status', 'failed')
                ELSE e.type END AS step
    FROM analytics_events e
    WHERE e.type IN ('shop_open', 'menu_open', 'add_to_cart', 'checkout_start', 'payment_result')
      AND e.occurred_at >= p_from AND e.occurred_at < p_to
  )
  SELECT s.step, COUNT(DISTINCT ev.user_id), COUNT(ev.user_id)
  FROM steps s LEFT JOIN ev ON ev.step = s.step
  GROUP BY s.step, s.ord
  ORDER BY s.ord;
$$;

-- Recherches : termes, nombre, personnes, recherches sans résultat.
CREATE OR REPLACE FUNCTION analytics_top_searches(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ, p_limit INT)
RETURNS TABLE (query TEXT, searches BIGINT, users BIGINT, zero_results BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT LOWER(TRIM(e.data->>'query')),
         COUNT(*),
         COUNT(DISTINCT e.user_id),
         COUNT(*) FILTER (WHERE (e.data->>'resultsCount')::INT = 0)
  FROM analytics_events e
  WHERE e.type = 'search' AND e.occurred_at >= p_from AND e.occurred_at < p_to
    AND COALESCE(TRIM(e.data->>'query'), '') <> ''
  GROUP BY 1
  ORDER BY 2 DESC
  LIMIT p_limit;
$$;

-- Bannières : vues, clics, personnes.
CREATE OR REPLACE FUNCTION analytics_banners(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (banner_id TEXT, views BIGINT, clicks BIGINT, viewers BIGINT, clickers BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT e.banner_id,
         COUNT(*) FILTER (WHERE e.type = 'banner_view'),
         COUNT(*) FILTER (WHERE e.type = 'banner_click'),
         COUNT(DISTINCT e.user_id) FILTER (WHERE e.type = 'banner_view'),
         COUNT(DISTINCT e.user_id) FILTER (WHERE e.type = 'banner_click')
  FROM analytics_events e
  WHERE e.banner_id IS NOT NULL AND e.type IN ('banner_view', 'banner_click')
    AND e.occurred_at >= p_from AND e.occurred_at < p_to
  GROUP BY e.banner_id
  ORDER BY 2 DESC;
$$;

-- Série par jour (heure de Douala), jours vides inclus : utilisateurs actifs,
-- sessions, temps passé, connexions, pages du home, boutiques affichées /
-- ouvertes, ajouts panier, paiements lancés / réussis, recherches.
CREATE OR REPLACE FUNCTION analytics_daily(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
  day DATE, active_users BIGINT, sessions BIGINT, total_ms BIGINT, connections BIGINT,
  home_pages BIGINT, impressions BIGINT, shop_opens BIGINT, add_to_cart BIGINT,
  checkouts BIGINT, payments_success BIGINT, searches BIGINT
) LANGUAGE sql STABLE AS $$
  WITH days AS (
    SELECT generate_series(
      (p_from AT TIME ZONE 'Africa/Douala')::DATE,
      ((p_to - INTERVAL '1 microsecond') AT TIME ZONE 'Africa/Douala')::DATE,
      INTERVAL '1 day'
    )::DATE AS day
  ), s AS (
    SELECT (started_at AT TIME ZONE 'Africa/Douala')::DATE AS day,
           COUNT(*) AS sessions, SUM(duration_ms)::BIGINT AS total_ms
    FROM analytics_sessions
    WHERE started_at >= p_from AND started_at < p_to
    GROUP BY 1
  ), c AS (
    SELECT (connected_at AT TIME ZONE 'Africa/Douala')::DATE AS day, COUNT(*) AS connections
    FROM analytics_connections
    WHERE connected_at >= p_from AND connected_at < p_to
    GROUP BY 1
  ), e AS (
    SELECT (occurred_at AT TIME ZONE 'Africa/Douala')::DATE AS day,
           COUNT(*) FILTER (WHERE type = 'home_page_loaded') AS home_pages,
           COUNT(*) FILTER (WHERE type = 'shop_impression') AS impressions,
           COUNT(*) FILTER (WHERE type = 'shop_open') AS shop_opens,
           COUNT(*) FILTER (WHERE type = 'add_to_cart') AS add_to_cart,
           COUNT(*) FILTER (WHERE type = 'checkout_start') AS checkouts,
           COUNT(*) FILTER (WHERE type = 'payment_result' AND data->>'status' = 'success') AS payments_success,
           COUNT(*) FILTER (WHERE type = 'search') AS searches
    FROM analytics_events
    WHERE occurred_at >= p_from AND occurred_at < p_to
    GROUP BY 1
  ), u AS (
    SELECT day, COUNT(DISTINCT user_id) AS active_users FROM (
      SELECT (started_at AT TIME ZONE 'Africa/Douala')::DATE AS day, user_id
      FROM analytics_sessions WHERE started_at >= p_from AND started_at < p_to
      UNION ALL
      SELECT (connected_at AT TIME ZONE 'Africa/Douala')::DATE, user_id
      FROM analytics_connections WHERE connected_at >= p_from AND connected_at < p_to
    ) x GROUP BY day
  )
  SELECT d.day,
         COALESCE(u.active_users, 0), COALESCE(s.sessions, 0), COALESCE(s.total_ms, 0),
         COALESCE(c.connections, 0), COALESCE(e.home_pages, 0), COALESCE(e.impressions, 0),
         COALESCE(e.shop_opens, 0), COALESCE(e.add_to_cart, 0), COALESCE(e.checkouts, 0),
         COALESCE(e.payments_success, 0), COALESCE(e.searches, 0)
  FROM days d
  LEFT JOIN s ON s.day = d.day
  LEFT JOIN c ON c.day = d.day
  LEFT JOIN e ON e.day = d.day
  LEFT JOIN u ON u.day = d.day
  ORDER BY d.day;
$$;
