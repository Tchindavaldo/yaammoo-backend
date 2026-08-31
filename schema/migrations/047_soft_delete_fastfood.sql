-- ============================================================================
-- 047_soft_delete_fastfood.sql
-- ============================================================================
-- Suppression ADMIN d'une ou plusieurs boutiques, en SOFT DELETE.
--
-- Pourquoi soft et pas DELETE : une suppression de boutique emporte ses menus,
-- ses commandes et ses notifications. Un DELETE réel rend l'erreur définitive —
-- un mauvais id saisi par un admin, et l'historique d'une boutique active est
-- perdu. On marque donc `deleted_at`, et une purge séparée efface réellement
-- après le délai de rétention (30 jours, cf. `purge_soft_deleted_fastfoods`).
--
-- ⚠️ Les tables FINANCIÈRES ne portent PAS de `deleted_at` et ne sont JAMAIS
-- touchées, ni par la suppression ni par la purge :
--   withdrawals, order_settlements, platform_revenues, transactions.
-- Ce sont des pièces comptables : elles survivent à la boutique. C'est aussi
-- pour ça que `menus` perd sa contrainte CASCADE ci-dessous — un DELETE de la
-- ligne fastfoods emporterait les menus sans passer par la purge.
--
-- Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colonnes `deleted_at`
-- ----------------------------------------------------------------------------
ALTER TABLE fastfoods           ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE menus               ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE orders              ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE notifications       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE bonus               ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE support_threads     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE order_deliveries    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Index partiels : les lectures courantes ne veulent QUE les lignes vivantes.
-- Un index partiel `WHERE deleted_at IS NULL` reste petit et sert exactement
-- ce filtre, présent sur toutes les requêtes de lecture.
CREATE INDEX IF NOT EXISTS idx_fastfoods_alive  ON fastfoods(id)          WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_menus_alive      ON menus(fastfood_id)     WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_alive     ON orders(fastfood_id)    WHERE deleted_at IS NULL;

-- Purge : on balaye par date de suppression, jamais toute la table.
CREATE INDEX IF NOT EXISTS idx_fastfoods_deleted_at ON fastfoods(deleted_at) WHERE deleted_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. `menus` : CASCADE -> RESTRICT
-- ----------------------------------------------------------------------------
-- Avec ON DELETE CASCADE, supprimer la ligne fastfoods effacerait les menus
-- immédiatement, court-circuitant la rétention de 30 jours. La purge supprime
-- désormais dans l'ordre (enfants puis parent), donc la cascade n'a plus lieu
-- d'être — et RESTRICT transforme un DELETE accidentel en erreur bruyante.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'menus_fastfood_id_fkey' AND conrelid = 'menus'::regclass
  ) THEN
    ALTER TABLE menus DROP CONSTRAINT menus_fastfood_id_fkey;
  END IF;

  ALTER TABLE menus
    ADD CONSTRAINT menus_fastfood_id_fkey
    FOREIGN KEY (fastfood_id) REFERENCES fastfoods(id) ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Idem pour `bonus`, qui portait aussi une CASCADE (migration 014).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'bonus_fastfood_id_fkey' AND conrelid = 'bonus'::regclass
  ) THEN
    ALTER TABLE bonus DROP CONSTRAINT bonus_fastfood_id_fkey;
  END IF;

  ALTER TABLE bonus
    ADD CONSTRAINT bonus_fastfood_id_fkey
    FOREIGN KEY (fastfood_id) REFERENCES fastfoods(id) ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 3. `soft_delete_fastfood(p_fastfood_id, p_scopes)` — marquage atomique
-- ----------------------------------------------------------------------------
-- `p_scopes` liste ce qui est emporté. Aucune valeur par défaut ici : c'est
-- l'appelant (service admin) qui impose un scope explicite — supprimer « tout »
-- par omission est précisément l'accident qu'on veut rendre impossible.
--
-- Scopes reconnus : 'menus', 'orders', 'notifications', 'bonus', 'drivers',
-- 'support', 'deliveries'. Le scope 'shop' (la boutique elle-même) est
-- toujours appliqué : c'est l'objet de l'appel.
--
-- Retourne le compte des lignes marquées par table, pour que l'admin voie
-- exactement ce que sa requête a emporté.
CREATE OR REPLACE FUNCTION soft_delete_fastfood(
  p_fastfood_id TEXT,
  p_scopes      TEXT[]
) RETURNS JSONB AS $$
DECLARE
  v_now     TIMESTAMPTZ := NOW();
  v_counts  JSONB := '{}'::jsonb;
  v_n       INTEGER;
