-- ============================================================================
-- 066 — Versioning par feature en BASE (R11), plus aucune version sur Fly
-- ============================================================================
-- Remplace les env FRONTEND_APP_VERSION, APP_DELIVERY_NEW_MIN_VERSION et la
-- constante LEGACY_NO_AUTH_MAX_VERSION ; ajoute le seuil du retrait pawaPay.
-- Idempotent : ne réécrit pas une valeur déjà ajustée.
-- ============================================================================

INSERT INTO settings_deployment (key, value, description) VALUES
  ('platform_default_app_version',        '"1.0.0"'::jsonb, 'Version supposee quand la requete n''envoie pas le header x-app-version.'),
  ('delivery_new_format_min_app_version', '"1.0.1"'::jsonb, 'Version a partir de laquelle deliveryHours est servi en objets enrichis.'),
  ('legacy_no_auth_max_app_version',      '"1.1.0"'::jsonb, 'Versions <= : /order, /menu, /support toleres sans jeton.'),
  ('wallet_networks_min_app_version',     '"1.1.5"'::jsonb, 'Version a partir de laquelle le retrait gere les soldes MTN / Orange. En dessous : 426.')
ON CONFLICT (key) DO NOTHING;
