-- ============================================================================
-- 044_banners.sql
-- ============================================================================
-- Bannières publicitaires affichées en carrousel sur le home.
--
-- Pourquoi une table plutôt qu'une clé `settings` :
--   • CRUD unitaire (ajouter/supprimer/réordonner une image sans toucher les
--     autres) — un gros JSONB obligerait à remplacer tout le tableau à chaque
--     mutation ;
--   • tri rigoureux par `sort_order` (ORDER BY SQL) ;
--   • type contrôlé (CHECK) : `bonus` (ouvre la sheet bonus) ou `none`.
--
-- `sort_order` détermine l'ordre dans le carrousel. À l'écriture, le service se
-- charge de redistribuer 0..n-1 s'il y a doublon (« numéro déjà pris » ⇒ les
-- suivants sont décalés) : voir services/banners/banners.service.js.
--
-- Idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS banners (
  id          TEXT PRIMARY KEY,
  title       TEXT,
  image_url   TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'none',
  target_id   TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT banners_type_check CHECK (type IN ('bonus', 'none'))
);

CREATE INDEX IF NOT EXISTS idx_banners_active_order ON banners(active, sort_order);
