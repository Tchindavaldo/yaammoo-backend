-- 029_bonus_requests_one_row_per_claim.sql
-- Une réclamation = une LIGNE (au lieu d'une entrée empilée dans `status`).
--
-- AVANT : une seule ligne par (user, bonus). Chaque nouvelle réclamation ajoutait
-- une entrée au tableau `status` JSONB et ÉCRASAIT les colonnes du cycle (code,
-- usage_count, armed). L'historique n'était donc lisible qu'en dépliant du JSONB,
-- et les cycles précédents perdaient leur code.
--
-- APRÈS : chaque claim insère sa propre ligne, dont le `status` ne porte que sa
-- propre entrée. Les lectures par (user, bonus) prennent la PLUS RÉCENTE
-- (`created_at DESC`) — cf. `pickCurrentRequest` / `findByUserBonus`.
--
-- Cette migration DÉPLIE les lignes existantes : une ligne à N entrées devient
-- N lignes à 1 entrée. La ligne d'origine conserve la DERNIÈRE entrée (elle porte
-- déjà le code et les compteurs du cycle courant) ; les entrées antérieures
-- partent dans de nouvelles lignes d'historique.
--
-- ⚠️ Idempotente : ne traite que les lignes ayant encore plus d'une entrée.

-- Les lignes d'historique créées ici n'ont pas de code propre (il avait été
-- écrasé par les cycles suivants) : NULL, donc hors de l'index unique partiel.
INSERT INTO bonus_requests (id, user_id, bonus_id, status, code, usage_count, redeemed, armed, extra_data, created_at, updated_at)
SELECT
  -- id déterministe : rejouer la migration ne duplique pas (ON CONFLICT DO NOTHING).
  br.id || '_h' || (entry.ord - 1)                       AS id,
  br.user_id,
  br.bonus_id,
  jsonb_build_array(entry.value)                          AS status,
  NULL                                                    AS code,
  0                                                       AS usage_count,
  TRUE                                                    AS redeemed,   -- cycle clos
  FALSE                                                   AS armed,
  '{}'::jsonb                                             AS extra_data,
  -- Date du cycle historique : celle de son entrée, à défaut celle de la ligne.
  COALESCE((entry.value ->> 'createdAt')::timestamptz, br.created_at) AS created_at,
  NOW()                                                   AS updated_at
FROM bonus_requests br
CROSS JOIN LATERAL jsonb_array_elements(br.status) WITH ORDINALITY AS entry(value, ord)
WHERE jsonb_typeof(br.status) = 'array'
  AND jsonb_array_length(br.status) > 1
  -- toutes SAUF la dernière : celle-ci reste portée par la ligne d'origine
  AND entry.ord < jsonb_array_length(br.status)
ON CONFLICT (id) DO NOTHING;

-- La ligne d'origine ne garde que sa dernière entrée (le cycle courant, dont
-- elle porte déjà code / usage_count / armed).
UPDATE bonus_requests
   SET status     = jsonb_build_array(status -> (jsonb_array_length(status) - 1)),
       updated_at = NOW()
 WHERE jsonb_typeof(status) = 'array'
   AND jsonb_array_length(status) > 1;

-- Lecture par (user, bonus) : on trie systématiquement par created_at DESC.
CREATE INDEX IF NOT EXISTS idx_bonus_requests_user_bonus_recent
  ON bonus_requests(user_id, bonus_id, created_at DESC);
