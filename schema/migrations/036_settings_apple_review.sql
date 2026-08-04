-- ============================================================================
-- 036_settings_apple_review.sql
-- ============================================================================
-- Bascule du mode Apple Review depuis `.env` vers la table `settings`.
--
-- Pourquoi : la soumission App Store impose d'activer puis de désactiver ce
-- mode en cours de review, sans redéployer. `flyctl secrets set` redémarre la
-- machine — inacceptable pendant une review en cours.
--
-- Deux réglages distincts, car les deux niveaux d'usage sont indépendants :
--   • `apple_review_mode`         : booléen exposé au frontend par
--                                   `GET /fastFood/all` (champ `appleReviewMode`).
--   • `apple_version_review_mode` : version d'app EXACTE en cours de review.
--                                   `POST /transaction` bypasse le paiement
--                                   uniquement si le header `x-app-version`
--                                   est STRICTEMENT ÉGAL à cette valeur.
--                                   Chaîne vide = aucune version en review.
--
-- Idempotent.
-- ============================================================================

INSERT INTO settings (key, value, description) VALUES
  ('apple_review_mode',
   'false'::jsonb,
   'Mode Apple Review global. Exposé au frontend par GET /fastFood/all (appleReviewMode).'),
  ('apple_version_review_mode',
   '""'::jsonb,
   'Version d''app exacte en cours de review App Store (ex. "1.4.2"). POST /transaction bypasse le paiement seulement si le header x-app-version est identique. Vide = aucune version en review.')
ON CONFLICT (key) DO NOTHING;
