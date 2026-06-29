-- 008_fastfoods_new_fields.sql
-- Ajoute les nouveaux champs pour la boutique (deliveryHours enrichi, infos contact, advanceDays, pickupOnly, cities)
-- Le champ delivery_hours passe de JSONB string[] à JSONB d'objets avec zones de livraison

ALTER TABLE fastfoods
  ADD COLUMN IF NOT EXISTS momo_number       TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_number   TEXT,
  ADD COLUMN IF NOT EXISTS advance_days      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pickup_only       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cities            JSONB DEFAULT '[]'::jsonb;