BEGIN
  -- Boutique inexistante ou déjà supprimée : rien à faire, on le dit.
  IF NOT EXISTS (SELECT 1 FROM fastfoods WHERE id = p_fastfood_id AND deleted_at IS NULL) THEN
    RETURN jsonb_build_object('found', FALSE);
  END IF;

  IF 'menus' = ANY(p_scopes) THEN
    UPDATE menus SET deleted_at = v_now
     WHERE fastfood_id = p_fastfood_id AND deleted_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('menus', v_n);
  END IF;

  IF 'orders' = ANY(p_scopes) THEN
    UPDATE orders SET deleted_at = v_now
     WHERE fastfood_id = p_fastfood_id AND deleted_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('orders', v_n);

    -- Les compteurs de rang n'ont de sens que pour des commandes vivantes.
    -- Ils sont dérivés (pas de donnée métier propre) : suppression directe.
    DELETE FROM rank_counters WHERE fastfood_id = p_fastfood_id;
  END IF;

  IF 'notifications' = ANY(p_scopes) THEN
    UPDATE notifications SET deleted_at = v_now
     WHERE fastfood_id = p_fastfood_id AND deleted_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('notifications', v_n);
  END IF;

  IF 'bonus' = ANY(p_scopes) THEN
    UPDATE bonus SET deleted_at = v_now
     WHERE fastfood_id = p_fastfood_id AND deleted_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('bonus', v_n);
  END IF;

  IF 'drivers' = ANY(p_scopes) THEN
    UPDATE driver_applications SET deleted_at = v_now
     WHERE fastfood_id = p_fastfood_id AND deleted_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('driverApplications', v_n);
  END IF;

  IF 'support' = ANY(p_scopes) THEN
    UPDATE support_threads SET deleted_at = v_now
     WHERE fastfood_id = p_fastfood_id AND deleted_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('supportThreads', v_n);
  END IF;

  IF 'deliveries' = ANY(p_scopes) THEN
    UPDATE order_deliveries SET deleted_at = v_now
     WHERE fastfood_id = p_fastfood_id AND deleted_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('orderDeliveries', v_n);
  END IF;

  -- Le propriétaire redevient un simple client : `isMarchand` est dérivé de
  -- `fastfood_id` (R5), donc le vider suffit — rien d'autre à écrire.
  UPDATE users SET fastfood_id = NULL
   WHERE fastfood_id = p_fastfood_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('ownersDetached', v_n);

  UPDATE fastfoods SET deleted_at = v_now WHERE id = p_fastfood_id;

  RETURN jsonb_build_object('found', TRUE, 'deletedAt', v_now, 'counts', v_counts);
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 4. `restore_fastfood(p_fastfood_id)` — annuler avant la purge
-- ----------------------------------------------------------------------------
-- Toute la raison d'être du soft delete : pouvoir revenir en arrière tant que
-- la purge n'est pas passée. On ne restaure QUE les lignes marquées au même
-- instant que la boutique, pour ne pas ressusciter un menu supprimé
-- légitimement par le marchand trois mois plus tôt.
CREATE OR REPLACE FUNCTION restore_fastfood(p_fastfood_id TEXT)
RETURNS JSONB AS $$
DECLARE
  v_deleted_at TIMESTAMPTZ;
