-- ============================================================================
-- 058_settings_test_no_auth_versions.sql
-- ============================================================================
-- `test_no_auth_versions` (settings_test) : tableau de versions d'app TOLÉRÉES
-- SANS JETON sur les routes protégées (header `x-app-version`). Sert aux builds
-- qui n'envoient pas encore le Bearer partout. Distinct de `test_app_version`
-- (mode volume + paiement gratuit) : tolérer une version n'en fait pas une
-- build de test.
--
-- ⚠️ Le header se falsifie : vider le tableau dès que ces versions ont disparu.
-- Déploiement : dans les deux ordres (repli [] dans le code). Idempotent.
-- ============================================================================

INSERT INTO settings_test (key, value, description) VALUES
  ('test_no_auth_versions', '["1.1.0", "1.1.1"]'::jsonb,
   'Versions d''app tolerees SANS jeton sur les routes protegees (tableau). [] = aucune. Header falsifiable : vider des que possible.')
ON CONFLICT (key) DO NOTHING;
