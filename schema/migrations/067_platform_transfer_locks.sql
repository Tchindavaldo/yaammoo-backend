-- 067_platform_transfer_locks.sql
-- Verrou en base des transferts de marge plateforme (admin) : une ligne par
-- boutique SOURCE en cours de transfert. La clé primaire empêche deux
-- transferts simultanés sur la même source, quel que soit le nombre de machines.
-- Un verrou de plus de 2 minutes (crash) est considéré périmé et repris.
CREATE TABLE IF NOT EXISTS platform_transfer_locks (
  source_fastfood_id TEXT PRIMARY KEY,
  admin_uid          TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
