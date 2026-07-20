-- 017_bonus_requires_profile.sql
-- « Ce bonus donne accès à un profil nominatif protégé par son propre code »
-- (Netflix et assimilés : compte partagé, un profil + un code par utilisateur).
--
-- Portée par le BONUS lui-même et non déduite de `type` : la règle devient une
-- donnée modifiable en base ou via PATCH /bonus/:id, sans redéploiement. Une
-- liste de types en dur dans le code (ou en variable d'environnement) aurait
-- imposé une livraison de code à chaque nouveau bonus à profil.
--
-- Effet : à la livraison (POST /bonus/request/:id/reward-credentials), si le bonus
-- a `requires_profile = true`, le champ `rewardCredentials.profile` devient
-- obligatoire ({name, code}) — sinon 400. Les identifiants de compte seuls ne
-- permettent pas d'entrer sur le profil.
--
-- Indépendant de `requires_reward_credentials` (016), qui décide seulement si le
-- claim reste `pending` en attente d'une livraison manuelle. En pratique un bonus
-- à profil est aussi à livraison manuelle, mais rien ne l'impose ici.

ALTER TABLE bonus
  ADD COLUMN IF NOT EXISTS requires_profile BOOLEAN NOT NULL DEFAULT FALSE;

-- Reprise de l'existant : les bonus Netflix déjà créés exigent un profil.
-- `type` est une chaîne libre, d'où la comparaison insensible à la casse.
UPDATE bonus
   SET requires_profile = TRUE
 WHERE LOWER(type) = 'netflix'
   AND requires_profile IS DISTINCT FROM TRUE;
