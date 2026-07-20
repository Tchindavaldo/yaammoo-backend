-- ============================================================================
-- 015_bonus_platform_name.sql
-- ============================================================================
-- Un bonus PLATEFORME (fastfood_id NULL) porte désormais le nom de la
-- plateforme (env PLATFORM_NAME, ex. "yaammoo") dans fastfood_name, afin que le
-- front affiche toujours un émetteur.
--
-- La contrainte de la migration 014 imposait « les deux nuls OU les deux
-- remplis », ce qui interdisait ce cas. On la remplace : fastfood_name est
-- toujours requis, fastfood_id reste optionnel (NULL = plateforme).
--
-- Idempotent.
-- ============================================================================

ALTER TABLE bonus DROP CONSTRAINT IF EXISTS bonus_fastfood_pair_chk;

-- Renseigne les bonus plateforme déjà créés (aucun en prod à ce jour, mais la
-- migration doit rester rejouable sans casser la contrainte ci-dessous).
UPDATE bonus
   SET fastfood_name = 'yaammoo'
 WHERE fastfood_id IS NULL
   AND (fastfood_name IS NULL OR fastfood_name = '');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bonus_fastfood_name_chk'
  ) THEN
    ALTER TABLE bonus
      ADD CONSTRAINT bonus_fastfood_name_chk
      CHECK (fastfood_name IS NOT NULL AND fastfood_name <> '');
  END IF;
END $$;
