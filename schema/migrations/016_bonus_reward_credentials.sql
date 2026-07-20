-- 016_bonus_reward_credentials.sql
-- Livraison manuelle des bonus (identifiants Netflix, clés de jeu…).
--
-- `requires_reward_credentials` : le claim reste `pending` au lieu d'être auto-approuvé.
-- Un admin (bonus plateforme) ou le marchand propriétaire fournit ensuite les
-- identifiants via POST /bonus/request/:id/reward-credentials, ce qui passe la réclamation
-- en `approved`.
--
-- Les identifiants livrés sont stockés dans l'entrée `status` du bonus_request
-- (JSONB, champ `rewardCredentials`) : pas de colonne dédiée, la forme varie selon le
-- type de bonus (login/password Netflix, clé, lien…).

-- Des versions antérieures de cette migration nommaient la colonne
-- `requires_fulfillment` puis `requires_delivery` : on renomme celle qui existe
-- avant de créer, pour que le fichier reste rejouable sur toute base.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'bonus' AND column_name = 'requires_fulfillment') THEN
    ALTER TABLE bonus RENAME COLUMN requires_fulfillment TO requires_reward_credentials;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'bonus' AND column_name = 'requires_delivery') THEN
    ALTER TABLE bonus RENAME COLUMN requires_delivery TO requires_reward_credentials;
  END IF;
END $$;

ALTER TABLE bonus
  ADD COLUMN IF NOT EXISTS requires_reward_credentials BOOLEAN NOT NULL DEFAULT FALSE;

-- Les réclamations en attente de livraison sont consultées côté back-office :
-- index partiel sur les demandes non encore honorées.
CREATE INDEX IF NOT EXISTS idx_bonus_requests_pending
  ON bonus_requests (bonus_id)
  WHERE code IS NULL;
