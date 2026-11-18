-- ============================================================================
-- 103 — Fixer (ou non) les super-admins sur la clé de CE backend dans le module WhatsApp
-- ============================================================================
-- Chaque backend fixe ses `ai_admin_phones` sur sa clé (utils/whatsappContactRoutesJob.js).
-- Un numéro ne se fixe que sur UNE clé : quand le même numéro est admin en prod ET en test
-- (décision du 18/11/2026, numéro Yaammoo refusé par Meta), seul la prod le fixe ; le test
-- met wa_pin_admin_phones = false. Défaut true. Idempotente.
-- ============================================================================

INSERT INTO settings_app (key, value, description) VALUES
  ('wa_pin_admin_phones', 'true'::jsonb, 'Fixer les super-administrateurs (ai_admin_phones) sur la clé de ce backend dans le module WhatsApp. false = rien n''est fixé ici (même numéro admin en prod et en test : seule la prod le fixe).')
ON CONFLICT (key) DO NOTHING;
