-- ============================================================================
-- 013_bonus_admin_and_claim_counts.sql
-- ============================================================================
-- 1. Rôle admin sur users : autorise la création de bonus PLATEFORME
--    (bonus sans fastfood_id, visibles par tous les utilisateurs).
--    Les marchands, eux, ne peuvent créer que des bonus de LEUR boutique
--    (contrôle applicatif : viewerUid === fastfood.userId).
--
-- 2. Agrégation SQL des réclamations de bonus : évite de scanner toute la
--    table bonus_requests à chaque GET /bonus/all pour calculer
--    totalClaimedCount (le comptage se fait désormais en base).
--
-- Idempotent : réexécutable sans effet de bord.
-- ============================================================================

-- ── 1. Rôle admin ───────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Peu d'admins : index partiel, on n'indexe que les lignes concernées.
CREATE INDEX IF NOT EXISTS idx_users_is_admin
  ON users(is_admin) WHERE is_admin = TRUE;

-- ── 2. Agrégation des réclamations ──────────────────────────────────────────
-- Une "réclamation" = une entrée du tableau JSONB `status` dont le statut est
-- accordé (approved/completed). On déplie le tableau et on compte par bonus.
--
-- Retour : une ligne par bonus, au lieu de toutes les lignes de la table.
CREATE OR REPLACE FUNCTION bonus_claim_counts(claimed_statuses TEXT[])
RETURNS TABLE (bonus_id TEXT, claim_count BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT br.bonus_id,
         COUNT(*) AS claim_count
  FROM bonus_requests br
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(br.status) = 'array'
         THEN br.status
         ELSE '[]'::jsonb
    END
  ) AS entry
  WHERE entry->>'status' = ANY(claimed_statuses)
  GROUP BY br.bonus_id;
$$;

-- Accélère le dépliage/filtrage du JSONB `status`.
CREATE INDEX IF NOT EXISTS idx_bonus_requests_status_gin
  ON bonus_requests USING GIN (status);
