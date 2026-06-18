-- ============================================================================
-- Migration: Outbox d'events socket fiables (reprise après déconnexion)
-- ============================================================================
-- Socket.io est fire-and-forget : un event émis pendant que l'utilisateur est
-- hors ligne est perdu. Cette table persiste les events "fiables" (reliable)
-- émis vers un userId. Au (re)join_user, le backend rejoue les events non
-- encore délivrés. La livraison est confirmée via l'ACK natif Socket.io
-- (callback) → delivered_at est renseigné automatiquement.
--
-- Purge : events délivrés supprimés ; non délivrés purgés après TTL (7 jours).
--
-- Idempotence migration : IF NOT EXISTS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS outbox_events (
  id            BIGSERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL,             -- destinataire (room = userId)
  event         TEXT NOT NULL,             -- nom de l'event socket
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  delivered_at  TIMESTAMPTZ,               -- NULL = pas encore confirmé reçu
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Replay : récupérer rapidement les events non délivrés d'un user, dans l'ordre
CREATE INDEX IF NOT EXISTS idx_outbox_user_undelivered
  ON outbox_events(user_id, created_at)
  WHERE delivered_at IS NULL;

-- Purge par ancienneté
CREATE INDEX IF NOT EXISTS idx_outbox_created_at
  ON outbox_events(created_at);
