-- ============================================================================
-- 080 — Réglage du module WhatsApp (rauval-backend) dans `settings_app`
-- ============================================================================
-- Délai max d'un appel au module (envoi, accusé de lecture). Sans la ligne, le
-- code retombe sur 15000 (FALLBACKS) : la migration peut suivre le déploiement.
-- Idempotente. Détail : architecture/whatsapp.md.
-- ============================================================================

INSERT INTO settings_app (key, value, description) VALUES
  ('whatsapp_timeout_ms', '15000'::jsonb, 'Délai max (ms) d''un appel au module WhatsApp de rauval-backend.')
ON CONFLICT (key) DO NOTHING;
