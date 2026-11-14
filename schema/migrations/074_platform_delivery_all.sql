-- ============================================================================
-- 074 — Interrupteur global « tout livré par la plateforme » + régime figé
-- ============================================================================
-- À appliquer AVANT le déploiement du code : le règlement écrit
-- `order_settlements.delivery_by` dès le premier paiement. Idempotente.
--
-- 1. `settings_app.platform_delivery_all` : true = toute boutique AYANT des
--    zones plateforme est lue en `delivery_by = 'platform'` (lecture seule,
--    `fastfoods.delivery_by` n'est jamais réécrit). Les boutiques sans zones
--    plateforme restent livrées par leur marchand. false = réglage par boutique.
-- 2. `order_settlements.delivery_by` : régime au moment du PAIEMENT. Les
--    crédits versés à la livraison (marchand, livreur) le relisent, pour qu'une
--    bascule entre paiement et livraison ne verse pas la course deux fois.
--    NULL = règlement antérieur (repli : régime actuel de la boutique).
-- ============================================================================

INSERT INTO settings_app (key, value, description) VALUES
  ('platform_delivery_all', 'false'::jsonb, 'true = toutes les boutiques ayant des zones plateforme sont livrees par la plateforme (reversible, delivery_by de chaque boutique conserve).')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE order_settlements
  ADD COLUMN IF NOT EXISTS delivery_by TEXT;
