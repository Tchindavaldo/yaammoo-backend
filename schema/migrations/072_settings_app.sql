-- ============================================================================
-- 072 — Table `settings_app` : réglages de fonctionnement du backend
-- ============================================================================
-- `settings_deployment` garde les versions d'app, le mode review et
-- l'agrégateur. Les réglages de fonctionnement du backend (rétentions, purges,
-- boutiques masquées, et les futurs) vivent dans `settings_app`.
--
-- PARTIE 1 — à appliquer AVANT le déploiement du code (le backend lit
-- `settings_app` au démarrage). Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS settings_app (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE settings_app ENABLE ROW LEVEL SECURITY;

-- Boutiques masquées : valeur actuelle reprise de settings_deployment.
INSERT INTO settings_app (key, value, description)
SELECT 'hidden_fastfood_ids', COALESCE((SELECT value FROM settings_deployment WHERE key = 'hidden_fastfood_ids'), '[]'::jsonb),
       'Boutiques masquees du home et de la recherche sauf pour leur proprietaire (boutique de review Apple).'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings_app (key, value, description) VALUES
  ('image_trash_retention_days', '60'::jsonb, 'Jours avant effacement du storage d''une image remplacee ou supprimee (corbeille, migration 071).'),
  ('fastfood_delete_retention_days', '90'::jsonb, 'Jours pendant lesquels une boutique supprimee reste restaurable.'),
  ('fastfood_purge_interval_ms', '86400000'::jsonb, 'Intervalle du job de purge (boutiques supprimees, corbeille d''images). 0 = desactive.')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- PARTIE 2 — appliquée APRÈS le déploiement (13/11/2026, test et prod).
-- Retire la clé déplacée et les versionings PÉRIMÉS (sous
-- platform_min_app_version 1.1.4, plus lus par le code depuis 9d50e56, R11.6).
-- Gardées : wallet_networks_min_app_version (1.1.5, pas encore dépassée) et
-- platform_default_app_version (pas un seuil de version), non lues par le code.
-- ============================================================================
DELETE FROM settings_deployment WHERE key IN ('hidden_fastfood_ids', 'legacy_no_auth_max_app_version', 'delivery_new_format_min_app_version');
