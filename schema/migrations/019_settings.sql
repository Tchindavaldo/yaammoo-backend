-- ============================================================================
-- 019_settings.sql
-- ============================================================================
-- Réglages métier modifiables À CHAUD, sans redéploiement.
--
-- Pourquoi une table plutôt que des variables d'environnement :
--   • la marge, les frais de paiement et le mode « livraison offerte » sont des
--     décisions COMMERCIALES, prises et annulées en cours de journée ;
--   • `flyctl secrets set` ne rebuild pas le code mais redémarre la machine —
--     inacceptable pour basculer une campagne.
--
-- Les SEUILS DE VERSION D'APP restent, eux, en `.env` : ils sont liés au
-- déploiement (cf. CLAUDE.md › Versioning par version d'app).
--
-- Idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  -- JSONB et non TEXT : une valeur peut être un nombre, un booléen ou un objet,
  -- sans avoir à re-typer côté applicatif à chaque lecture.
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Valeurs initiales. `ON CONFLICT DO NOTHING` : rejouer la migration ne doit
-- jamais écraser un réglage modifié en production.
INSERT INTO settings (key, value, description) VALUES
  ('platform_margin',
   '100'::jsonb,
   'Marge Yaammoo ajoutée au prix affiché de chaque plat (FCFA).'),
  ('payment_fee_percent',
   '5'::jsonb,
   'Frais du prestataire de paiement, en % du montant payé. Arrondi à l''entier SUPÉRIEUR. Ne revient pas à la plateforme.'),
  ('delivery_free_mode',
   'false'::jsonb,
   'Campagne « livraison offerte » globale. Les prix restent affichés normalement : seul deliveryOffer.reason = campaign change.')
ON CONFLICT (key) DO NOTHING;
