-- ============================================================================
-- 065 — Agrégateur de paiement actif en BASE (settings_deployment)
-- ============================================================================
-- Remplace l'env `PAYMENT_AGGREGATOR` : basculer d'agrégateur ne demande plus
-- de redéploiement. Valeurs : "pawapay" | "digikuntz". Valeur absente ou
-- inconnue → erreur journalisée + fonctionnement historique (digikuntz).
-- Idempotent : ne réécrit pas une valeur déjà ajustée.
-- ============================================================================

INSERT INTO settings_deployment (key, value, description) VALUES
  (
    'payment_aggregator',
    '"pawapay"'::jsonb,
    'Agregateur envoye a MobileWallet sur /pay et /payout, et bareme de frais du prix affiche. Valeurs : pawapay | digikuntz.'
  )
ON CONFLICT (key) DO NOTHING;
