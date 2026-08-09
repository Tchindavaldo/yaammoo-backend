-- ============================================================================
-- 039_fastfood_min_covered_course.sql
-- ============================================================================
-- Un prix de menu doit financer sa propre livraison.
--
-- Depuis la migration 038, le prix affiché en régime FASTFOOD est calé sur un
-- multiple de `price_rounding_step` (500), vers le haut. L'écart entre le prix
-- juste et ce multiple — le SURPLUS — est ce qui finance la course quand la
-- livraison est offerte, et ce qui absorbe la commission prélevée sur la course
-- facturée à part.
--
-- Or le surplus ne dépend PAS de la hauteur du prix, mais de la position du
-- prix juste dans le pas. Un prix juste qui tombe à 1 F sous un palier laisse un
-- surplus de 1 F, qu'il s'agisse d'un plat à 660 ou d'un plat à 9 900 :
--
--   brut  640 → juste  942 → affiché 1000 → surplus  58 → couvre 1160  OK
--   brut  660 → juste  963 → affiché 1000 → surplus  37 → couvre  740  REFUS
--   brut  700 → juste 1005 → affiché 1500 → surplus 495 → couvre 9900  OK
--
-- `fastfood_min_covered_course` fixe ce qu'un plat doit pouvoir couvrir À LUI
-- SEUL. À 1400, environ 14 % des prix bruts sont refusés — des bandes étroites
-- (~70 F) juste sous chaque palier de 500, pas un plafond. Le message d'erreur
-- suggère donc toujours les deux prix valides voisins.
--
-- ⚠️ Un PLAFOND fixe ne protégerait de rien : il laisserait passer 8990
-- (surplus 98) et bloquerait 9100 (surplus 482). C'est le surplus qu'on teste.
--
-- ⚠️ AUCUN plafond n'est posé sur les ZONES de livraison. Sur une commande
-- normale la course est payée par le client ; sur une livraison offerte, c'est
-- le minimum de plats (`deliveryOfferAffordability`) qui protège la marge.
-- 1400 est donc le prix de livraison qu'un SEUL plat couvre toujours ; au-delà,
-- la couverture dépend du plat (de 1480 à 7640 selon le brut).
--
-- ⚠️ Régime FASTFOOD uniquement. En régime plateforme, la zone périodique est
-- fondue dans le prix : elle finance déjà la course, et l'arrondi peut DESCENDRE.
--
-- Portée : le contrôle s'applique à `POST /menu` et `PUT /menu`. Les menus DÉJÀ
-- en base ne sont pas touchés — ils ne seront corrigés que le jour où leur prix
-- est modifié. Aucune migration de données, aucun catalogue cassé.
--
-- Valeur à 0 = aucune exigence, tous les prix passent (repli sûr : une clé
-- absente ne doit jamais bloquer la création de menus).
-- ============================================================================

INSERT INTO settings (key, value, description) VALUES
  ('fastfood_min_covered_course', '1400',
   'Course (FCFA) qu''un plat doit pouvoir couvrir seul via son surplus d''arrondi, en regime fastfood. Refuse les prix de menu trop justes. 0 = aucune exigence.')
ON CONFLICT (key) DO NOTHING;
