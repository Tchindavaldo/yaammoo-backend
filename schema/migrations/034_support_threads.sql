-- 034_support_threads.sql
-- Chat support client : fils de discussion + messages.
-- fastfood_id NULL = demande adressee a la plateforme yaammoo.

CREATE TABLE IF NOT EXISTS support_threads (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  fastfood_id   TEXT,
  topic         TEXT NOT NULL,
  title         TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'open',
  unread_count          INTEGER NOT NULL DEFAULT 0,
  -- Non-lus cote support/boutique (miroir de unread_count cote client).
  support_unread_count  INTEGER NOT NULL DEFAULT 0,
  last_message  TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_messages (
  id          TEXT PRIMARY KEY,
  thread_id   TEXT NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
  author      TEXT NOT NULL,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_threads_user
  ON support_threads (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_threads_fastfood
  ON support_threads (fastfood_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_messages_thread
  ON support_messages (thread_id, created_at ASC);
