-- 081 : la purge des boutiques supprimées (047) ignore celles supprimées avec
-- le compte (deleted_reason = 'account', migration 080) : leur durée de
-- conservation est celle du compte (account_archives.retain_until).
CREATE OR REPLACE FUNCTION purge_soft_deleted_fastfoods(p_retention_days INTEGER DEFAULT 30)
RETURNS JSONB AS $$
DECLARE
  v_cutoff  TIMESTAMPTZ := NOW() - (p_retention_days || ' days')::INTERVAL;
  v_ids     TEXT[];
  v_images  TEXT[];
BEGIN
  SELECT COALESCE(array_agg(id), '{}') INTO v_ids
    FROM fastfoods
   WHERE deleted_at IS NOT NULL AND deleted_at < v_cutoff
     -- Boutique supprimée avec le compte : purgée par accountPurgeJob (90 j / 10 ans).
     AND deleted_reason IS DISTINCT FROM 'account';

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
