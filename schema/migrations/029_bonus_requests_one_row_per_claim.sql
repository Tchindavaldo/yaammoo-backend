-- 029_bonus_requests_one_row_per_claim.sql
-- Une réclamation = une LIGNE, désignée explicitement par `is_current`.
--
-- AVANT : une seule ligne par (user, bonus). Chaque nouvelle réclamation ajoutait
-- une entrée au tableau `status` JSONB et ÉCRASAIT les colonnes du cycle (code,
-- usage_count, armed). L'historique n'était lisible qu'en dépliant du JSONB, et
-- le code d'un cycle était perdu au claim suivant.
--
-- APRÈS : chaque claim insère sa propre ligne, dont le `status` ne porte que sa
-- propre entrée. Les cycles précédents restent consultables.
--
-- ⚠️ POURQUOI UNE COLONNE ET PAS UN TRI PAR DATE
-- Éclater en lignes rend chaque ligne porteuse de colonnes (code, armed,
-- usage_count) : sans marqueur, chaque lecture devrait DEVINER laquelle décrit
-- le présent (tri created_at DESC), et rien n'empêcherait deux lignes de se
-- prétendre courantes. `is_current` + index unique partiel font garantir
-- l'invariante « une seule ligne vivante par (user, bonus) » par la BASE, pas
-- par la discipline du code — c'est plus solide que l'ancien modèle.
--
-- Idempotente.

-- ============================================================================
-- 1. Colonne
-- ============================================================================
ALTER TABLE bonus_requests
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN bonus_requests.is_current IS
  'Réclamation courante de ce (user, bonus). Une seule ligne à TRUE — garanti par idx_bonus_requests_current. Les lignes à FALSE sont l''historique des cycles précédents.';

-- ============================================================================
-- 2. Dépliage des lignes existantes : N entrées -> N lignes
-- ============================================================================
-- La ligne d'origine garde la DERNIÈRE entrée (elle porte déjà le code et les
-- compteurs du cycle courant) et reste `is_current`. Les entrées antérieures
-- partent dans des lignes d'historique (is_current = FALSE).
--
-- Ces lignes n'ont pas de code propre — il avait été écrasé par les cycles
-- suivants : NULL, donc hors de l'index unique partiel sur `code`.
INSERT INTO bonus_requests (id, user_id, bonus_id, status, code, usage_count, redeemed, armed, is_current, extra_data, created_at, updated_at)
SELECT
  -- id déterministe : rejouer la migration ne duplique pas.
  br.id || '_h' || (entry.ord - 1)                       AS id,
  br.user_id,
  br.bonus_id,
  jsonb_build_array(entry.value)                          AS status,
  NULL                                                    AS code,
  0                                                       AS usage_count,
  TRUE                                                    AS redeemed,   -- cycle clos
  FALSE                                                   AS armed,
  FALSE                                                   AS is_current, -- historique
  '{}'::jsonb                                             AS extra_data,
  COALESCE((entry.value ->> 'createdAt')::timestamptz, br.created_at) AS created_at,
  NOW()                                                   AS updated_at
FROM bonus_requests br
CROSS JOIN LATERAL jsonb_array_elements(br.status) WITH ORDINALITY AS entry(value, ord)
WHERE jsonb_typeof(br.status) = 'array'
  AND jsonb_array_length(br.status) > 1
  AND entry.ord < jsonb_array_length(br.status)   -- toutes sauf la dernière
ON CONFLICT (id) DO NOTHING;

-- La ligne d'origine ne garde que sa dernière entrée.
UPDATE bonus_requests
   SET status     = jsonb_build_array(status -> (jsonb_array_length(status) - 1)),
       updated_at = NOW()
 WHERE jsonb_typeof(status) = 'array'
   AND jsonb_array_length(status) > 1;

-- ============================================================================
-- 3. Filet de sécurité avant l'index unique
-- ============================================================================
-- Si un (user, bonus) avait plusieurs lignes courantes (données antérieures
-- incohérentes), on ne garde que la plus récente — sinon la création de l'index
-- échoue.
UPDATE bonus_requests br
   SET is_current = FALSE,
       updated_at = NOW()
 WHERE br.is_current
   AND EXISTS (
     SELECT 1 FROM bonus_requests other
      WHERE other.user_id = br.user_id
        AND other.bonus_id = br.bonus_id
        AND other.is_current
        AND (other.created_at, other.id) > (br.created_at, br.id)
   );

-- ============================================================================
-- 4. L'invariante, garantie par la base
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_bonus_requests_current
  ON bonus_requests(user_id, bonus_id) WHERE is_current;
