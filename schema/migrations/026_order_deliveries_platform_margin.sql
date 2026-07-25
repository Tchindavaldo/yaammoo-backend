-- 026_order_deliveries_platform_margin.sql
-- ----------------------------------------------------------------------------
-- La colonne `platform_margin` figure dans le CREATE TABLE de la migration 020,
-- mais les bases où `order_deliveries` existait DÉJÀ ne l'ont jamais reçue :
-- `CREATE TABLE IF NOT EXISTS` n'altère pas une table existante. Résultat en
-- prod : "Could not find the 'platform_margin' column of 'order_deliveries'".
-- Cette migration ajoute la colonne (+ sa contrainte) de façon idempotente.
-- ----------------------------------------------------------------------------

ALTER TABLE order_deliveries
  ADD COLUMN IF NOT EXISTS platform_margin NUMERIC(12,2) NOT NULL DEFAULT 0;

-- La marge plateforme n'est jamais négative : une gratuité fait renoncer à un
-- gain, elle ne crée pas une dépense.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_deliveries_margin_chk'
  ) THEN
    ALTER TABLE order_deliveries
      ADD CONSTRAINT order_deliveries_margin_chk CHECK (platform_margin >= 0);
  END IF;
END $$;
