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
  pickup_only       BOOLEAN DEFAULT FALSE,
  cities            JSONB DEFAULT '[]'::jsonb,
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
  driver_id         TEXT,
  -- Panier (migration 022) : une commande = un plat, donc un panier arrive comme
  -- plusieurs commandes. `group_id` permet de les réafficher ensemble.
  -- À distinguer de order_deliveries.delivery_group_id, qui groupe par
  -- (panier, BOUTIQUE) pour la comptabilité.
  group_id          TEXT,
  extra_data        JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

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
  extra_data          JSONB DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_created
  ON transactions(user_id, created_at DESC);

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
  fastfood_id    TEXT REFERENCES fastfoods(id) ON DELETE CASCADE,
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
  -- Nom d'affichage toujours requis : boutique, ou PLATFORM_NAME si
  -- fastfood_id IS NULL (bonus plateforme).
  CONSTRAINT bonus_fastfood_name_chk CHECK (fastfood_name IS NOT NULL AND fastfood_name <> '')
);

CREATE INDEX IF NOT EXISTS idx_bonus_fastfood ON bonus(fastfood_id);
CREATE INDEX IF NOT EXISTS idx_bonus_active   ON bonus(active) WHERE active = TRUE;

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
  code        TEXT,
  usage_count INTEGER DEFAULT 0,
  redeemed    BOOLEAN DEFAULT FALSE,
  -- Armement global (page bonus) : le bonus s'applique à la prochaine commande
  -- éligible. Persisté pour survivre à la fermeture de l'app. Armer ne consomme
  -- rien — cf. architecture/bonus.md.
  armed       BOOLEAN NOT NULL DEFAULT FALSE,
  extra_data  JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT bonus_requests_usage_count_chk CHECK (usage_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_bonus_requests_lookup
  ON bonus_requests(bonus_id, user_id, bonus_type);

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
  updated_at    TIMESTAMPTZ DEFAULT NOW()
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
-- TABLE: settings (migration 019)
-- ============================================================================
-- Réglages métier modifiables À CHAUD (marge, frais de paiement, campagne
-- « livraison offerte »). En base et non dans .env : ce sont des décisions
-- commerciales, `flyctl secrets set` redémarrerait la machine.
-- Les seuils de version d'app restent, eux, en .env.
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO settings (key, value, description) VALUES
  ('platform_margin',     '100'::jsonb,   'Marge Yaammoo ajoutée au prix affiché de chaque plat (FCFA).'),
  ('payment_fee_percent', '5'::jsonb,     'Frais du prestataire de paiement, en % du montant payé. Arrondi à l''entier SUPÉRIEUR.'),
  ('delivery_free_mode',  'false'::jsonb, 'Campagne « livraison offerte » globale.')
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
  CONSTRAINT order_settlements_margin_chk CHECK (platform_margin >= 0)
);

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
-- FIN DU SCHEMA
-- ============================================================================
