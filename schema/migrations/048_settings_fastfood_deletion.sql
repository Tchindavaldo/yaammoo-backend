-- ============================================================================
-- 048_settings_fastfood_deletion.sql
-- ============================================================================
-- Réglages de la suppression admin de boutiques (migration 047), en BASE et non
-- en `.env`.
--
-- Pourquoi en base : la durée de rétention décide du délai pendant lequel une
-- suppression reste annulable. C'est une décision d'exploitation qu'on doit
-- pouvoir allonger sans redéployer — typiquement le jour où un admin réclame la
-- restauration d'une boutique dont les 30 jours viennent d'expirer.
-- (`flyctl secrets set` redémarre la machine sans rebuild : ce n'est pas un
-- levier de réglage à chaud, cf. CLAUDE.md.)
--
-- Rangés en `settings_deployment` : ce sont des réglages d'exploitation, pas de
-- tarification ni de livraison.
--
-- Idempotent : `ON CONFLICT DO NOTHING` ne réécrit pas une valeur déjà ajustée
-- en production.
-- ============================================================================

INSERT INTO settings_deployment (key, value, description) VALUES
  (
    'fastfood_delete_retention_days',
    '30'::jsonb,
    'Jours pendant lesquels une boutique supprimée par un admin reste restaurable. Passé ce délai, la purge l''efface définitivement (lignes + images du bucket).'
  ),
  (
    'fastfood_purge_interval_ms',
    '86400000'::jsonb,
    'Intervalle du job de purge des boutiques expirées, en millisecondes (86400000 = 24h). 0 desactive la purge automatique ; POST /fastFood/admin/purge reste disponible.'
  )
ON CONFLICT (key) DO NOTHING;
