-- ============================================================================
-- 071 — Corbeille d'images (suppression différée du storage)
-- ============================================================================
-- Une image remplacée ou supprimée (menu, logo de boutique, bannière, flyer de
-- bonus, DELETE /image) n'est plus effacée tout de suite : elle est mise en
-- corbeille, restaurable par l'admin, puis effacée du storage après
-- `image_trash_retention_days` jours (settings_app, 60 par défaut).
-- Idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS image_trash (
  id          TEXT PRIMARY KEY,
  url         TEXT NOT NULL,
  entity      TEXT,          -- menu | fastfood | banner | bonus | NULL (DELETE /image)
  entity_id   TEXT,
  field       TEXT,          -- image | coverImage | images | imageUrl | flyerUrl
  trashed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  restored_at TIMESTAMPTZ,
  purged_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS image_trash_pending_idx
  ON image_trash (trashed_at) WHERE restored_at IS NULL AND purged_at IS NULL;

ALTER TABLE image_trash ENABLE ROW LEVEL SECURITY;

-- Réglage `image_trash_retention_days` : table `settings_app` (migration 072).
