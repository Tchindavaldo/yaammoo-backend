-- ============================================================================
-- 066 — Version d'app par défaut en BASE (R11), remplace l'env FRONTEND_APP_VERSION
-- ============================================================================
-- Version supposée quand la requête n'envoie pas le header x-app-version.
-- Idempotent : ne réécrit pas une valeur déjà ajustée.
-- ============================================================================

INSERT INTO settings_deployment (key, value, description) VALUES
  ('platform_default_app_version', '"1.0.0"'::jsonb, 'Version supposee quand la requete n''envoie pas le header x-app-version.')
ON CONFLICT (key) DO NOTHING;
