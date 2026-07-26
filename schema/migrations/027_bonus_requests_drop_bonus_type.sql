-- 027_bonus_requests_drop_bonus_type.sql
-- Suppression de `bonus_requests.bonus_type`.
--
-- La colonne valait TOUJOURS 'loyalty' (écrit en dur au claim) : elle servait à
-- isoler les réclamations du nouveau modèle d'un legacy referral/claim disparu.
-- Une colonne à valeur unique ne discrimine rien — filtrer dessus revenait à ne
-- pas filtrer. La nature du bonus vit dans `bonus.type` (+ `requires_reward_credentials`).

-- L'index de lookup la référence : le recréer sans elle d'abord.
DROP INDEX IF EXISTS idx_bonus_requests_lookup;

CREATE INDEX IF NOT EXISTS idx_bonus_requests_lookup
  ON bonus_requests(bonus_id, user_id);

ALTER TABLE bonus_requests
  DROP COLUMN IF EXISTS bonus_type;
