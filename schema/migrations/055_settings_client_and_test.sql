-- ============================================================================
-- 055_settings_client_and_test.sql
-- ============================================================================
-- Deux tables de réglages de plus, même forme que les autres `settings_*` :
--
--   settings_client — réglages d'AFFICHAGE de l'app, renvoyés par la première
--                     page de `GET /fastFood/all` (champ `clientSettings`).
--                     L'app s'en sert pour ses pages suivantes et les garde
--                     pour le lancement d'après ; la valeur écrite dans son
--                     code reste la valeur de secours.
--                       • home_page_size         boutiques par page du home
--                       • home_prefetch_distance distance (points) du bas de la
--                                                liste native du home à laquelle
--                                                la page suivante est demandée
--   settings_test   — réglages de la build de TEST, SORTIS de
--                     `settings_deployment` : test_app_version,
--                     test_fastfood_volume, test_volume_image_url.
--
-- Pourquoi : `settings_deployment` mélangeait déjà versions d'app, Apple Review,
-- purge des boutiques et build de test. Le nombre de lignes n'est pas le
-- problème, la lisibilité si.
--
-- ⚠️ ORDRE DE DÉPLOIEMENT : appliquer cette migration AVANT de déployer le code
-- qui la lit. Le code lit toutes les tables `settings_*` d'un coup : une table
-- absente fait échouer la lecture entière, et `GET /fastFood/all` répond alors
-- 500 (le mode Apple Review n'a volontairement aucun repli). Dans l'autre sens,
-- l'ancien code ne voit simplement plus les clés `test_*` : build de test
-- coupée jusqu'au déploiement, rien d'autre.
--
-- Idempotent : rejouable sans écraser une valeur modifiée en production.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Les deux tables
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS settings_client (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings_test (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. Déplacement des clés `test_*`
-- ----------------------------------------------------------------------------
-- Les valeurs EN PRODUCTION sont copiées d'abord, les défauts de l'étape 3 ne
-- font que compléter. Puis les clés quittent `settings_deployment` : une clé
-- n'appartient qu'à UNE table, le service aplatit toutes les tables en une
-- seule map.

INSERT INTO settings_test (key, value, description, updated_at)
  SELECT key, value, description, updated_at FROM settings_deployment
  WHERE key IN ('test_app_version', 'test_fastfood_volume', 'test_volume_image_url')
ON CONFLICT (key) DO NOTHING;

DELETE FROM settings_deployment
  WHERE key IN ('test_app_version', 'test_fastfood_volume', 'test_volume_image_url');

-- ----------------------------------------------------------------------------
-- 3. Valeurs par défaut
-- ----------------------------------------------------------------------------

-- TEST — mêmes défauts que les migrations 051 et 052.
INSERT INTO settings_test (key, value, description) VALUES
  ('test_app_version', '""'::jsonb,
   'Version d''app exacte (header x-app-version) traitee comme build de test. Vide = aucune. Active par exemple le mode volume de GET /fastFood/all.'),
  ('test_fastfood_volume', '500'::jsonb,
   'Nombre de boutiques servies par GET /fastFood/all a la build de test : clones des boutiques reelles, jamais ecrits en base.'),
  ('test_volume_image_url', '"https://picsum.photos/seed/{seed}/600/400"'::jsonb,
   'Gabarit d''URL ({seed} = id clone) des images du mode volume de GET /fastFood/all. Vide = images reelles gardees.')
ON CONFLICT (key) DO NOTHING;

-- CLIENT — valeurs actuelles de l'app, pour ne rien changer au déploiement.
INSERT INTO settings_client (key, value, description) VALUES
  ('home_page_size', '10'::jsonb,
   'Boutiques par page du home (limit de GET /fastFood/all). Entier >= 1, plafonne a 50 par le serveur. Pris en compte par l''app a partir de sa page suivante.'),
  ('home_prefetch_distance', '1200'::jsonb,
   'Distance (points) du bas de la liste native du home (iOS) a laquelle la page suivante est demandee.')
ON CONFLICT (key) DO NOTHING;
