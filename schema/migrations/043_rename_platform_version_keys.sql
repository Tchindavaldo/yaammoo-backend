-- ============================================================================
-- 043_rename_platform_version_keys.sql
-- ============================================================================
-- Renomme min_app_version / latest_app_version en platform_min_app_version /
-- platform_latest_app_version — cohérence avec les autres clés `platform_*`
-- (platform_margin, platform_free_delivery_min_items_*).
-- ============================================================================

UPDATE settings SET key = 'platform_min_app_version' WHERE key = 'min_app_version';
UPDATE settings SET key = 'platform_latest_app_version' WHERE key = 'latest_app_version';

-- Si la 042 n'a jamais tourné (nouvel environnement), on les crée directement
-- sous leur nom définitif.
INSERT INTO settings (key, value, description) VALUES
  ('platform_min_app_version', '"1.0.0"',
   'Version minimale requise pour utiliser l''app. En dessous : ecran de mise a jour forcee, non fermable.'),
  ('platform_latest_app_version', '"1.0.0"',
   'Derniere version publiee sur les stores. Affichee dans l''ecran de mise a jour non bloquante.')
ON CONFLICT (key) DO NOTHING;
