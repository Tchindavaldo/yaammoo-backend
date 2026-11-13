-- ============================================================================
-- 069 — Boutiques masquees (settings_deployment.hidden_fastfood_ids)
-- ============================================================================
-- Tableau d'ids de boutiques ABSENTES du home et de la recherche
-- (`GET /fastfood/all`) pour tout le monde SAUF leur proprietaire
-- (`fastfoods.user_id`). Sert a la boutique de review Apple en prod : le
-- reviewer, connecte avec le compte review, la voit ; les vrais clients jamais.
-- Defaut : [] (aucune). Idempotent : ne reecrit pas une valeur deja ajustee.
-- ============================================================================

INSERT INTO settings_deployment (key, value, description) VALUES
  (
    'hidden_fastfood_ids',
    '[]'::jsonb,
    'Boutiques masquees du home et de la recherche sauf pour leur proprietaire (boutique de review Apple).'
  )
ON CONFLICT (key) DO NOTHING;

-- PROD uniquement, apres la migration : masquer la boutique de review.
-- UPDATE settings_deployment SET value = '["8KqUta86xe9fvihWnkzd"]'::jsonb WHERE key = 'hidden_fastfood_ids';
