-- ============================================================================
-- 025_fastfoods_pickup_allowed.sql
-- ============================================================================
-- `pickup_only` disait l'INVERSE de son usage réel.
--
-- Le nom laissait entendre « cette boutique ne livre pas, retrait uniquement ».
-- En réalité le champ sert à dire « le user PEUT venir récupérer sur place » —
-- une possibilité en plus, pas une exclusion de la livraison.
--
-- La confusion avait une conséquence directe : la tarification annulait le
-- supplément livraison des boutiques ayant `pickup_only = true`, alors qu'elles
-- déclaraient bien des zones de livraison avec leurs prix (cas de
-- « Review fast-foo »).
--
-- La VALEUR ne change pas, seul le nom. Aucune reprise de données.
--
-- ⚠️ Renommage sans compatibilité ascendante : les apps qui lisent `pickupOnly`
-- ne verront plus le champ. Le frontend est mis à jour dans le même mouvement.
--
-- Idempotent.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fastfoods' AND column_name = 'pickup_only'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fastfoods' AND column_name = 'pickup_allowed'
  ) THEN
    ALTER TABLE fastfoods RENAME COLUMN pickup_only TO pickup_allowed;
  END IF;
END $$;

-- Filet de sécurité si la colonne n'a jamais existé.
ALTER TABLE fastfoods
  ADD COLUMN IF NOT EXISTS pickup_allowed BOOLEAN DEFAULT FALSE;