BEGIN
  SELECT deleted_at INTO v_deleted_at FROM fastfoods WHERE id = p_fastfood_id;
  IF v_deleted_at IS NULL THEN
    RETURN jsonb_build_object('restored', FALSE, 'reason', 'not_deleted');
  END IF;

  UPDATE menus               SET deleted_at = NULL WHERE fastfood_id = p_fastfood_id AND deleted_at = v_deleted_at;
  UPDATE orders              SET deleted_at = NULL WHERE fastfood_id = p_fastfood_id AND deleted_at = v_deleted_at;
  UPDATE notifications       SET deleted_at = NULL WHERE fastfood_id = p_fastfood_id AND deleted_at = v_deleted_at;
  UPDATE bonus               SET deleted_at = NULL WHERE fastfood_id = p_fastfood_id AND deleted_at = v_deleted_at;
  UPDATE driver_applications SET deleted_at = NULL WHERE fastfood_id = p_fastfood_id AND deleted_at = v_deleted_at;
  UPDATE support_threads     SET deleted_at = NULL WHERE fastfood_id = p_fastfood_id AND deleted_at = v_deleted_at;
  UPDATE order_deliveries    SET deleted_at = NULL WHERE fastfood_id = p_fastfood_id AND deleted_at = v_deleted_at;
  UPDATE fastfoods           SET deleted_at = NULL WHERE id = p_fastfood_id;

  -- ⚠️ `users.fastfood_id` n'est PAS réattribué : entre-temps le propriétaire a
  -- pu créer une autre boutique, et écraser ce lien lui en ferait perdre une.
  -- Le rattachement se refait explicitement côté service si besoin.
  RETURN jsonb_build_object('restored', TRUE, 'deletedAt', v_deleted_at);
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 5. `purge_soft_deleted_fastfoods(p_retention_days)` — effacement définitif
-- ----------------------------------------------------------------------------
-- Appelée par un job planifié. Efface RÉELLEMENT les boutiques marquées depuis
-- plus de `p_retention_days` jours (30 par défaut).
--
-- ⚠️ Les images du storage ne sont PAS effacées ici — Postgres n'y a pas accès.
-- La fonction renvoie les URL rencontrées pour que l'appelant Node les supprime
-- du bucket ; il doit le faire AVANT de considérer la purge terminée, sinon les
-- fichiers restent orphelins sans plus aucune ligne qui les référence.
CREATE OR REPLACE FUNCTION purge_soft_deleted_fastfoods(p_retention_days INTEGER DEFAULT 30)
RETURNS JSONB AS $$
DECLARE
  v_cutoff  TIMESTAMPTZ := NOW() - (p_retention_days || ' days')::INTERVAL;
  v_ids     TEXT[];
  v_images  TEXT[];
BEGIN
  SELECT COALESCE(array_agg(id), '{}') INTO v_ids
    FROM fastfoods
   WHERE deleted_at IS NOT NULL AND deleted_at < v_cutoff;

  IF array_length(v_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('purged', 0, 'ids', '[]'::jsonb, 'imageUrls', '[]'::jsonb);
  END IF;

  -- Images à effacer du bucket : celle de la boutique + celles des menus.
  SELECT COALESCE(array_agg(url), '{}') INTO v_images FROM (
    SELECT image AS url FROM fastfoods WHERE id = ANY(v_ids) AND image IS NOT NULL AND image <> ''
    UNION
    SELECT image FROM menus WHERE fastfood_id = ANY(v_ids) AND image IS NOT NULL AND image <> ''
    UNION
    SELECT cover_image FROM menus WHERE fastfood_id = ANY(v_ids) AND cover_image IS NOT NULL AND cover_image <> ''
    UNION
    SELECT jsonb_array_elements_text(images) FROM menus
     WHERE fastfood_id = ANY(v_ids) AND jsonb_typeof(images) = 'array'
  ) AS all_images;

  -- Ordre imposé par les FK : enfants d'abord, parent en dernier.
  DELETE FROM order_deliveries    WHERE fastfood_id = ANY(v_ids) AND deleted_at IS NOT NULL;
  DELETE FROM support_threads     WHERE fastfood_id = ANY(v_ids) AND deleted_at IS NOT NULL;
  DELETE FROM driver_applications WHERE fastfood_id = ANY(v_ids) AND deleted_at IS NOT NULL;
  DELETE FROM bonus               WHERE fastfood_id = ANY(v_ids) AND deleted_at IS NOT NULL;
  DELETE FROM notifications       WHERE fastfood_id = ANY(v_ids) AND deleted_at IS NOT NULL;
  DELETE FROM orders              WHERE fastfood_id = ANY(v_ids) AND deleted_at IS NOT NULL;
  DELETE FROM menus               WHERE fastfood_id = ANY(v_ids) AND deleted_at IS NOT NULL;
  DELETE FROM rank_counters       WHERE fastfood_id = ANY(v_ids);

  -- La boutique ne part que si plus rien ne la référence (RESTRICT sinon) :
  -- une commande hors scope survivante bloque la purge, ce qui est voulu —
  -- mieux vaut une purge refusée qu'un historique amputé.
  DELETE FROM fastfoods WHERE id = ANY(v_ids)
     AND NOT EXISTS (SELECT 1 FROM menus  WHERE menus.fastfood_id  = fastfoods.id)
     AND NOT EXISTS (SELECT 1 FROM bonus  WHERE bonus.fastfood_id  = fastfoods.id);

  RETURN jsonb_build_object(
    'purged',    array_length(v_ids, 1),
    'ids',       to_jsonb(v_ids),
    'imageUrls', to_jsonb(v_images)
  );
END;
$$ LANGUAGE plpgsql;
