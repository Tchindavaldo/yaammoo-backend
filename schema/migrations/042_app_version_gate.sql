-- ============================================================================
-- 042_app_version_gate.sql
-- ============================================================================
-- Version minimale requise et dernière version publiée, pour l'écran de mise
-- à jour forcée côté app. En base (pas `.env`) : décision produit qu'on doit
-- pouvoir basculer sans redéployer, au même titre que les autres réglages de
-- cette table.
--
-- `min_app_version` : en dessous, le client est bloqué (écran plein écran non
-- fermable). `latest_app_version` : affichée dans l'écran "mise à jour
-- disponible" (non bloquant) quand le client est à jour mais pas sur la
-- dernière version.
--
-- Repli applicatif : voir settings.service.js — "0.0.0" pour les deux, jamais
-- bloquant par défaut. Une clé absente ou une valeur mal formée ne doit JAMAIS
-- couper l'accès à l'app.
-- ============================================================================

INSERT INTO settings (key, value, description) VALUES
  ('min_app_version', '"1.0.0"',
   'Version minimale requise pour utiliser l''app. En dessous : ecran de mise a jour forcee, non fermable.'),
  ('latest_app_version', '"1.0.0"',
   'Derniere version publiee sur les stores. Affichee dans l''ecran de mise a jour non bloquante.')
ON CONFLICT (key) DO NOTHING;
