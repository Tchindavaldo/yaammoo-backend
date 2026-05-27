-- ============================================================================
-- YAAMMOO - Schema PostgreSQL pour Supabase
-- Migration depuis Firestore
-- ============================================================================
-- Conventions :
--   * IDs en TEXT pour conserver les IDs Firestore existants
--   * Timestamps en TIMESTAMPTZ (UTC), conversion depuis ISO strings Firestore
--   * JSONB pour structures imbriquées (delivery, menu_snapshot, extra, drink)
--   * Tables relationnelles pour push_tokens (anciennement array d'objets)
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABLE: users
-- ============================================================================
-- L'ID est le Firebase UID. infos.* est dénormalisé en colonnes plates.
-- pushTokens / fcmTokens sortis dans des tables dédiées.
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  uid             TEXT,
  nom             TEXT,
  prenom          TEXT,
  age             INTEGER,
  numero          BIGINT,
  email           TEXT,
  password        TEXT,
  fastfood_id     TEXT,
  is_marchand     BOOLEAN DEFAULT FALSE,
  statistique     INTEGER DEFAULT 0,
  cmd             JSONB DEFAULT '[]'::jsonb,
  extra_data      JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_uid ON users(uid);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_numero ON users(numero);
CREATE INDEX IF NOT EXISTS idx_users_fastfood_id ON users(fastfood_id);

-- ============================================================================
-- TABLE: user_push_tokens
-- ============================================================================
-- Remplace l'array d'objets users.pushTokens[].
-- Une ligne par (user_id, device_id). Upsert sur cette clé pour refresh.
CREATE TABLE IF NOT EXISTS user_push_tokens (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id   TEXT NOT NULL,
  token       TEXT NOT NULL,
  platform    TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  last_seen   TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user ON user_push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_token ON user_push_tokens(token);

-- ============================================================================
-- TABLE: user_fcm_tokens (legacy)
-- ============================================================================
-- Remplace l'array users.fcmTokens[] (tokens sans métadonnées).
-- Gardée pour compatibilité avec l'ancien code.
CREATE TABLE IF NOT EXISTS user_fcm_tokens (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, token)
);

-- ============================================================================
-- TABLE: fastfoods
-- ============================================================================
CREATE TABLE IF NOT EXISTS fastfoods (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  name              TEXT,
  number            TEXT,
  open_time         TEXT,
  close_time        TEXT,
  image             TEXT,
  order_lead_time   INTEGER,
  delivery_hours    JSONB DEFAULT '[]'::jsonb,
  extra_data        JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fastfoods_user_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_fastfoods_user_id ON fastfoods(user_id);

-- ============================================================================
-- TABLE: menus
-- ============================================================================
CREATE TABLE IF NOT EXISTS menus (
  id              TEXT PRIMARY KEY,
  fastfood_id     TEXT NOT NULL REFERENCES fastfoods(id) ON DELETE CASCADE,
  titre           TEXT,
  name            TEXT,
  prix1           NUMERIC(12,2),
  prix2           NUMERIC(12,2),
  prix3           NUMERIC(12,2),
  option_prix1    TEXT,
  option_prix2    TEXT,
  option_prix3    TEXT,
  image           TEXT,
  cover_image     TEXT,
  images          JSONB DEFAULT '[]'::jsonb,
  disponibilite   TEXT,
  status          TEXT,
  stock           INTEGER DEFAULT 0,
  extra           JSONB DEFAULT '[]'::jsonb,
  drink           JSONB DEFAULT '[]'::jsonb,
  extra_data      JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menus_fastfood ON menus(fastfood_id);
CREATE INDEX IF NOT EXISTS idx_menus_fastfood_created ON menus(fastfood_id, created_at DESC);

-- ============================================================================
-- TABLE: orders
-- ============================================================================
-- menu_snapshot conserve le menu tel qu'au moment de la commande (prix, options).
-- delivery est en JSONB car forme variable (status, type, time, date, address, phone, voiceNoteUri, note).
-- delivery_date est dupliqué en colonne pour permettre indexation rapide.
CREATE TABLE IF NOT EXISTS orders (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  fastfood_id       TEXT NOT NULL,
  menu_id           TEXT,
  menu_snapshot     JSONB,
  quantity          INTEGER DEFAULT 1,
  extra             JSONB DEFAULT '[]'::jsonb,
  drink             JSONB DEFAULT '[]'::jsonb,
  delivery          JSONB DEFAULT '{}'::jsonb,
  delivery_date     DATE,
  total             NUMERIC(12,2),
  status            TEXT NOT NULL,
  rank              INTEGER,
  client_id         TEXT,
  period_key        TEXT,
  extra_data        JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_fastfood_created ON orders(fastfood_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_orders_queue ON orders(fastfood_id, status, delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_menu ON orders(menu_id);

-- ============================================================================
-- TABLE: rank_counters
-- ============================================================================
-- Compteur atomique pour le ranking des commandes dans une file.
-- ID composite : {fastfood_id}_{delivery_date}_{status} (préservé depuis Firestore).
CREATE TABLE IF NOT EXISTS rank_counters (
  id              TEXT PRIMARY KEY,
  fastfood_id     TEXT NOT NULL,
  delivery_date   DATE NOT NULL,
  status          TEXT NOT NULL,
  value           INTEGER NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rank_counters_lookup
  ON rank_counters(fastfood_id, delivery_date, status);

-- ============================================================================
-- TABLE: transactions
-- ============================================================================
CREATE TABLE IF NOT EXISTS transactions (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL,
  type                TEXT,
  amount              NUMERIC(12,2),
  current_amount      NUMERIC(12,2),
  pay_by              TEXT,
  name                TEXT,
  remaining_amount    NUMERIC(12,2),
  extra_data          JSONB DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_created
  ON transactions(user_id, created_at DESC);

-- ============================================================================
-- TABLE: bonus
-- ============================================================================
CREATE TABLE IF NOT EXISTS bonus (
  id          TEXT PRIMARY KEY,
  data        JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- TABLE: bonus_requests
-- ============================================================================
-- status est un array d'objets {status, totalBonus, createdAt} en JSONB.
CREATE TABLE IF NOT EXISTS bonus_requests (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  bonus_id    TEXT NOT NULL,
  bonus_type  TEXT,
  status      JSONB DEFAULT '[]'::jsonb,
  extra_data  JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bonus_requests_lookup
  ON bonus_requests(bonus_id, user_id, bonus_type);

-- ============================================================================
-- TABLE: notifications
-- ============================================================================
-- allNotif est gardé en JSONB car structure imbriquée complexe
-- (id, title, body, type, isRead[], createdAt) avec mutations fréquentes
-- via array_append côté Node.
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,
  fastfood_id TEXT,
  target      TEXT,
  all_notif   JSONB DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT notifications_owner CHECK (
    (user_id IS NOT NULL AND fastfood_id IS NULL) OR
    (user_id IS NULL AND fastfood_id IS NOT NULL) OR
    (target = 'all')
  )
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_fastfood ON notifications(fastfood_id);
CREATE INDEX IF NOT EXISTS idx_notifications_target ON notifications(target);

-- ============================================================================
-- FONCTIONS ATOMIQUES POUR LE RANKING
-- ============================================================================
-- Ces fonctions remplacent les Firestore transactions du fichier
-- BACKEND/src/services/order/rankQueue.service.js
-- Toute l'atomicité est garantie par PostgreSQL.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- reserve_rank : réserve un nouveau rank dans une file (pour création de commande).
-- Retourne le rank attribué.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reserve_rank(
  p_fastfood_id   TEXT,
  p_delivery_date DATE,
  p_status        TEXT
) RETURNS INTEGER AS $$
DECLARE
  v_id        TEXT := p_fastfood_id || '_' || p_delivery_date::text || '_' || p_status;
  v_new_rank  INTEGER;
BEGIN
  INSERT INTO rank_counters (id, fastfood_id, delivery_date, status, value, updated_at)
  VALUES (v_id, p_fastfood_id, p_delivery_date, p_status, 1, NOW())
  ON CONFLICT (id) DO UPDATE
    SET value = rank_counters.value + 1,
        updated_at = NOW()
  RETURNING value INTO v_new_rank;

  RETURN v_new_rank;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- assign_rank : assigne un nouveau rank à une commande existante.
-- Combine la réservation et l'écriture sur orders en une seule transaction.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assign_rank(
  p_order_id      TEXT,
  p_fastfood_id   TEXT,
  p_delivery_date DATE,
  p_status        TEXT
) RETURNS INTEGER AS $$
DECLARE
  v_new_rank INTEGER;
BEGIN
  v_new_rank := reserve_rank(p_fastfood_id, p_delivery_date, p_status);

  UPDATE orders
     SET rank = v_new_rank,
         updated_at = NOW()
   WHERE id = p_order_id;

  RETURN v_new_rank;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- reindex_queue : décale les ranks dans une file après suppression d'éléments.
-- Reproduit la logique de rankQueue.service.js → reindexQueue().
-- Retourne la liste des commandes mises à jour pour que Node puisse émettre les
-- events Socket.io et envoyer les notifications push (logique métier non-DB
-- gardée côté Node).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reindex_queue(
  p_fastfood_id   TEXT,
  p_delivery_date DATE,
  p_status        TEXT,
  p_removed_ranks INTEGER[]
) RETURNS TABLE (
  id         TEXT,
  user_id    TEXT,
  rank       INTEGER,
  status     TEXT,
  delivery   JSONB
) AS $$
DECLARE
  v_counter_id  TEXT := p_fastfood_id || '_' || p_delivery_date::text || '_' || p_status;
  v_sorted      INTEGER[];
BEGIN
  -- Sort ascending pour calcul de décrément correct
  SELECT array_agg(r ORDER BY r) INTO v_sorted
    FROM unnest(p_removed_ranks) AS r;

  IF v_sorted IS NULL OR array_length(v_sorted, 1) = 0 THEN
    RETURN;
  END IF;

  -- Mise à jour des ranks : pour chaque commande, décrémenter du nombre
  -- de ranks supprimés qui sont strictement inférieurs au rank courant.
  WITH updated AS (
    UPDATE orders o
       SET rank = o.rank - (
             SELECT COUNT(*) FROM unnest(v_sorted) r WHERE r < o.rank
           ),
           updated_at = NOW()
     WHERE o.fastfood_id = p_fastfood_id
       AND o.status = p_status
       AND o.delivery_date = p_delivery_date
       AND o.rank IS NOT NULL
       AND o.rank > v_sorted[1]
       AND (SELECT COUNT(*) FROM unnest(v_sorted) r WHERE r < o.rank) > 0
    RETURNING o.id, o.user_id, o.rank, o.status, o.delivery
  )
  SELECT * FROM updated;

  -- Décrémenter le compteur de la file (mais jamais en dessous de 0)
  UPDATE rank_counters
     SET value = GREATEST(0, value - array_length(v_sorted, 1)),
         updated_at = NOW()
   WHERE id = v_counter_id;

  RETURN QUERY
    SELECT o.id, o.user_id, o.rank, o.status, o.delivery
      FROM orders o
     WHERE o.fastfood_id = p_fastfood_id
       AND o.status = p_status
       AND o.delivery_date = p_delivery_date
       AND o.rank IS NOT NULL
       AND o.rank >= v_sorted[1]
     ORDER BY o.rank ASC;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- reset_counter : réinitialise le compteur d'une file à une valeur donnée.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reset_counter(
  p_fastfood_id   TEXT,
  p_delivery_date DATE,
  p_status        TEXT,
  p_value         INTEGER
) RETURNS VOID AS $$
DECLARE
  v_id TEXT := p_fastfood_id || '_' || p_delivery_date::text || '_' || p_status;
BEGIN
  INSERT INTO rank_counters (id, fastfood_id, delivery_date, status, value, updated_at)
  VALUES (v_id, p_fastfood_id, p_delivery_date, p_status, COALESCE(p_value, 0), NOW())
  ON CONFLICT (id) DO UPDATE
    SET value = COALESCE(p_value, 0),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FONCTION ATOMIQUE : create_order_with_stock_check
-- ============================================================================
-- Reproduit createOrder.js avec atomicité :
--   1. Vérifie le stock du menu (si status=pending et menu_id présent)
--   2. Décrémente le stock
--   3. Réserve le rank si status=pending
--   4. Insère la commande
-- Tout dans une seule transaction PostgreSQL.
-- Retourne la commande créée ou une erreur (stock insuffisant).
-- ============================================================================
CREATE OR REPLACE FUNCTION create_order_with_stock_check(
  p_order_id      TEXT,
  p_user_id       TEXT,
  p_fastfood_id   TEXT,
  p_menu_id       TEXT,
  p_menu_snapshot JSONB,
  p_quantity      INTEGER,
  p_extra         JSONB,
  p_drink         JSONB,
  p_delivery      JSONB,
  p_delivery_date DATE,
  p_total         NUMERIC,
  p_status        TEXT
) RETURNS JSONB AS $$
DECLARE
  v_current_stock INTEGER;
  v_new_stock     INTEGER;
  v_rank          INTEGER;
  v_now           TIMESTAMPTZ := NOW();
  v_result        JSONB;
BEGIN
  -- 1. Stock check (uniquement pour status=pending)
  IF p_status = 'pending' AND p_menu_id IS NOT NULL THEN
    SELECT stock INTO v_current_stock FROM menus WHERE id = p_menu_id FOR UPDATE;

    IF v_current_stock IS NOT NULL THEN
      IF v_current_stock < COALESCE(p_quantity, 1) THEN
        RETURN jsonb_build_object(
          'error',
          'Stock insuffisant. Stock disponible : ' || v_current_stock
        );
      END IF;
      v_new_stock := v_current_stock - COALESCE(p_quantity, 1);
      UPDATE menus SET stock = v_new_stock, updated_at = v_now WHERE id = p_menu_id;
    END IF;
  END IF;

  -- 2. Réservation de rank (uniquement pour status=pending)
  IF p_status = 'pending' THEN
    v_rank := reserve_rank(p_fastfood_id, p_delivery_date, 'pending');
  END IF;

  -- 3. Insertion de la commande
  INSERT INTO orders (
    id, user_id, fastfood_id, menu_id, menu_snapshot, quantity,
    extra, drink, delivery, delivery_date, total, status, rank,
    created_at, updated_at
  ) VALUES (
    p_order_id, p_user_id, p_fastfood_id, p_menu_id, p_menu_snapshot,
    COALESCE(p_quantity, 1), p_extra, p_drink, p_delivery, p_delivery_date,
    p_total, p_status, v_rank, v_now, v_now
  )
  RETURNING jsonb_build_object(
    'id', id,
    'user_id', user_id,
    'fastfood_id', fastfood_id,
    'menu_id', menu_id,
    'menu_snapshot', menu_snapshot,
    'quantity', quantity,
    'extra', extra,
    'drink', drink,
    'delivery', delivery,
    'delivery_date', delivery_date,
    'total', total,
    'status', status,
    'rank', rank,
    'created_at', created_at,
    'updated_at', updated_at,
    'new_stock', v_new_stock
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FONCTION : append_notification
-- ============================================================================
-- Append atomique d'une notification à l'array all_notif d'un groupe.
-- Crée le groupe s'il n'existe pas (userId XOR fastFoodId).
-- Retourne le doc de notification mis à jour.
-- ============================================================================
CREATE OR REPLACE FUNCTION append_notification(
  p_group_id        TEXT,        -- doit être généré côté Node (nanoid/uuid)
  p_user_id         TEXT,        -- nullable
  p_fastfood_id     TEXT,        -- nullable
  p_target          TEXT,        -- 'all' pour broadcast
  p_notif           JSONB        -- { id, title, body, type, isRead:[], createdAt }
) RETURNS JSONB AS $$
DECLARE
  v_existing_id   TEXT;
  v_new_all_notif JSONB;
  v_result        JSONB;
  v_now           TIMESTAMPTZ := NOW();
BEGIN
  -- Cherche un groupe existant pour ce user ou ce fastfood
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM notifications WHERE user_id = p_user_id LIMIT 1;
  ELSIF p_fastfood_id IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM notifications WHERE fastfood_id = p_fastfood_id LIMIT 1;
  END IF;

  IF v_existing_id IS NULL THEN
    -- Création nouveau groupe
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
    -- Prepend dans l'array existant
    UPDATE notifications
       SET all_notif = jsonb_build_array(p_notif) || all_notif,
           updated_at = v_now
     WHERE id = v_existing_id
    RETURNING to_jsonb(notifications.*) INTO v_result;
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FONCTION : mark_notification_read
-- ============================================================================
-- Marque comme lue (ajoute user_id à isRead[]) une notification dans l'array
-- all_notif d'un groupe. Idempotent (n'ajoute pas si déjà présent).
-- ============================================================================
CREATE OR REPLACE FUNCTION mark_notification_read(
  p_group_id TEXT,
  p_notif_id TEXT,
  p_user_id  TEXT
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  UPDATE notifications n
     SET all_notif = (
       SELECT jsonb_agg(
         CASE
           WHEN elem->>'id' = p_notif_id THEN
             jsonb_set(
               elem,
               '{isRead}',
               CASE
                 WHEN elem->'isRead' @> to_jsonb(p_user_id) THEN elem->'isRead'
                 ELSE COALESCE(elem->'isRead', '[]'::jsonb) || to_jsonb(p_user_id)
               END
             )
           ELSE elem
         END
       )
       FROM jsonb_array_elements(n.all_notif) elem
     ),
     updated_at = NOW()
   WHERE id = p_group_id
   RETURNING to_jsonb(n.*) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FIN DU SCHEMA
-- ============================================================================
