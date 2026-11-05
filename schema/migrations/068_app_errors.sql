-- 068_app_errors.sql
-- Journal PERSISTANT des erreurs applicatives importantes (règlement, crédit,
-- paiement…). Les logs Fly sont perdus au redémarrage et vite tronqués : ici,
-- un admin retrouve le cas précis (quoi, où, sur quelle commande, avec quels
-- chiffres) sans refaire le calcul à la main.
CREATE TABLE IF NOT EXISTS app_errors (
  id          BIGSERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  scope       TEXT NOT NULL,          -- domaine : settlement, credit_merchant, payment_precheck…
  code        TEXT NOT NULL,          -- cause : negative_margin, settlement_missing…
  message     TEXT NOT NULL,          -- explication lisible, chiffres compris
  order_id    TEXT,
  user_id     TEXT,
  fastfood_id TEXT,
  context     JSONB NOT NULL DEFAULT '{}'::jsonb, -- données complètes du calcul
  resolved    BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_note TEXT
);
CREATE INDEX IF NOT EXISTS app_errors_unresolved_idx ON app_errors (created_at DESC) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS app_errors_order_idx ON app_errors (order_id);
ALTER TABLE app_errors ENABLE ROW LEVEL SECURITY;
