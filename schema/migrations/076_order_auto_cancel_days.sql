-- 076 — Annulation automatique des commandes payées non livrées (settings_app)
-- Jours avant annulation d'office (remboursement complet, frais au marchand).
-- 0 = désactivé. Idempotente.
INSERT INTO settings_app (key, value, description) VALUES
  ('order_auto_cancel_days', '7'::jsonb, 'Jours apres lesquels une commande payee non livree est annulee d''office (remboursement complet, frais repris au marchand). 0 = desactive.')
ON CONFLICT (key) DO NOTHING;
