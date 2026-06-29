-- Migration 007 : ajout user_data et selected_price_index sur orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS user_data            JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS selected_price_index INTEGER;
