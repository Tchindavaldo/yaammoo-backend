-- ============================================================================
-- 073_express_zones_without_hour.sql
-- ----------------------------------------------------------------------------
-- L'EXPRESS n'a pas d'heure : la course part dès que la commande est prête.
-- Jusqu'ici ses zones étaient rangées PAR CRÉNEAU (`delivery_hours[].expressZones`),
-- avec un prix par (heure, lieu). Une commande express ne portant jamais d'heure,
-- l'app et le backend prenaient « le premier lieu trouvé » — et ne le cherchaient
-- pas au même endroit (l'app sautait les créneaux `express: false`, le backend
-- non) : deux prix possibles pour un même lieu, paiement refusé
-- (`delivery_price_mismatch`). Les prix des autres heures ne servaient jamais.
--
-- Désormais : UNE liste de zones express par boutique, sans heure.
--   fastfoods.express_zones           (régime fastfood)
--   fastfoods.platform_express_zones  (régime plateforme)
-- `delivery_hours` / `platform_delivery_zones` ne portent plus que le PÉRIODIQUE.
--
-- Données : chaque lieu garde le prix qui S'APPLIQUAIT déjà (premier créneau
-- express actif, dans l'ordre des créneaux) → aucun montant ne change.
-- Idempotente : relancée, elle ne trouve plus rien à déplacer.
--
-- ⚠️ À appliquer AU MÊME MOMENT que le déploiement du code qui lit
-- `express_zones` : l'ancien code ne lit l'express que dans les créneaux.
-- ============================================================================

ALTER TABLE fastfoods ADD COLUMN IF NOT EXISTS express_zones JSONB DEFAULT '[]'::jsonb;
ALTER TABLE fastfoods ADD COLUMN IF NOT EXISTS platform_express_zones JSONB DEFAULT '[]'::jsonb;

-- 1. Liste express de la BOUTIQUE : premier prix de chaque lieu, créneaux
--    `express: true` seulement (ceux que le client voyait), zones valides.
UPDATE fastfoods f
SET express_zones = sub.zones
FROM (
  SELECT id, jsonb_agg(jsonb_build_object('lieu', lieu, 'prix', prix) ORDER BY pos) AS zones
  FROM (
    SELECT DISTINCT ON (f2.id, e.z->>'lieu')
           f2.id, e.z->>'lieu' AS lieu, e.z->>'prix' AS prix, h.ord * 1000 + e.ord AS pos
    FROM fastfoods f2
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(f2.delivery_hours) = 'array' THEN f2.delivery_hours ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS h(v, ord)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(h.v -> 'expressZones') = 'array' THEN h.v -> 'expressZones' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS e(z, ord)
    WHERE jsonb_typeof(h.v) = 'object'
      AND lower(coalesce(h.v ->> 'express', 'false')) = 'true'
      AND coalesce(trim(e.z ->> 'lieu'), '') <> ''
      AND (e.z ->> 'prix') ~ '^[0-9]+(\.[0-9]+)?$'
      AND (e.z ->> 'prix')::numeric > 0
    ORDER BY f2.id, e.z->>'lieu', h.ord, e.ord
  ) firsts
  GROUP BY id
) sub
WHERE f.id = sub.id
  AND coalesce(jsonb_array_length(f.express_zones), 0) = 0;

-- 2. Même chose pour les zones de la PLATEFORME.
UPDATE fastfoods f
SET platform_express_zones = sub.zones
FROM (
  SELECT id, jsonb_agg(jsonb_build_object('lieu', lieu, 'prix', prix) ORDER BY pos) AS zones
  FROM (
    SELECT DISTINCT ON (f2.id, e.z->>'lieu')
           f2.id, e.z->>'lieu' AS lieu, e.z->>'prix' AS prix, h.ord * 1000 + e.ord AS pos
    FROM fastfoods f2
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(f2.platform_delivery_zones) = 'array' THEN f2.platform_delivery_zones ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS h(v, ord)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(h.v -> 'expressZones') = 'array' THEN h.v -> 'expressZones' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS e(z, ord)
    WHERE jsonb_typeof(h.v) = 'object'
      AND lower(coalesce(h.v ->> 'express', 'false')) = 'true'
      AND coalesce(trim(e.z ->> 'lieu'), '') <> ''
      AND (e.z ->> 'prix') ~ '^[0-9]+(\.[0-9]+)?$'
      AND (e.z ->> 'prix')::numeric > 0
    ORDER BY f2.id, e.z->>'lieu', h.ord, e.ord
  ) firsts
  GROUP BY id
) sub
WHERE f.id = sub.id
  AND coalesce(jsonb_array_length(f.platform_express_zones), 0) = 0;

-- 3. Créneaux : on retire `express` / `expressZones`, et on ne garde qu'un
--    créneau PÉRIODIQUE actif pourvu de zones (même règle que
--    `utils/deliveryHoursSanitize.js`). Le format legacy (chaînes) traverse.
UPDATE fastfoods
SET delivery_hours = coalesce((
  SELECT jsonb_agg(CASE WHEN jsonb_typeof(v) = 'object' THEN v - 'express' - 'expressZones' ELSE v END ORDER BY ord)
  FROM jsonb_array_elements(delivery_hours) WITH ORDINALITY AS t(v, ord)
  WHERE jsonb_typeof(v) <> 'object'
     OR (lower(coalesce(v ->> 'periodic', 'false')) = 'true'
         AND jsonb_typeof(v -> 'periodicZones') = 'array'
         AND jsonb_array_length(v -> 'periodicZones') > 0)
), '[]'::jsonb)
WHERE jsonb_typeof(delivery_hours) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(delivery_hours) AS x(v)
    WHERE jsonb_typeof(v) = 'object' AND (v ? 'express' OR v ? 'expressZones')
  );

UPDATE fastfoods
SET platform_delivery_zones = coalesce((
  SELECT jsonb_agg(CASE WHEN jsonb_typeof(v) = 'object' THEN v - 'express' - 'expressZones' ELSE v END ORDER BY ord)
  FROM jsonb_array_elements(platform_delivery_zones) WITH ORDINALITY AS t(v, ord)
  WHERE jsonb_typeof(v) <> 'object'
     OR (lower(coalesce(v ->> 'periodic', 'false')) = 'true'
         AND jsonb_typeof(v -> 'periodicZones') = 'array'
         AND jsonb_array_length(v -> 'periodicZones') > 0)
), '[]'::jsonb)
WHERE jsonb_typeof(platform_delivery_zones) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(platform_delivery_zones) AS x(v)
    WHERE jsonb_typeof(v) = 'object' AND (v ? 'express' OR v ? 'expressZones')
  );
