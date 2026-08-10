-- ============================================================================
-- 041_platform_free_delivery_min_items.sql
-- ============================================================================
-- Plats minimum pour qu'une livraison offerte s'applique, en régime PLATEFORME.
--
-- Ce seuil ne protège PAS la marge — elle n'est jamais menacée dans ce régime,
-- la zone étant fondue dans le prix du plat et donc déjà encaissée. Il protège
-- le LIVREUR.
--
-- Sur un départ d'un seul plat, l'arrondi vers le bas est absorbé par la course :
--
--   plat brut 1500, zone 250, marge 100
--   juste 2005 → affiché 2000 (on DESCEND de 5)
--
--   client paie 2000 → commission 100 → retrait 54 → net 1846
--   − plat 1500 − marge due 100 = 246 pour le livreur
--     course due 250 → il touche 246, il ABSORBE 4
--
-- Dès DEUX plats, un fondu entier n'a plus de course en face :
--
--   client paie 4000 → commission 200 → retrait 54 → net 3746
--   − plats 3000 − marge due 200 = 546 disponible
--     course due 250 → il touche 250 ENTIERS, absorbe 0
--     reliquat 296 → marge plateforme (496 au total)
--
-- ⚠️ Le minimum porte sur le DÉPART (`deliveryGroupKey` : même boutique, même
-- zone, même créneau), pas sur une commande isolée. Deux commandes d'un plat qui
-- partent ensemble valent exactement une commande de deux plats — même argent
-- encaissé, même course unique. Deux zones différentes = deux départs, jugés
-- séparément.
--
-- ⚠️ DEUX clés distinctes, volontairement. Une campagne globale s'adresse à tout
-- le monde ; un bonus récompense un client précis, dont on connaît l'historique.
-- Durcir l'une sans toucher à l'autre doit rester possible. Une clé unique les
-- ferait bouger ensemble.
--
-- ⚠️ Régime PLATEFORME uniquement. En régime `fastfood`, la course est facturée
-- à part : le minimum y est CALCULÉ (marge du palier + surplus d'arrondi contre
-- le prix de la course), pas fixe — cf. `deliveryOfferAffordability.js`.
--
-- La campagne globale ne passe jamais par `POST /bonus/verify` : le seuil est
-- donc exposé au front dans `deliveryOffer.minItems`, sans quoi le user
-- découvrirait le refus au moment de payer.
--
-- Repli applicatif à 1, jamais 0 : une clé illisible ne doit pas refuser un
-- paiement par excès de zèle. À 1, la gratuité s'applique dès le premier plat.
-- ============================================================================

INSERT INTO settings (key, value, description) VALUES
  ('platform_free_delivery_min_items_bonus', '2',
   'Plats minimum sur un depart pour qu''un BONUS livraison offerte s''applique, regime plateforme. Protege le livreur (course entiere). 1 = aucun minimum.'),
  ('platform_free_delivery_min_items_campaign', '2',
   'Plats minimum sur un depart pour que la CAMPAGNE globale (delivery_free_mode) s''applique, regime plateforme. Cle distincte du bonus. 1 = aucun minimum.')
ON CONFLICT (key) DO NOTHING;
