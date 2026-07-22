-- ============================================================================
-- 018_bonus_requests_armed.sql
-- ============================================================================
-- Armement d'une réclamation de bonus (livraison offerte).
--
-- « Armer » = le user déclare, depuis sa page bonus, qu'il veut que ce bonus
-- s'applique à sa prochaine commande éligible. L'armement doit SURVIVRE à la
-- fermeture de l'app : le front ne peut donc pas le garder en local, d'où cette
-- colonne. L'armement depuis l'écran de commande, lui, reste purement local
-- (il meurt avec l'écran) et ne touche jamais cette colonne.
--
-- ⚠️ Armer ne consomme RIEN : `usage_count` n'est incrémenté qu'à la création
-- effective d'une commande.
--
-- Idempotent.
-- ============================================================================

ALTER TABLE bonus_requests
  ADD COLUMN IF NOT EXISTS armed BOOLEAN NOT NULL DEFAULT FALSE;

-- Accès chaud : GET /fastfood/all charge, à chaque affichage du home, les
-- réclamations armées du user courant. Index partiel — les lignes armées sont
-- une minorité.
CREATE INDEX IF NOT EXISTS idx_bonus_requests_armed
  ON bonus_requests(user_id) WHERE armed = TRUE;
