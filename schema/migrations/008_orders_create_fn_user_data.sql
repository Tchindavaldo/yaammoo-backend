-- Migration 008 : mise à jour create_order_with_stock_check
-- Ajout de p_user_data et p_selected_price_index pour les stocker en colonnes propres
CREATE OR REPLACE FUNCTION create_order_with_stock_check(
  p_order_id            TEXT,
  p_user_id             TEXT,
  p_fastfood_id         TEXT,
  p_menu_id             TEXT,
  p_menu_snapshot       JSONB,
  p_quantity            INTEGER,
  p_extra               JSONB,
  p_drink               JSONB,
  p_delivery            JSONB,
  p_delivery_date       DATE,
  p_total               NUMERIC,
  p_status              TEXT,
  p_user_data           JSONB DEFAULT '{}'::jsonb,
  p_selected_price_index INTEGER DEFAULT NULL,
  p_extra_data          JSONB DEFAULT '{}'::jsonb
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
    user_data, selected_price_index, extra_data, created_at, updated_at
  ) VALUES (
    p_order_id, p_user_id, p_fastfood_id, p_menu_id, p_menu_snapshot,
    COALESCE(p_quantity, 1), p_extra, p_drink, p_delivery, p_delivery_date,
    p_total, p_status, v_rank,
    COALESCE(p_user_data, '{}'::jsonb), p_selected_price_index,
    COALESCE(p_extra_data, '{}'::jsonb), v_now, v_now
  )
  RETURNING jsonb_build_object(
    'id', id,
    'user_id', user_id,
    'fastfood_id', fastfood_id,
    'menu_snapshot', menu_snapshot,
    'quantity', quantity,
    'extra', extra,
    'drink', drink,
    'delivery', delivery,
    'total', total,
    'status', status,
    'rank', rank,
    'user_data', user_data,
    'selected_price_index', selected_price_index,
    'created_at', created_at,
    'updated_at', updated_at,
    'new_stock', v_new_stock
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;
