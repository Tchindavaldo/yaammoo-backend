-- ============================================================================
-- 099 — Notes vocales WhatsApp transcrites (agents IA marchand, livreur, admin)
-- ============================================================================
-- Une note vocale d'un numéro de boutique WhatsApp, d'un livreur ou d'un super-administrateur
-- est transcrite par un modèle OpenRouter qui écoute, puis Yaammoo renvoie « J'ai compris :
-- … » avec les boutons Confirmer / Corriger. Confirmée, la transcription est traitée par
-- l'agent comme un message écrit (décisions du 18/11/2026).
-- Détail : architecture/whatsapp-ai.md (« Notes vocales »).
--
-- Réglages (settings_app) :
--  - ai_audio_models : modèles essayés UN PAR UN dans l'ordre (le suivant si l'un échoue ou
--    ne renvoie rien). [] = notes vocales non écoutées (réponse « écrivez »).
--  - ai_audio_max_seconds : durée maximale écoutée (60). 0 = notes vocales non écoutées.
-- Aucune table. Idempotente.
-- ============================================================================

INSERT INTO settings_app (key, value, description) VALUES
  ('ai_audio_models', '["google/gemini-3.5-flash-lite", "google/gemini-2.5-flash-lite", "qwen/qwen3.8-omni-flash"]'::jsonb, 'Modèles OpenRouter qui transcrivent les notes vocales WhatsApp, essayés un par un dans l''ordre. [] = notes vocales non écoutées.'),
  ('ai_audio_max_seconds', '60'::jsonb, 'Durée maximale (secondes) d''une note vocale WhatsApp écoutée par l''agent IA ; au-delà, il demande un message plus court. 0 = notes vocales non écoutées.')
ON CONFLICT (key) DO NOTHING;
