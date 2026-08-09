-- ============================================================================
-- 038_margin_tiers_fastfood_pricing.sql
-- ============================================================================
-- Nouveau calcul du prix affiché en régime FASTFOOD (`delivery_by='fastfood'`).
--
-- AVANT : la zone la plus chère de la boutique était fondue dans le prix de
-- chaque plat, avec la marge, puis les frais. Le prix payé était exact (aucun
-- arrondi), et la course réelle s'ajoutait au total par-dessus.
--
--   plat affiché = ceil((brut + zone_max + marge + retrait) / (1 - commission))
--
-- Le défaut : fondre la zone la PLUS CHÈRE gonflait tout le catalogue pour
-- couvrir un cas rare. Un plat à 2000 chez une boutique dont la zone max vaut
-- 1000 s'affichait 3320, alors que la course réellement due valait 250.
--
-- APRÈS : la zone ne rentre plus dans le prix du plat. Le supplément se réduit
-- à la MARGE, et le prix est calé sur `price_rounding_step` (500) EN MONTANT
-- toujours — il n'y a aucune course plateforme à amortir en régime fastfood.
--
--   plat affiché = ceil((brut + marge) + retrait) / (1 - commission)) ↑ 500
--   total payé   = plat affiché + delivery.prix   (course réelle, à part)
--
-- Le surplus d'arrondi (l'écart entre le prix juste et le multiple de 500)
-- couvre la commission prélevée sur la course facturée à part. Plat brut 2000,
-- marge 200 : juste 2373 → affiché 2500, surplus 127, qui absorbe les 5 % dus
-- sur une course allant jusqu'à ~2540 F.
--
-- MARGE PAR PALIER. Un plat cher supporte une marge plus élevée sans que le
-- client la ressente en proportion. Deux clés décrivent le palier 2 ; il
-- REMPLACE `platform_margin` (il ne s'y ajoute pas) dès que le prix BRUT
-- l'atteint :
--
--   brut <  fastfood_margin_tier_2_min_brut  →  fastfood_margin              (200)
--   brut >= fastfood_margin_tier_2_min_brut  →  fastfood_margin_tier_2_margin (300)
--
-- Seuil ou marge du palier à 0 = aucun palier : `fastfood_margin` partout.
--
-- ⚠️ CLÉ DISTINCTE de `platform_margin`. Les deux régimes ne composent pas le
-- prix de la même façon — le fastfood ne fond plus aucune zone dedans, sa marge
-- doit donc se suffire (200) là où celle du régime plateforme reste à 100.
-- Une clé unique aurait fait bouger les deux ensemble.
--
-- Repli : `fastfood_margin` absent ou à 0 → le code retombe sur
-- `platform_margin`, pour qu'une migration non appliquée n'annule pas la marge.
--
-- Le régime PLATEFORME n'est pas modifié : il garde la zone périodique fondue
-- dans le prix, la marge de base, et l'arrondi qui DESCEND dans la limite de
-- `driver_amortization_max`.
-- ============================================================================

-- `platform_margin` n'est PAS modifié : le régime plateforme garde sa marge.
INSERT INTO settings (key, value, description) VALUES
  ('fastfood_margin', '200',
   'Marge de base (palier 1) en regime fastfood. Distincte de platform_margin. 0 = repli sur platform_margin.'),
  ('fastfood_margin_tier_2_min_brut', '3500',
   'Prix BRUT a partir duquel la marge du palier 2 remplace fastfood_margin. 0 = aucun palier.'),
  ('fastfood_margin_tier_2_margin',   '300',
   'Marge appliquee quand le prix brut atteint fastfood_margin_tier_2_min_brut. 0 = aucun palier.')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- MARGE NÉGATIVE AUTORISÉE — une gratuité PEUT coûter de l'argent
-- ============================================================================
-- `platform_margin >= 0` partait du principe qu'une gratuité fait seulement
-- renoncer à un gain. C'était vrai tant que la zone MAX était fondue dans le
-- prix : la marge (1000 + 100) couvrait largement n'importe quelle course.
--
-- Ce n'est plus le cas. La marge fastfood vaut 200 et ne porte plus de zone :
-- au-delà d'environ 320 F de course offerte, la plateforme verse au marchand
-- plus qu'elle n'a encaissé. Exemple, plat brut 2000 (affiché 2500), course
-- offerte de 500 :
--
--   encaissé 2500 − commission 125 − retrait 54       = 2321
--   versé au fastfood       2000 + 500                = 2500
--   marge                          2321 − 2500        = -179   ← PERTE RÉELLE
--
-- Borner à 0 n'annulait pas la perte, il la rendait INVISIBLE : les 179 F
-- étaient bien sortis, mais aucune ligne ne le disait. Or offrir un bonus est
-- une décision COMMERCIALE prise en connaissance de cause (nombre de commandes
-- déjà passées, marge déjà rapportée par ce client) — son coût doit être
-- mesurable, pas masqué.
--
-- On lève donc la contrainte sur les deux tables de commandes.
-- `platform_revenues` la garde : c'est un grand livre de RECETTES, pas encore
-- alimenté, où une ligne négative n'aurait aucun sens.
-- ============================================================================

ALTER TABLE order_settlements DROP CONSTRAINT IF EXISTS order_settlements_margin_chk;
ALTER TABLE order_deliveries  DROP CONSTRAINT IF EXISTS order_deliveries_margin_chk;
