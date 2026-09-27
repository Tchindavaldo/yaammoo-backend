-- ============================================================================
-- 056_test_app_versions_array.sql
-- ============================================================================
-- `test_app_version` (settings_test) passe d'une chaîne à un TABLEAU de
-- versions : plusieurs builds de test à la fois (ex. ["1.1.0", "1.1.1"]).
-- Chaque version listée reçoit les comportements de test (mode volume de
-- `GET /fastFood/all`) ET le paiement gratuit de `POST /transaction`.
--
-- Chaîne vide -> tableau vide ; chaîne "x.y.z" -> ["x.y.z"]. Une valeur déjà
-- en tableau n'est pas touchée : idempotent.
--
-- Déploiement : dans les deux ordres, rien ne casse — le code accepte aussi
-- l'ancienne forme chaîne.
-- ============================================================================

UPDATE settings_test
SET value = CASE
      WHEN value #>> '{}' = '' THEN '[]'::jsonb
      ELSE jsonb_build_array(value #>> '{}')
    END,
    description = 'Versions d''app de TEST (tableau, ex. ["1.1.0","1.1.1"]) : mode volume du home et paiement gratuit. [] = aucune.',
    updated_at = NOW()
WHERE key = 'test_app_version'
  AND jsonb_typeof(value) = 'string';
