-- ============================================================================
-- 057_settings_test_user_ids.sql
-- ============================================================================
-- `test_user_ids` (settings_test) : tableau d'ID d'utilisateurs de TEST
-- (uid Firebase). Un user listé reçoit les mêmes comportements qu'une version
-- listée dans `test_app_version`, quelle que soit sa version d'app : mode volume
-- de `GET /fastFood/all` (s'il est connecté) et paiement gratuit de
-- `POST /transaction`. [] = aucun.
--
-- Déploiement : dans les deux ordres, rien ne casse (repli [] dans le code).
-- Idempotent : ne réécrit pas une valeur modifiée en production.
-- ============================================================================

INSERT INTO settings_test (key, value, description) VALUES
  ('test_user_ids', '[]'::jsonb,
   'ID des utilisateurs de TEST (tableau d''uid) : mode volume du home et paiement gratuit, quelle que soit la version. [] = aucun.')
ON CONFLICT (key) DO NOTHING;
