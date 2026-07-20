-- ============================================================================
-- 014_bonus_structured_columns.sql
-- ============================================================================
-- Structure les tables `bonus` et `bonus_requests`, jusqu'ici quasi entièrement
-- en JSONB (reliquat de la reprise Firestore : `data` / `extra_data` libres).
--
-- Motivations :
--   • Filtrer en SQL (fastfood_id, active, code) au lieu de tout rapatrier
--     puis filtrer en JS.
--   • Indexer les accès chauds (findByCode scannait toute la table).
--   • Garantir l'intégrité : FK vers fastfoods, unicité du code, types réels.
--
-- `criteria` reste en JSONB : sous-objet cohérent {kind, target, period},
-- toujours lu d'un bloc, jamais filtré champ par champ.
--
-- Idempotent. Aucune reprise de données : aucun bonus en production à ce jour.
-- ============================================================================

-- ── 1. Table `bonus` : définition structurée ────────────────────────────────
ALTER TABLE bonus
  ADD COLUMN IF NOT EXISTS type           TEXT,
  ADD COLUMN IF NOT EXISTS name           TEXT,
  ADD COLUMN IF NOT EXISTS description    TEXT,
  ADD COLUMN IF NOT EXISTS criteria       JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS fastfood_id    TEXT,
  ADD COLUMN IF NOT EXISTS fastfood_name  TEXT,
  ADD COLUMN IF NOT EXISTS active         BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS claim_duration INTEGER,
  ADD COLUMN IF NOT EXISTS usage_limit    INTEGER,
  ADD COLUMN IF NOT EXISTS created_by     TEXT,
  ADD COLUMN IF NOT EXISTS extra_data     JSONB DEFAULT '{}'::jsonb;

-- `data` (fourre-tout Firestore) devient inutile : supprimée directement, la
-- table ne contient aucune donnée en production.
ALTER TABLE bonus DROP COLUMN IF EXISTS data;

-- Un bonus rattaché à une boutique supprimée n'a plus lieu d'être.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bonus_fastfood_id_fkey'
  ) THEN
    ALTER TABLE bonus
      ADD CONSTRAINT bonus_fastfood_id_fkey
      FOREIGN KEY (fastfood_id) REFERENCES fastfoods(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Un nom d'affichage est toujours attendu : celui de la boutique, ou celui de
-- la plateforme (PLATFORM_NAME) pour un bonus plateforme (fastfood_id NULL).
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

-- Accès chauds : liste des bonus d'une boutique, bonus actifs.
CREATE INDEX IF NOT EXISTS idx_bonus_fastfood ON bonus(fastfood_id);
CREATE INDEX IF NOT EXISTS idx_bonus_active   ON bonus(active) WHERE active = TRUE;

-- ── 2. Table `bonus_requests` : cycle d'utilisation structuré ───────────────
ALTER TABLE bonus_requests
  ADD COLUMN IF NOT EXISTS code        TEXT,
  ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS redeemed    BOOLEAN DEFAULT FALSE;

-- findByCode scannait toute la table (extra_data->>'code', non indexé).
-- Unicité : un code identifie une seule réclamation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bonus_requests_code
  ON bonus_requests(code) WHERE code IS NOT NULL;

-- Un usage consommé ne peut pas être négatif.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bonus_requests_usage_count_chk'
  ) THEN
    ALTER TABLE bonus_requests
      ADD CONSTRAINT bonus_requests_usage_count_chk CHECK (usage_count >= 0);
  END IF;
END $$;
