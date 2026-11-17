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
  is_admin        BOOLEAN DEFAULT FALSE,
  statistique     INTEGER DEFAULT 0,
  cmd             JSONB DEFAULT '[]'::jsonb,
  extra_data      JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  driver_rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0,   -- migration 011
  driver_rating_count INTEGER NOT NULL DEFAULT 0   -- migration 011
);
CREATE INDEX IF NOT EXISTS idx_users_extra_driver ON users ((extra_data ->> 'driverId'));
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users (is_admin) WHERE is_admin = true;

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
-- TABLE: user_fcm_tokens — SUPPRIMÉE
-- ============================================================================
-- Remplacée intégralement par user_push_tokens (qui contient le device_id et
-- la platform). Le code applicatif ne référence plus cette table.
-- À DROP en prod après vérification :
--   DROP TABLE IF EXISTS user_fcm_tokens;

-- ============================================================================
-- TABLE: fastfoods
-- ============================================================================
CREATE TABLE IF NOT EXISTS fastfoods (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  name              TEXT,
  number            TEXT,
  momo_number       TEXT,
  whatsapp_number   TEXT,
  open_time         TEXT,
  close_time        TEXT,
  image             TEXT,
  order_lead_time   INTEGER,
  advance_days      INTEGER DEFAULT 0,
  pickup_allowed    BOOLEAN DEFAULT FALSE,   -- migration 025 (ex pickup_only, sens inversé)
  cities            JSONB DEFAULT '[]'::jsonb,
  delivery_hours    JSONB DEFAULT '[]'::jsonb,
  extra_data        JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  -- Suppression admin en SOFT DELETE (migration 047) : la boutique est marquée
  -- ici, puis réellement effacée après la rétention. Toutes les lectures
  -- courantes filtrent `deleted_at IS NULL`.
  deleted_at        TIMESTAMPTZ,
  driver_rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0,   -- migration 012
  driver_rating_count INTEGER NOT NULL DEFAULT 0,   -- migration 012
  delivery_by       TEXT NOT NULL DEFAULT 'fastfood',   -- migration 037, lu via settings_app.platform_delivery_all 074
  platform_delivery_zones JSONB DEFAULT '[]'::jsonb,   -- migration 037, 073
  open_days         SMALLINT[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}'::smallint[],   -- migration 049
  is_available      BOOLEAN NOT NULL DEFAULT TRUE,   -- migration 049
  broadcast_plan    TEXT NOT NULL DEFAULT 'free',   -- migration 053
  latitude          DOUBLE PRECISION,   -- migration 054
  longitude         DOUBLE PRECISION,   -- migration 054
  drinks            JSONB NOT NULL DEFAULT '[]'::jsonb,   -- migration 062
  express_zones     JSONB DEFAULT '[]'::jsonb,   -- migration 073
  platform_express_zones JSONB DEFAULT '[]'::jsonb,   -- migration 073
  deleted_reason    TEXT,   -- migration 080
  CONSTRAINT fastfoods_delivery_by_chk CHECK (delivery_by IN ('fastfood', 'platform')),
  CONSTRAINT fastfoods_user_unique UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS idx_fastfoods_delivery_by_platform ON fastfoods (delivery_by) WHERE delivery_by = 'platform';

CREATE INDEX IF NOT EXISTS idx_fastfoods_user_id ON fastfoods(user_id);
CREATE INDEX IF NOT EXISTS idx_fastfoods_alive ON fastfoods(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fastfoods_deleted_at ON fastfoods(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- TABLE: menus
-- ============================================================================
CREATE TABLE IF NOT EXISTS menus (
  id              TEXT PRIMARY KEY,
  -- RESTRICT et non CASCADE (migration 047) : une cascade effacerait les menus
  -- au DELETE de la boutique, court-circuitant la rétention du soft delete.
  fastfood_id     TEXT NOT NULL REFERENCES fastfoods(id) ON DELETE RESTRICT,
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
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,  -- soft delete (migration 047)
  rating_avg        NUMERIC(3,2) NOT NULL DEFAULT 0,   -- migration 011
  rating_count      INTEGER NOT NULL DEFAULT 0,   -- migration 011
  category          TEXT   -- migration 088
);
CREATE INDEX IF NOT EXISTS menus_category_lower_idx ON menus (lower(category)) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_menus_fastfood ON menus(fastfood_id);
CREATE INDEX IF NOT EXISTS idx_menus_fastfood_created ON menus(fastfood_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_menus_alive ON menus(fastfood_id) WHERE deleted_at IS NULL;

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
  driver_id         TEXT,
  -- Panier (migration 022) : une commande = un plat, donc un panier arrive comme
  -- plusieurs commandes. `group_id` permet de les réafficher ensemble.
  -- À distinguer de order_deliveries.delivery_group_id, qui groupe par
  -- (panier, BOUTIQUE) pour la comptabilité.
  group_id          TEXT,
  extra_data        JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,  -- soft delete (migration 047)
  user_data         JSONB DEFAULT '{}'::jsonb,   -- migration 007
  selected_price_index INTEGER   -- migration 007
);
CREATE INDEX IF NOT EXISTS idx_orders_driver_status ON orders (driver_id, status) WHERE driver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_alive ON orders(fastfood_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_fastfood_created ON orders(fastfood_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_orders_queue ON orders(fastfood_id, status, delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_menu ON orders(menu_id);
CREATE INDEX IF NOT EXISTS idx_orders_driver ON orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_group ON orders(group_id) WHERE group_id IS NOT NULL;

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
  -- Migration 064 : portefeuille par réseau. aggregator = 'pawapay' | 'digikuntz'
  -- (seul pawaPay compte dans le solde), network = 'MTN' | 'ORANGEMONEY'.
  aggregator          TEXT,
  network             TEXT,
  mw_transaction_id   TEXT,
  extra_data          JSONB DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_created
  ON transactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_wallet
  ON transactions (user_id, aggregator, network)
  WHERE type IN ('merchant_credit', 'driver_credit', 'withdrawal');

-- ============================================================================
-- TABLE: bonus
-- ============================================================================
-- `criteria` reste JSONB : sous-objet cohérent {kind, target, period}.
CREATE TABLE IF NOT EXISTS bonus (
  id             TEXT PRIMARY KEY,
  type           TEXT,
  name           TEXT,
  description    TEXT,
  criteria       JSONB DEFAULT '{}'::jsonb,
  -- RESTRICT et non CASCADE (migration 047) : la rétention du soft delete
  -- passe avant toute suppression en chaîne.
  fastfood_id    TEXT REFERENCES fastfoods(id) ON DELETE RESTRICT,
  fastfood_name  TEXT,
  active         BOOLEAN DEFAULT TRUE,
  -- Livraison manuelle (016) : le claim reste `pending` au lieu d'être
  -- auto-approuvé, jusqu'à ce qu'un admin/marchand fournisse les identifiants.
  requires_reward_credentials BOOLEAN NOT NULL DEFAULT FALSE,
  -- Accès par profil nominatif protégé par son propre code (017, ex. Netflix) :
  -- `rewardCredentials.profile` {name, code} devient obligatoire à la livraison.
  requires_profile BOOLEAN NOT NULL DEFAULT FALSE,
  claim_duration INTEGER,
  usage_limit    INTEGER,
  created_by     TEXT,
  extra_data     JSONB DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ,  -- soft delete (migration 047)
  flyer_url         TEXT,   -- migration 031
  claim_delay_hours INTEGER NOT NULL DEFAULT 0,   -- migration 031
  -- Nom d'affichage toujours requis : boutique, ou PLATFORM_NAME si
  -- fastfood_id IS NULL (bonus plateforme).
  CONSTRAINT bonus_fastfood_name_chk CHECK (fastfood_name IS NOT NULL AND fastfood_name <> '')
);

CREATE INDEX IF NOT EXISTS idx_bonus_fastfood ON bonus(fastfood_id);
CREATE INDEX IF NOT EXISTS idx_bonus_active   ON bonus(active) WHERE active = TRUE;

-- ============================================================================
-- TABLE: bonus_requests
-- ============================================================================
-- UNE LIGNE = UNE RÉCLAMATION (migration 029). Un même (user, bonus) peut donc
-- avoir plusieurs lignes : les cycles précédents restent comme historique.
-- La réclamation COURANTE est marquée `is_current` — c'est elle qui porte le
-- code, les compteurs et l'armement affichés au user. L'index unique partiel
-- `idx_bonus_requests_current` garantit qu'il n'y en a jamais deux.
-- `status` est un array JSONB ne contenant QUE l'entrée de cette réclamation.
CREATE TABLE IF NOT EXISTS bonus_requests (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  bonus_id    TEXT NOT NULL,
  status      JSONB DEFAULT '[]'::jsonb,
  code        TEXT,
  usage_count INTEGER DEFAULT 0,
  redeemed    BOOLEAN DEFAULT FALSE,
  -- Armement global (page bonus) : le bonus s'applique à la prochaine commande
  -- éligible. Persisté pour survivre à la fermeture de l'app. Armer ne consomme
  -- rien — cf. architecture/bonus.md.
  armed       BOOLEAN NOT NULL DEFAULT FALSE,
  -- Réclamation courante de ce (user, bonus). FALSE = cycle clos, historique.
  is_current  BOOLEAN NOT NULL DEFAULT TRUE,
  extra_data  JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT bonus_requests_usage_count_chk CHECK (usage_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_bonus_requests_lookup
  ON bonus_requests(bonus_id, user_id);

-- Une SEULE réclamation courante par (user, bonus) : l'invariante est garantie
-- par la base, pas par la discipline du code.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bonus_requests_current
  ON bonus_requests(user_id, bonus_id) WHERE is_current;

-- Recherche par code (redemption) : indexée + unique.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bonus_requests_code
  ON bonus_requests(code) WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bonus_requests_status_gin
  ON bonus_requests USING GIN (status);

-- Bonus armés d'un user : lus à chaque affichage du home (GET /fastfood/all).
CREATE INDEX IF NOT EXISTS idx_bonus_requests_armed
  ON bonus_requests(user_id) WHERE armed = TRUE;

-- Réclamations en attente de livraison manuelle (consultées côté back-office).
CREATE INDEX IF NOT EXISTS idx_bonus_requests_pending
  ON bonus_requests (bonus_id)
  WHERE code IS NULL;

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
  all_notif   JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,  -- soft delete (migration 047)
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
-- TABLE: driver_applications — candidatures livreur (migration 010)
-- ============================================================================
-- Un user postule pour devenir livreur d'un/plusieurs fastFoods (une ligne par
-- boutique). Acceptation → pose user.driverId = uid du user (marqueur isDriver) ;
-- l'appartenance boutique↔livreur = lignes status='accepted'. Refus → 'refused'.
CREATE TABLE IF NOT EXISTS driver_applications (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  fastfood_id   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  extra_data    JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ   -- soft delete (migration 047)
);

CREATE INDEX IF NOT EXISTS idx_driver_applications_fastfood ON driver_applications(fastfood_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_applications_user ON driver_applications(user_id, status);

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
  out_id         TEXT,
  out_user_id    TEXT,
  out_rank       INTEGER,
  out_status     TEXT,
  out_delivery   JSONB
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
  -- On retourne directement les commandes mises à jour (une seule fois).
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
     AND (SELECT COUNT(*) FROM unnest(v_sorted) r WHERE r < o.rank) > 0;

  -- Décrémenter le compteur de la file (mais jamais en dessous de 0)
  UPDATE rank_counters
     SET value = GREATEST(0, value - array_length(v_sorted, 1)),
         updated_at = NOW()
   WHERE id = v_counter_id;

  -- Retourner les commandes encore présentes dans la file à partir du
  -- premier rank affecté, pour que Node puisse notifier les clients.
  RETURN QUERY
    SELECT o.id::TEXT, o.user_id::TEXT, o.rank::INTEGER, o.status::TEXT, o.delivery::JSONB
      FROM orders AS o
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
  p_status        TEXT,
  p_extra_data    JSONB DEFAULT '{}'::jsonb
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
    extra_data, created_at, updated_at
  ) VALUES (
    p_order_id, p_user_id, p_fastfood_id, p_menu_id, p_menu_snapshot,
    COALESCE(p_quantity, 1), p_extra, p_drink, p_delivery, p_delivery_date,
    p_total, p_status, v_rank, COALESCE(p_extra_data, '{}'::jsonb), v_now, v_now
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
       SET all_notif = jsonb_build_array(p_notif) || COALESCE(all_notif, '[]'::jsonb),
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
-- TABLES: settings_<categorie> (migrations 019 → 046)
-- ============================================================================
-- Réglages métier modifiables À CHAUD. En base et non dans .env : ce sont des
-- décisions commerciales, `flyctl secrets set` redémarrerait la machine.
--
-- La migration 046 a éclaté la table `settings` unique en CINQ tables, une par
-- catégorie : elle mélangeait des réglages qui n'ont ni le même public, ni la
-- même criticité, ni le même rythme de changement.
--
--   settings_auth       — authentification (OTP Bird)
--   settings_pricing    — composition des prix et marges
--   settings_delivery   — livraison offerte et ses seuils
--   settings_withdrawal — barèmes de frais de retrait, par opérateur
--   settings_deployment — versions d'app, Apple Review, et rétention de la
--                         suppression admin de boutiques (migration 048)
--
-- Toutes ont la même forme ; seule la table change. La catégorie d'une clé est
-- déclarée dans `KEY_CATEGORY` (settings.service.js), jamais déduite du préfixe.
--
-- ⚠️ Aucun SECRET ici : la clé d'API Bird reste en variable d'environnement.

CREATE TABLE IF NOT EXISTS settings_auth (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings_pricing (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings_delivery (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings_withdrawal (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings_deployment (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO settings_auth (key, value, description) VALUES
  ('otp_resend_cooldown_seconds', '60'::jsonb,    'Delai minimum entre deux demandes de code pour un meme numero (secondes). Chaque envoi est facture par Bird.'),
  ('otp_expires_in_seconds',      '600'::jsonb,   'Duree de validite annoncee au frontend (secondes). Bird gere l''expiration reelle.'),
  ('otp_default_country_code',    '"237"'::jsonb, 'Indicatif ajoute aux numeros saisis sans prefixe, avant normalisation E.164.'),
  ('otp_bird_timeout_ms',         '15000'::jsonb, 'Timeout des appels HTTP vers la plateforme Bird (millisecondes).')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings_pricing (key, value, description) VALUES
  ('platform_margin',                 '100'::jsonb, 'Marge Yaammoo ajoutee au prix affiche de chaque plat (FCFA), en regime plateforme.'),
  ('payment_fee_percent',             '5'::jsonb,   'DigiKUNTZ : frais en % du montant paye, TOUT COMPRIS (commission MobileWallet incluse). Arrondi a l''entier SUPERIEUR.'),
  ('pawapay_deposit_fee_mtn_percent',    '1.75'::jsonb, 'pawaPay : frais de DEPOT MTN, % du montant paye, arrondi a l''entier SUPERIEUR separement.'),
  ('pawapay_deposit_fee_orange_percent', '1.77'::jsonb, 'pawaPay : frais de DEPOT Orange, % du montant paye, arrondi a l''entier SUPERIEUR separement.'),
  ('pawapay_mw_commission_percent',      '0.1'::jsonb,  'pawaPay : commission MobileWallet, % du montant paye, arrondie a l''entier SUPERIEUR separement.'),
  ('pawapay_payout_fee_mtn_percent',     '1.3'::jsonb,  'pawaPay : reserve de RETRAIT MTN prepayee au depot ; taux interreseau vers MTN.'),
  ('pawapay_payout_fee_orange_percent',  '1.0'::jsonb,  'pawaPay : reserve de RETRAIT Orange prepayee au depot ; taux interreseau vers Orange.'),
  ('price_rounding_step',             '0'::jsonb,   'Pas d''arrondi du prix des plats (FCFA). 0 = aucun arrondi.'),
  ('express_price_rounding_step',     '0'::jsonb,   'Pas d''arrondi propre aux zones express. Toujours vers le HAUT.'),
  ('driver_amortization_max',         '0'::jsonb,   'Montant maximum de course qu''un surplus d''arrondi peut amortir (FCFA).'),
  ('fastfood_margin',                 '0'::jsonb,   'Marge en regime FASTFOOD. Cle distincte de platform_margin.'),
  ('fastfood_margin_tier_2_min_brut', '0'::jsonb,   'Prix BRUT a partir duquel la marge fastfood passe au palier 2. 0 = aucun palier.'),
  ('fastfood_margin_tier_2_margin',   '0'::jsonb,   'Marge appliquee au palier 2, en remplacement de fastfood_margin.'),
  ('fastfood_min_covered_course',     '0'::jsonb,   'Course qu''un plat doit couvrir seul via son surplus d''arrondi. 0 = aucune exigence.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings_delivery (key, value, description) VALUES
  ('delivery_free_mode',                        'false'::jsonb, 'Campagne « livraison offerte » globale. Seul deliveryOffer.reason = campaign change.'),
  ('platform_free_delivery_min_items_bonus',    '1'::jsonb,     'Plats minimum sur un depart pour qu''un bonus nominatif de livraison offerte s''applique.'),
  ('platform_free_delivery_min_items_campaign', '1'::jsonb,     'Plats minimum sur un depart pour qu''une campagne de livraison offerte s''applique.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings_withdrawal (key, value, description) VALUES
  ('withdrawal_fee_mtn_threshold',    '0'::jsonb, 'MTN : montant en dessous duquel le frais forfaitaire s''applique.'),
  ('withdrawal_fee_mtn_flat',         '0'::jsonb, 'MTN : frais forfaitaire sous le seuil (FCFA).'),
  ('withdrawal_fee_mtn_percent',      '0'::jsonb, 'MTN : frais en % au-dessus du seuil.'),
  ('withdrawal_fee_mtn_addend',       '0'::jsonb, 'MTN : montant fixe ajoute au frais en pourcentage (FCFA).'),
  ('withdrawal_fee_orange_threshold', '0'::jsonb, 'Orange : montant en dessous duquel le frais forfaitaire s''applique.'),
  ('withdrawal_fee_orange_flat',      '0'::jsonb, 'Orange : frais forfaitaire sous le seuil (FCFA).'),
  ('withdrawal_fee_orange_percent',   '0'::jsonb, 'Orange : frais en % au-dessus du seuil.'),
  ('withdrawal_fee_orange_addend',    '0'::jsonb, 'Orange : montant fixe ajoute au frais en pourcentage (FCFA).')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings_deployment (key, value, description) VALUES
  ('payment_aggregator', '"pawapay"'::jsonb, 'Agregateur envoye a MobileWallet sur /pay et /payout, et bareme de frais du prix affiche. Valeurs : pawapay | digikuntz.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings_deployment (key, value, description) VALUES
  ('platform_min_app_version',    '"1.0.0"'::jsonb, 'Version minimale requise. En dessous : ecran de mise a jour forcee, non fermable.'),
  ('platform_latest_app_version', '"1.0.0"'::jsonb, 'Derniere version publiee sur les stores. Mise a jour non bloquante.'),
  ('apple_review_mode',           'false'::jsonb,   'Mode Apple Review global. Expose au frontend par GET /fastFood/all (appleReviewMode).'),
  ('apple_version_review_mode',   '""'::jsonb,      'Version d''app exacte en cours de review App Store. Vide = aucune.')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- TABLE: order_deliveries (migrations 020/021/023)
-- ============================================================================
-- La COURSE d'une commande livrée. Une ligne UNIQUEMENT si la commande est
-- livrée — une commande à emporter n'a pas de course. L'argent est dans
-- `order_settlements`.
--
-- `orders.delivery` (JSONB) ne portait qu'un seul montant : impossible d'y
-- distinguer ce que touche le fastfood de ce qu'a payé le user. Cette table le
-- complète, elle ne le remplace pas.
CREATE TABLE IF NOT EXISTS order_deliveries (
  order_id        TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,
  fastfood_id     TEXT,
  zone            TEXT,
  real_price      NUMERIC(12,2) NOT NULL DEFAULT 0,
  charged_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
  platform_margin NUMERIC(12,2) NOT NULL DEFAULT 0,
  free_reason     TEXT,
  covered_by      TEXT,
  bonus_id        TEXT,
  bonus_code      TEXT,
  -- Panier (migration 021) : une commande = un plat, donc plusieurs commandes
  -- pour un seul déplacement du livreur. `real_price` reste renseigné partout
  -- (traçabilité) ; seule la ligne `course_billed = TRUE` est réellement due.
  delivery_group_id TEXT,
  course_billed     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,  -- soft delete (migration 047)
  CONSTRAINT order_deliveries_free_reason_chk
    CHECK (free_reason IS NULL OR free_reason IN ('bonus', 'campaign')),
  CONSTRAINT order_deliveries_covered_by_chk
    CHECK (covered_by IS NULL OR covered_by IN ('fastfood', 'platform')),
  -- Une gratuité fait renoncer à un gain, elle ne crée pas une dépense.
  CONSTRAINT order_deliveries_margin_chk CHECK (platform_margin >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_deliveries_fastfood
  ON order_deliveries(fastfood_id, created_at);

CREATE INDEX IF NOT EXISTS idx_order_deliveries_bonus
  ON order_deliveries(bonus_id) WHERE bonus_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_deliveries_group
  ON order_deliveries(delivery_group_id) WHERE delivery_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_deliveries_billed
  ON order_deliveries(fastfood_id, created_at) WHERE course_billed = TRUE;

-- ============================================================================
-- TABLE: order_settlements (migration 023)
-- ============================================================================
-- L'ARGENT d'une commande : UNE ligne par commande, TOUJOURS — livrée ou à
-- emporter. Séparée de `order_deliveries` (la course) : toute commande a un
-- règlement, seules les commandes livrées ont une course.
--
-- ⚠️ Une commande à emporter est TOUT DE MÊME facturée pour la livraison : le
-- supplément est fondu dans le prix du plat depuis le home, avant que le user
-- ait choisi son mode. Sans course à verser, ce montant part intégralement en
-- marge. Modèle économique retenu.
--
--   Marge pure  =  order_settlements WHERE delivered = FALSE
CREATE TABLE IF NOT EXISTS order_settlements (
  order_id        TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,
  fastfood_id     TEXT,
  -- Recopié d'orders.group_id : agréger un panier sans jointure.
  group_id        TEXT,
  -- Plat + extras + boissons, hors livraison, hors frais, hors marge.
  items_real      NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Ce que le user a payé (TTC, frais inclus).
  items_charged   NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Frais prestataire, CONTENUS dans items_charged.
  payment_fee     NUMERIC(12,2) NOT NULL DEFAULT 0,
  platform_margin NUMERIC(12,2) NOT NULL DEFAULT 0,
  delivered       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  -- Une gratuité fait renoncer à un gain, elle ne crée pas une dépense.
  withdrawal_fee    NUMERIC(12,2) NOT NULL DEFAULT 0,   -- migration 037
  driver_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,   -- migration 037
  withdrawal_group_id TEXT,   -- migration 037
  withdrawal_billed BOOLEAN NOT NULL DEFAULT FALSE,   -- migration 037
  delivery_by       TEXT,   -- migration 074, régime figé au paiement
  CONSTRAINT order_settlements_margin_chk CHECK (platform_margin >= 0)
);
CREATE INDEX IF NOT EXISTS idx_order_settlements_withdrawal_group ON order_settlements (withdrawal_group_id) WHERE withdrawal_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_settlements_fastfood
  ON order_settlements(fastfood_id, created_at);

CREATE INDEX IF NOT EXISTS idx_order_settlements_group
  ON order_settlements(group_id) WHERE group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_settlements_pickup
  ON order_settlements(fastfood_id, created_at) WHERE delivered = FALSE;

-- ============================================================================
-- TABLE: platform_revenues (migration 024)
-- ============================================================================
-- Grand livre des revenus, toutes sources confondues. ⚠️ Socle posé d'avance :
-- AUCUN code n'y écrit à ce jour, c'est intentionnel.
--
-- La marge ne viendra pas que des commandes (flyers, mise en avant, abonnements).
-- Ces recettes n'ont pas d'`order_id` et ne peuvent donc pas entrer dans
-- `order_settlements`, dont la clé primaire EST `order_id`.
--
--   order_settlements → le détail d'UNE commande (source de vérité)
--   platform_revenues → l'agrégat de TOUTES les sources
CREATE TABLE IF NOT EXISTS platform_revenues (
  id            TEXT PRIMARY KEY,
  source_type   TEXT NOT NULL,
  source_id     TEXT,
  fastfood_id   TEXT,
  user_id       TEXT,
  gross_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  platform_margin NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_fee   NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Date de l'événement économique, distincte de la date d'écriture : une
  -- reprise d'historique ne doit pas fausser les agrégats mensuels.
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  metadata      JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT platform_revenues_source_type_chk
    CHECK (source_type IN ('order', 'flyer', 'subscription', 'promotion', 'other')),
  CONSTRAINT platform_revenues_margin_chk CHECK (platform_margin >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_revenues_source
  ON platform_revenues(source_type, source_id) WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_revenues_occurred
  ON platform_revenues(occurred_at);

CREATE INDEX IF NOT EXISTS idx_platform_revenues_fastfood
  ON platform_revenues(fastfood_id, occurred_at) WHERE fastfood_id IS NOT NULL;

-- ============================================================================
-- TABLE: phone_otp (migration 045)
-- ============================================================================
-- Authentification par numéro de téléphone (Bird Verify). Une ligne par numéro :
-- une nouvelle demande écrase la précédente, et `created_at` porte le verrou
-- anti-renvoi (chaque envoi est facturé par Bird).
--
-- Le CODE n'est JAMAIS stocké : Bird le génère, le valide, gère son expiration
-- et le nombre de tentatives. On ne conserve que l'identifiant de vérification,
-- nécessaire au contrôle et à la lecture du coût réel.
CREATE TABLE IF NOT EXISTS phone_otp (
  phone_number    TEXT PRIMARY KEY,
  verification_id TEXT NOT NULL,
  user_id         TEXT,
  status          TEXT DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phone_otp_verification_id ON phone_otp(verification_id);

-- ============================================================================
-- TABLE: bird_costs (migration 045)
-- ============================================================================
-- Journal des dépenses Bird. Bird n'expose aucune vue agrégée par API : le coût
-- n'est lisible qu'en interrogeant chaque vérification une par une. Sans trace
-- locale, impossible de savoir ce qui a été dépensé.
--
-- Une ligne est écrite dès l'envoi (`total_cost` encore NULL : Bird ne le résout
-- qu'une fois les tentatives de livraison terminées), puis complétée à la
-- vérification. Les demandes jamais validées restent donc visibles plutôt que
-- d'être absentes — elles ont bien été facturées.
CREATE TABLE IF NOT EXISTS bird_costs (
  id                   TEXT PRIMARY KEY,          -- verification_id
  phone_number         TEXT,
  email                TEXT,
  user_id              TEXT,
  status               TEXT DEFAULT 'pending',
  destination_country  TEXT,
  total_cost           NUMERIC(12, 4),
  currency_code        TEXT,
  -- Une entrée par canal tenté par Bird : WhatsApp d'abord, SMS en repli si la
  -- livraison échoue. Chaque tentative porte son propre coût et ses segments.
  attempts             JSONB DEFAULT '[]'::jsonb,
  delivered_channel    TEXT,
  verified             BOOLEAN DEFAULT FALSE,
  -- Bird réutilise le même verification_id lors d'un renvoi mais facture chaque
  -- envoi : on incrémente au lieu d'écraser, sinon le total sous-estimerait.
  send_count           INTEGER DEFAULT 1,
  sent_at              TIMESTAMPTZ DEFAULT NOW(),
  last_sent_at         TIMESTAMPTZ DEFAULT NOW(),
  resolved_at          TIMESTAMPTZ,
  fee_purpose       TEXT,   -- migration 083
  fee_network       TEXT,   -- migration 083
  fee_debited_usd   NUMERIC(12,4) DEFAULT 0,   -- migration 083
  fee_debited_xaf   INTEGER DEFAULT 0   -- migration 083
);
CREATE INDEX IF NOT EXISTS idx_bird_costs_fee_purpose ON bird_costs (fee_purpose) WHERE fee_purpose IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bird_costs_sent_at ON bird_costs(sent_at);
CREATE INDEX IF NOT EXISTS idx_bird_costs_phone_number ON bird_costs(phone_number);
CREATE INDEX IF NOT EXISTS idx_bird_costs_pending ON bird_costs(sent_at) WHERE total_cost IS NULL;

-- ============================================================================
-- FONCTIONS: suppression admin de boutiques (migration 047)
-- ============================================================================
-- SOFT DELETE : `soft_delete_fastfood` marque, `restore_fastfood` annule tant
-- que la rétention court, `purge_soft_deleted_fastfoods` efface pour de bon.
--
-- ⚠️ Les tables FINANCIÈRES (withdrawals, order_settlements, platform_revenues,
-- transactions) ne portent PAS de `deleted_at` et ne sont jamais touchées : ce
-- sont des pièces comptables, elles survivent à la boutique.
--
-- Corps complet dans `047_soft_delete_fastfood.sql`. Rappel des signatures :
--
--   soft_delete_fastfood(p_fastfood_id TEXT, p_scopes TEXT[]) RETURNS JSONB
--     Scopes : menus, orders, notifications, bonus, drivers, support, deliveries.
--     Aucune valeur par défaut — l'appelant DOIT dire ce qu'il supprime.
--     Vide aussi `users.fastfood_id` (le propriétaire redevient client).
--
--   restore_fastfood(p_fastfood_id TEXT) RETURNS JSONB
--     Ne restaure que les lignes marquées au MÊME instant que la boutique, pour
--     ne pas ressusciter un menu supprimé légitimement des mois plus tôt.
--
--   purge_soft_deleted_fastfoods(p_retention_days INTEGER DEFAULT 30) RETURNS JSONB
--     Renvoie `imageUrls` : Postgres n'accède pas au storage, c'est l'appelant
--     Node qui efface les fichiers du bucket.
-- ============================================================================

-- ============================================================================
-- TABLE: image_trash (migration 071) — corbeille d'images, purge différée
-- ============================================================================
CREATE TABLE IF NOT EXISTS image_trash (
  id          TEXT PRIMARY KEY,
  url         TEXT NOT NULL,
  entity      TEXT,          -- menu | fastfood | banner | bonus | NULL (DELETE /image)
  entity_id   TEXT,
  field       TEXT,          -- image | coverImage | images | imageUrl | flyerUrl
  trashed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  restored_at TIMESTAMPTZ,
  purged_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS image_trash_pending_idx
  ON image_trash (trashed_at) WHERE restored_at IS NULL AND purged_at IS NULL;
ALTER TABLE image_trash ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: settings_app (migration 072) — réglages de fonctionnement du backend
-- ============================================================================
-- Clés : hidden_fastfood_ids, image_trash_retention_days,
-- fastfood_delete_retention_days, fastfood_purge_interval_ms.
CREATE TABLE IF NOT EXISTS settings_app (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE settings_app ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLES ajoutées par les migrations (001 → 087), relevées sur la base réelle
-- ============================================================================
-- Colonnes, contraintes, index et RLS recopiés tels quels depuis le catalogue
-- Postgres de la base de test (16/11/2026), même schéma que la prod. Le commentaire
-- de chaque table donne la migration d'origine : la lire pour le détail métier.
-- Les fonctions SQL (create_order, soft_delete_fastfood…) restent dans leurs migrations.

-- ============================================================================
-- TABLE: transaction_settlements (migration 001, 001_transaction_settlements.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS transaction_settlements (
  id BIGSERIAL,
  transaction_id VARCHAR(255) NOT NULL,
  settled_by VARCHAR(20) NOT NULL,
  status VARCHAR(50) NOT NULL,
  settled_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT transaction_settlements_pkey PRIMARY KEY (id),
  CONSTRAINT transaction_settlements_transaction_id_key UNIQUE (transaction_id),
  CONSTRAINT transaction_settlements_settled_by_check CHECK (((settled_by)::text = ANY ((ARRAY['socket'::character varying, 'webhook'::character varying])::text[])))
);
CREATE INDEX IF NOT EXISTS idx_transaction_settlements_settled_by ON transaction_settlements (settled_by);
CREATE INDEX IF NOT EXISTS idx_transaction_settlements_tx_id ON transaction_settlements (transaction_id);
ALTER TABLE transaction_settlements ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: pending_payments (migration 002, 002_pending_payments.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pending_payments (
  mw_transaction_id VARCHAR(255),
  user_id VARCHAR(255) NOT NULL,
  order_id VARCHAR(255),
  fastfood_id VARCHAR(255),
  items JSONB,
  order_ctx JSONB,
  amount NUMERIC,
  network VARCHAR(50),
  phone VARCHAR(50),
  email VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'::character varying,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  payment_ref VARCHAR(255) NOT NULL,
  aggregator TEXT,
  CONSTRAINT pending_payments_pkey PRIMARY KEY (payment_ref)
);
CREATE INDEX IF NOT EXISTS idx_pending_payments_created_at ON pending_payments (created_at);
CREATE INDEX IF NOT EXISTS idx_pending_payments_mw_tx ON pending_payments (mw_transaction_id);
CREATE INDEX IF NOT EXISTS idx_pending_payments_user_id ON pending_payments (user_id);
ALTER TABLE pending_payments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: withdrawals (migration 004, 004_withdrawals.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS withdrawals (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  fastfood_id TEXT,
  amount NUMERIC(12,2) NOT NULL,
  phone TEXT,
  network TEXT,
  status TEXT NOT NULL DEFAULT 'pending'::text,
  mw_payout_id TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  aggregator TEXT,
  source_network TEXT,
  fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  kiosk_fee NUMERIC NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'wallet'::text,
  order_id TEXT,
  driver_id TEXT,
  CONSTRAINT withdrawals_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_driver ON withdrawals (driver_id) WHERE (driver_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals (user_id);
CREATE INDEX IF NOT EXISTS withdrawals_kind_status_idx ON withdrawals (kind, status);
CREATE UNIQUE INDEX IF NOT EXISTS withdrawals_order_payout_uniq ON withdrawals (order_id) WHERE ((order_id IS NOT NULL) AND (status <> 'failed'::text));
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: outbox_events (migration 005, 005_outbox_events.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS outbox_events (
  id BIGSERIAL,
  user_id TEXT NOT NULL,
  event TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT outbox_events_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_outbox_created_at ON outbox_events (created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_user_undelivered ON outbox_events (user_id, created_at) WHERE (delivered_at IS NULL);
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: ratings (migration 011, 011_ratings.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ratings (
  id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  order_id TEXT,
  value INTEGER NOT NULL,
  comment TEXT,
  extra_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT ratings_pkey PRIMARY KEY (id),
  CONSTRAINT ratings_value_check CHECK (((value >= 1) AND (value <= 5)))
);
CREATE INDEX IF NOT EXISTS idx_ratings_target ON ratings (target_type, target_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ratings_target_user ON ratings (target_type, target_id, user_id);
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: bonus_flyer_downloads (migration 031, 031_bonus_status_view_flyer.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS bonus_flyer_downloads (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  bonus_id TEXT NOT NULL,
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  download_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  proof_uploaded_at TIMESTAMPTZ,
  proof_video_url TEXT,
  CONSTRAINT bonus_flyer_downloads_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS bonus_flyer_downloads_user_bonus_idx ON bonus_flyer_downloads (user_id, bonus_id);
CREATE INDEX IF NOT EXISTS idx_bonus_flyer_downloads_open ON bonus_flyer_downloads (user_id, bonus_id) WHERE (proof_uploaded_at IS NULL);
ALTER TABLE bonus_flyer_downloads ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: support_threads (migration 034, 034_support_threads.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS support_threads (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  fastfood_id TEXT,
  topic TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT ''::text,
  status TEXT NOT NULL DEFAULT 'open'::text,
  unread_count INTEGER NOT NULL DEFAULT 0,
  support_unread_count INTEGER NOT NULL DEFAULT 0,
  last_message TEXT NOT NULL DEFAULT ''::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT support_threads_pkey PRIMARY KEY (id),
  CONSTRAINT support_threads_fastfood_id_fkey FOREIGN KEY (fastfood_id) REFERENCES fastfoods(id) ON DELETE SET NULL,
  CONSTRAINT support_threads_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_support_threads_fastfood ON support_threads (fastfood_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_threads_user ON support_threads (user_id, updated_at DESC);
ALTER TABLE support_threads ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: support_messages (migration 034, 034_support_threads.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT support_messages_pkey PRIMARY KEY (id),
  CONSTRAINT support_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES support_threads(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_support_messages_thread ON support_messages (thread_id, created_at);
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: banners (migration 044, 044_banners.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS banners (
  id TEXT NOT NULL,
  title TEXT,
  image_url TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'none'::text,
  target_id TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT banners_pkey PRIMARY KEY (id),
  CONSTRAINT banners_type_check CHECK ((type = ANY (ARRAY['bonus'::text, 'none'::text])))
);
CREATE INDEX IF NOT EXISTS idx_banners_active_order ON banners (active, sort_order);
ALTER TABLE banners ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: staff_roles (migration 050, 050_fastfood_staff.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS staff_roles (
  id TEXT NOT NULL,
  fastfood_id TEXT NOT NULL,
  name TEXT NOT NULL,
  permissions TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_roles_pkey PRIMARY KEY (id),
  CONSTRAINT staff_roles_fastfood_id_fkey FOREIGN KEY (fastfood_id) REFERENCES fastfoods(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_roles_name ON staff_roles (fastfood_id, lower(name));
ALTER TABLE staff_roles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: staff_members (migration 050, 050_fastfood_staff.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS staff_members (
  id TEXT NOT NULL,
  fastfood_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  user_id TEXT,
  nom TEXT,
  prenom TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_members_pkey PRIMARY KEY (id),
  CONSTRAINT staff_members_fastfood_id_fkey FOREIGN KEY (fastfood_id) REFERENCES fastfoods(id) ON DELETE CASCADE,
  CONSTRAINT staff_members_role_id_fkey FOREIGN KEY (role_id) REFERENCES staff_roles(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_staff_members_phone ON staff_members (phone_number);
CREATE INDEX IF NOT EXISTS idx_staff_members_user ON staff_members (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_members_phone ON staff_members (fastfood_id, phone_number);
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: fastfood_broadcasts (migration 053, 053_fastfood_broadcasts.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS fastfood_broadcasts (
  id TEXT NOT NULL,
  fastfood_id TEXT NOT NULL,
  sender_uid TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  image_url TEXT,
  audience TEXT NOT NULL,
  audience_city TEXT,
  plan TEXT NOT NULL,
  recipients_count INTEGER NOT NULL DEFAULT 0,
  pushed_count INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fastfood_broadcasts_pkey PRIMARY KEY (id),
  CONSTRAINT fastfood_broadcasts_fastfood_id_fkey FOREIGN KEY (fastfood_id) REFERENCES fastfoods(id) ON DELETE CASCADE,
  CONSTRAINT fastfood_broadcasts_audience_chk CHECK ((audience = ANY (ARRAY['customers'::text, 'city'::text, 'all'::text]))),
  CONSTRAINT fastfood_broadcasts_city_chk CHECK (((audience <> 'city'::text) OR (audience_city IS NOT NULL)))
);
CREATE INDEX IF NOT EXISTS idx_fastfood_broadcasts_sent ON fastfood_broadcasts (fastfood_id, sent_at DESC);
ALTER TABLE fastfood_broadcasts ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: settings_notification (migration 053, 053_fastfood_broadcasts.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS settings_notification (
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT settings_notification_pkey PRIMARY KEY (key)
);
ALTER TABLE settings_notification ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: user_locations (migration 054, 054_user_locations.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_locations (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  altitude DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  city TEXT,
  subregion TEXT,
  region TEXT,
  district TEXT,
  street TEXT,
  street_number TEXT,
  place_name TEXT,
  formatted_address TEXT,
  postal_code TEXT,
  country TEXT,
  iso_country_code TEXT,
  timezone TEXT,
  source TEXT NOT NULL,
  platform TEXT,
  captured_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT user_locations_pkey PRIMARY KEY (id),
  CONSTRAINT user_locations_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT user_locations_source_chk CHECK ((source = ANY (ARRAY['login'::text, 'app_open'::text, 'foreground'::text, 'background'::text])))
);
CREATE INDEX IF NOT EXISTS idx_user_locations_city ON user_locations (lower(city));
CREATE INDEX IF NOT EXISTS idx_user_locations_user ON user_locations (user_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_locations_user_city ON user_locations (user_id, captured_at DESC) WHERE (city IS NOT NULL);
ALTER TABLE user_locations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: settings_client (migration 055, 055_settings_client_and_test.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS settings_client (
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT settings_client_pkey PRIMARY KEY (key)
);
ALTER TABLE settings_client ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: settings_test (migration 055, 055_settings_client_and_test.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS settings_test (
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT settings_test_pkey PRIMARY KEY (key)
);
ALTER TABLE settings_test ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: driver_positions (migration 060, 060_geolocation_tracking.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS driver_positions (
  driver_id TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT driver_positions_pkey PRIMARY KEY (driver_id),
  CONSTRAINT driver_positions_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE
);
ALTER TABLE driver_positions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: analytics_connections (migration 061, 061_analytics.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS analytics_connections (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  socket_id TEXT,
  server_id TEXT,
  app_version TEXT,
  platform TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disconnected_at TIMESTAMPTZ,
  CONSTRAINT analytics_connections_pkey PRIMARY KEY (id),
  CONSTRAINT analytics_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_analytics_connections_at ON analytics_connections (connected_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_connections_open ON analytics_connections (server_id) WHERE (disconnected_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_analytics_connections_user ON analytics_connections (user_id, connected_at DESC);
ALTER TABLE analytics_connections ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: analytics_events (migration 061, 061_analytics.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_id TEXT,
  type TEXT NOT NULL,
  fastfood_id TEXT,
  menu_id TEXT,
  banner_id TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT analytics_events_pkey PRIMARY KEY (id),
  CONSTRAINT analytics_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_fastfood ON analytics_events (fastfood_id, type) WHERE (fastfood_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events (session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events (type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events (user_id, occurred_at DESC);
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: analytics_sessions (migration 061, 061_analytics.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS analytics_sessions (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_ms BIGINT NOT NULL DEFAULT 0,
  app_version TEXT,
  platform TEXT,
  os_version TEXT,
  device_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT analytics_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT analytics_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_at ON analytics_sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_user ON analytics_sessions (user_id, started_at DESC);
ALTER TABLE analytics_sessions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: platform_transfer_locks (migration 067, 067_platform_transfer_locks.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS platform_transfer_locks (
  source_fastfood_id TEXT NOT NULL,
  admin_uid TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_transfer_locks_pkey PRIMARY KEY (source_fastfood_id)
);
ALTER TABLE platform_transfer_locks ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: app_errors (migration 068, 068_app_errors.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS app_errors (
  id BIGSERIAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scope TEXT NOT NULL,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  order_id TEXT,
  user_id TEXT,
  fastfood_id TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_note TEXT,
  CONSTRAINT app_errors_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS app_errors_order_idx ON app_errors (order_id);
CREATE INDEX IF NOT EXISTS app_errors_unresolved_idx ON app_errors (created_at DESC) WHERE (resolved = false);
ALTER TABLE app_errors ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: order_status_history (migration 069, 069_order_status_history.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_status_history (
  id BIGSERIAL,
  order_id TEXT NOT NULL,
  fastfood_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_status_history_pkey PRIMARY KEY (id),
  CONSTRAINT order_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history (order_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_order_status_history_shop ON order_status_history (fastfood_id, changed_at);
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: order_refunds (migration 075, 075_order_refunds.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_refunds (
  id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  fastfood_id TEXT,
  cancelled_by TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'order'::text,
  paid NUMERIC NOT NULL,
  fees_kept NUMERIC NOT NULL DEFAULT 0,
  amount NUMERIC NOT NULL,
  merchant_debit NUMERIC NOT NULL DEFAULT 0,
  course_kept NUMERIC NOT NULL DEFAULT 0,
  course_released BOOLEAN NOT NULL DEFAULT false,
  delivery_group_id TEXT,
  phone TEXT,
  network TEXT,
  aggregator TEXT,
  status TEXT NOT NULL DEFAULT 'pending'::text,
  mw_payout_id TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_refunds_pkey PRIMARY KEY (id),
  CONSTRAINT order_refunds_order_kind_uniq UNIQUE (order_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_order_refunds_group ON order_refunds (delivery_group_id);
CREATE INDEX IF NOT EXISTS idx_order_refunds_payout ON order_refunds (mw_payout_id);
ALTER TABLE order_refunds ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: legal_documents (migration 077, 077_legal_documents.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS legal_documents (
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  requires_acceptance BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT legal_documents_pkey PRIMARY KEY (version)
);
ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: legal_acceptances (migration 077, 077_legal_documents.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS legal_acceptances (
  id BIGSERIAL,
  user_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  app_version TEXT,
  CONSTRAINT legal_acceptances_pkey PRIMARY KEY (id),
  CONSTRAINT legal_acceptances_user_id_version_key UNIQUE (user_id, version),
  CONSTRAINT legal_acceptances_version_fkey FOREIGN KEY (version) REFERENCES legal_documents(version)
);
CREATE INDEX IF NOT EXISTS legal_acceptances_user_idx ON legal_acceptances (user_id, version DESC);
ALTER TABLE legal_acceptances ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: merchant_adhesions (migration 078, 078_merchant_adhesions.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS merchant_adhesions (
  id BIGSERIAL,
  fastfood_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  representative_name TEXT NOT NULL,
  representative_role TEXT NOT NULL,
  shop_name TEXT NOT NULL,
  legal_name TEXT,
  address TEXT NOT NULL,
  sector TEXT NOT NULL DEFAULT 'restauration et vente de produits alimentaires'::text,
  app_version TEXT,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT merchant_adhesions_pkey PRIMARY KEY (id),
  CONSTRAINT merchant_adhesions_fastfood_id_version_key UNIQUE (fastfood_id, version),
  CONSTRAINT merchant_adhesions_version_fkey FOREIGN KEY (version) REFERENCES legal_documents(version),
  CONSTRAINT merchant_adhesions_representative_role_check CHECK ((representative_role = ANY (ARRAY['gerant'::text, 'directeur'::text, 'proprietaire'::text])))
);
CREATE INDEX IF NOT EXISTS merchant_adhesions_user_idx ON merchant_adhesions (user_id);
ALTER TABLE merchant_adhesions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: payout_numbers (migration 079, 079_payout_numbers.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payout_numbers (
  user_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payout_numbers_pkey PRIMARY KEY (user_id, phone_number)
);
ALTER TABLE payout_numbers ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: account_archives (migration 080, 080_whatsapp_numbers_account_archives.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS account_archives (
  uid TEXT NOT NULL,
  user_data JSONB NOT NULL,
  fastfood_ids TEXT[] NOT NULL DEFAULT '{}'::text[],
  long_retention BOOLEAN NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retain_until TIMESTAMPTZ NOT NULL,
  identity_keys TEXT[] DEFAULT '{}'::text[],
  personal_purged BOOLEAN DEFAULT false,
  CONSTRAINT account_archives_pkey PRIMARY KEY (uid)
);
CREATE INDEX IF NOT EXISTS account_archives_retain_idx ON account_archives (retain_until);
CREATE INDEX IF NOT EXISTS idx_account_archives_identity_keys ON account_archives USING gin (identity_keys);
ALTER TABLE account_archives ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: whatsapp_numbers (migration 080, 080_whatsapp_numbers_account_archives.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS whatsapp_numbers (
  user_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  source TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_numbers_pkey PRIMARY KEY (user_id, phone_number),
  CONSTRAINT whatsapp_numbers_source_check CHECK ((source = ANY (ARRAY['otp'::text, 'login'::text, 'inbound'::text])))
);
ALTER TABLE whatsapp_numbers ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLE: wa_order_reminders (migration 087, 087_whatsapp_order_reminders.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS wa_order_reminders (
  order_id TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wa_order_reminders_pkey PRIMARY KEY (order_id)
);
ALTER TABLE wa_order_reminders ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TABLES: agent IA des boutiques WhatsApp (migrations 090, 091 ; prod le 16/11/2026)
-- ============================================================================
-- Historique des conversations (author : merchant | ai | system | driver) et actions
-- proposées par l'agent, exécutées après confirmation. Détail : architecture/whatsapp-ai.md.
CREATE TABLE IF NOT EXISTS wa_conversation_messages (
  id          BIGSERIAL PRIMARY KEY,
  phone       TEXT NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  author      TEXT NOT NULL DEFAULT 'system',
  kind        TEXT NOT NULL DEFAULT 'text',
  body        TEXT NOT NULL DEFAULT '',
  message_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_conv_phone_created ON wa_conversation_messages (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conv_created ON wa_conversation_messages (created_at);
ALTER TABLE wa_conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS wa_ai_pending_actions (
  id           TEXT PRIMARY KEY,
  phone        TEXT NOT NULL,
  fastfood_id  TEXT NOT NULL,
  action       TEXT NOT NULL,
  order_ids    JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary      TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled', 'expired')),
  result       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  CONSTRAINT wa_ai_pending_actions_action_check
    CHECK (action IN ('accept', 'refuse', 'finished', 'delivering', 'cancel_accept', 'cancel_refuse'))
);
CREATE INDEX IF NOT EXISTS idx_wa_ai_pending_phone_status ON wa_ai_pending_actions (phone, status);
ALTER TABLE wa_ai_pending_actions ENABLE ROW LEVEL SECURITY;

-- Migration 093 (prod le 16/11/2026) : withdrawals.driver_id (livreur payé d'une
-- commande) et whatsapp_numbers.source ('otp', 'login', 'inbound'), décrits plus haut.
-- Réglages : settings_app ai_*, cancel_request_resend_minutes ; settings_deployment
-- cancel_request_min_app_version (prod 1.1.6, test 1.1.5), payout_number_whatsapp_min_app_version (1.1.6).

-- ============================================================================
-- FIN DU SCHEMA
-- ============================================================================
