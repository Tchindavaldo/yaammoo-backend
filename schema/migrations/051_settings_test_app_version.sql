-- ============================================================================
-- 051_settings_test_app_version.sql
-- ============================================================================
-- Drapeau « version de TEST », en BASE et non en `.env` : il doit basculer sans
-- redéployer, comme `apple_version_review_mode`.
--
--   • `test_app_version` : version d'app EXACTE (header `x-app-version`) traitée
--     comme build de test. Vide = aucune. Générique : tout travail futur qui a
--     besoin de servir un comportement de test à UNE build s'appuie dessus.
--   • `test_fastfood_volume` : nombre de boutiques servies par
--     `GET /fastFood/all` à la build de test (mode volume : clones des boutiques
--     réelles, jamais écrits en base).
--
-- Rangés en `settings_deployment` : réglages d'exploitation, pas de
-- tarification ni de livraison.
--
-- Idempotent : `ON CONFLICT DO NOTHING` ne réécrit pas une valeur déjà ajustée.
-- ============================================================================

INSERT INTO settings_deployment (key, value, description) VALUES
  (
    'test_app_version',
    '""'::jsonb,
    'Version d''app exacte (header x-app-version) traitee comme build de test. Vide = aucune. Active par exemple le mode volume de GET /fastFood/all.'
  ),
  (
    'test_fastfood_volume',
    '500'::jsonb,
    'Nombre de boutiques servies par GET /fastFood/all a la build de test : clones des boutiques reelles, jamais ecrits en base.'
  )
ON CONFLICT (key) DO NOTHING;
