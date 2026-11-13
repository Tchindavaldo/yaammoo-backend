-- 069_order_status_history.sql
-- Historique des changements de statut des commandes : base des futures stats
-- marchand « Délais » (S15 : préparation, livraison, total). Rempli par un
-- trigger sur `orders`, donc quel que soit le chemin de code qui change le statut.
-- Les délais ne sont calculables que pour les commandes créées après cette migration.

CREATE TABLE IF NOT EXISTS order_status_history (
  id           BIGSERIAL PRIMARY KEY,
  order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  fastfood_id  TEXT NOT NULL,
  from_status  TEXT,
  to_status    TEXT NOT NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history (order_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_order_status_history_shop ON order_status_history (fastfood_id, changed_at);

-- A coller dans Supabase -> SQL Editor (les fonctions ne passent pas par le MCP).
CREATE OR REPLACE FUNCTION log_order_status_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO order_status_history (order_id, fastfood_id, from_status, to_status)
    VALUES (NEW.id, NEW.fastfood_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_status_history ON orders;
CREATE TRIGGER trg_order_status_history
  AFTER INSERT OR UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION log_order_status_change();
