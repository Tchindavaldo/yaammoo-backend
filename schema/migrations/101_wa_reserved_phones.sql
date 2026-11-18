-- ============================================================================
-- 101 — Numéros réservés à l'autre environnement Yaammoo (prod <-> test)
-- ============================================================================
-- Prod et test partagent le numéro WhatsApp : un clic sur un bouton revient au backend qui a
-- envoyé le message. Les super-administrateurs de l'AUTRE base sont donc refusés ici comme
-- numéro WhatsApp de boutique ou comme livreur (erreur 400, toast côté app) : ce backend ne
-- leur écrit jamais. Détail : architecture/whatsapp-ai.md (« Numéros fixés »).
--
-- Réglage (settings_app) : wa_reserved_phones, numéros saisis en base seulement (jamais dans
-- le dépôt). [] = aucun. Aucune table. Idempotente.
-- ============================================================================

INSERT INTO settings_app (key, value, description) VALUES
  ('wa_reserved_phones', '[]'::jsonb, 'Numéros des super-administrateurs de l''autre environnement Yaammoo (prod <-> test), refusés ici comme numéro WhatsApp de boutique ou livreur. [] = aucun.')
ON CONFLICT (key) DO NOTHING;
