-- ============================================================================
-- 052_settings_test_volume_image_url.sql
-- ============================================================================
-- Images du mode volume (`GET /fastFood/all`, build de test, migration 051).
--
--   • `test_volume_image_url` : gabarit d'URL contenant `{seed}`, remplacé par
--     l'id cloné de chaque boutique et de chaque plat. Chaque clone reçoit ainsi
--     SA propre image, vraiment téléchargée par le téléphone : sans ça, les
--     clones réutilisent les URLs réelles, déjà en cache, et le test ne mesure
--     aucun chargement d'image. Vide = images réelles gardées.
--
-- Valeur par défaut : Picsum (photos réelles, stables par graine, sans
-- stockage). Donnée de test uniquement : lue seulement quand le client est la
-- build de test (`test_app_version`).
--
-- Idempotent : `ON CONFLICT DO NOTHING` ne réécrit pas une valeur déjà ajustée.
-- ============================================================================

INSERT INTO settings_deployment (key, value, description) VALUES
  (
    'test_volume_image_url',
    '"https://picsum.photos/seed/{seed}/600/400"'::jsonb,
    'Gabarit d''URL ({seed} = id clone) des images du mode volume de GET /fastFood/all. Vide = images reelles gardees.'
  )
ON CONFLICT (key) DO NOTHING;
