-- ============================================================================
-- 100 — Agent actif d'un super-administrateur qui a aussi une boutique WhatsApp
-- ============================================================================
-- Un numéro de `ai_admin_phones` qui pilote aussi une boutique WhatsApp a deux agents :
-- l'agent admin (par défaut) et celui de sa boutique. L'un passe la main à l'autre à sa
-- demande, ou après avoir proposé de le faire (outil `handoff`). Le choix reste jusqu'au
-- prochain changement. Pas de ligne = agent admin. Décision du 18/11/2026.
-- Détail : architecture/whatsapp-ai.md (« Agent admin et alertes »). Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS wa_agent_modes (
  phone       TEXT PRIMARY KEY,                                  -- E.164 du super-administrateur
  mode        TEXT NOT NULL CHECK (mode IN ('admin', 'merchant')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE wa_agent_modes ENABLE ROW LEVEL SECURITY;
