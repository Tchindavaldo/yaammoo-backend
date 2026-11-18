-- ============================================================================
-- 104 — Super-admin qui bascule prod <-> test par message (« passe en test »)
-- ============================================================================
-- Prod et test partagent le numéro WhatsApp ; le même super-admin peut piloter les deux. Il
-- écrit « passe en test » ou « passe en prod » : l'agent admin appelle l'outil switch_env,
-- qui fixe son numéro sur la clé de l'AUTRE backend dans le module (POST
-- /contact-routes/handover). Ses textes et vocaux vont alors à l'autre backend ; ce qu'on lui
-- envoie lui arrive toujours. À son retour, l'agent commence par un récap de son absence.
--
-- Réglages (settings_app, saisis par environnement) :
--  - wa_env_name : nom de CET environnement ('prod' ou 'test'), lu par l'agent.
--  - wa_sibling_key_name : nom de la clé du module de l'AUTRE backend ('' = pas de bascule).
-- Table wa_admin_away : super-admin parti sur l'autre backend, depuis quand (récap au retour).
-- Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS wa_admin_away (
  phone TEXT PRIMARY KEY,
  since TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE wa_admin_away ENABLE ROW LEVEL SECURITY;

INSERT INTO settings_app (key, value, description) VALUES
  ('wa_env_name', '""'::jsonb, 'Nom de cet environnement Yaammoo pour l''agent admin WhatsApp : prod ou test.'),
  ('wa_sibling_key_name', '""'::jsonb, 'Nom de la clé du module WhatsApp de l''autre backend (prod <-> test), pour « passe en test / en prod ». Vide = pas de bascule.')
ON CONFLICT (key) DO NOTHING;
