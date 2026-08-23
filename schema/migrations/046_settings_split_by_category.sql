-- ============================================================================
-- 046_settings_split_by_category.sql
-- ============================================================================
-- Éclate la table `settings` unique en CINQ tables, une par catégorie métier,
-- toutes préfixées `settings_`.
--
-- Pourquoi : `settings` mélangeait des réglages qui n'ont ni le même public, ni
-- la même criticité, ni le même rythme de changement — la marge commerciale, le
-- barème de retrait d'un opérateur, la version minimale d'app et le cooldown
-- d'un OTP payant. Une table fourre-tout rend impossible de dire, en la
-- regardant, quel domaine on est en train de toucher.
--
--   settings_auth       — authentification (OTP Bird)
--   settings_pricing    — composition des prix et marges
--   settings_delivery   — livraison offerte et ses seuils
--   settings_withdrawal — barèmes de frais de retrait, par opérateur
--   settings_deployment — versions d'app et Apple Review
--
-- Toutes ont la MÊME forme que l'ancienne (key / value JSONB / description /
-- updated_at) : le code accède à l'une ou l'autre par le même chemin, seule la
-- table change.
--
-- ⚠️ Aucun SECRET ici, dans aucune de ces tables. `BIRD_API_KEY` reste en
-- variable d'environnement (`.env` en local, secrets Fly en production).
--
-- Idempotent : rejouable sans écraser un réglage modifié en production.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Les cinq tables
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS settings_auth (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings_pricing (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings_delivery (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings_withdrawal (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings_deployment (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. Reprise des valeurs existantes depuis l'ancienne table
-- ----------------------------------------------------------------------------
-- Les valeurs EN PRODUCTION priment sur les valeurs par défaut de l'étape 3 :
-- on copie d'abord, on complète ensuite. Une marge passée de 100 à 150 en
-- exploitation doit rester à 150.
--
-- Le bloc entier est conditionné à l'existence de `settings` : sur un
-- environnement neuf, la table n'a jamais existé et il n'y a rien à reprendre.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'settings') THEN

    INSERT INTO settings_auth (key, value, description, updated_at)
      SELECT key, value, description, updated_at FROM settings
      WHERE key LIKE 'otp\_%'
    ON CONFLICT (key) DO NOTHING;

    INSERT INTO settings_pricing (key, value, description, updated_at)
      SELECT key, value, description, updated_at FROM settings
      WHERE key IN (
        'platform_margin',
        'payment_fee_percent',
        'price_rounding_step',
        'express_price_rounding_step',
        'driver_amortization_max',
        'fastfood_margin',
        'fastfood_margin_tier_2_min_brut',
        'fastfood_margin_tier_2_margin',
        'fastfood_min_covered_course'
      )
    ON CONFLICT (key) DO NOTHING;

    INSERT INTO settings_delivery (key, value, description, updated_at)
      SELECT key, value, description, updated_at FROM settings
      WHERE key IN (
        'delivery_free_mode',
        'platform_free_delivery_min_items_bonus',
        'platform_free_delivery_min_items_campaign'
      )
    ON CONFLICT (key) DO NOTHING;

    INSERT INTO settings_withdrawal (key, value, description, updated_at)
      SELECT key, value, description, updated_at FROM settings
      WHERE key LIKE 'withdrawal\_fee\_%'
    ON CONFLICT (key) DO NOTHING;

    INSERT INTO settings_deployment (key, value, description, updated_at)
      SELECT key, value, description, updated_at FROM settings
      WHERE key IN (
        'platform_min_app_version',
        'platform_latest_app_version',
        'apple_review_mode',
        'apple_version_review_mode'
      )
    ON CONFLICT (key) DO NOTHING;

  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Valeurs par défaut
-- ----------------------------------------------------------------------------
-- Complètent ce que l'étape 2 n'a pas repris : environnement neuf, ou clé
-- jamais créée (les réglages OTP, introduits par cette migration).

-- AUTH — authentification par numéro de téléphone (Bird Verify).
-- Le cooldown est le levier direct sur la FACTURE Bird : chaque envoi est
-- payant, et sans ce verrou un « renvoyer » cliqué en rafale se facture autant
-- de fois. Il doit pouvoir se durcir à chaud, sans redéployer.
INSERT INTO settings_auth (key, value, description) VALUES
  ('otp_resend_cooldown_seconds', '60'::jsonb,
   'Delai minimum entre deux demandes de code pour un meme numero (secondes). Chaque envoi est facture par Bird.'),
  ('otp_expires_in_seconds', '600'::jsonb,
   'Duree de validite annoncee au frontend (secondes), pour le compte a rebours. Bird gere l''expiration reelle.'),
  ('otp_default_country_code', '"237"'::jsonb,
   'Indicatif ajoute aux numeros saisis sans prefixe, avant normalisation E.164.'),
  ('otp_bird_timeout_ms', '15000'::jsonb,
   'Timeout des appels HTTP vers la plateforme Bird (millisecondes).')
ON CONFLICT (key) DO NOTHING;

-- PRICING — composition des prix et marges.
INSERT INTO settings_pricing (key, value, description) VALUES
  ('platform_margin', '100'::jsonb,
   'Marge Yaammoo ajoutee au prix affiche de chaque plat (FCFA), en regime plateforme.'),
  ('payment_fee_percent', '5'::jsonb,
   'Frais du prestataire de paiement, en % du montant paye. Arrondi a l''entier SUPERIEUR. Ne revient pas a la plateforme.'),
  ('price_rounding_step', '0'::jsonb,
   'Pas d''arrondi du prix des plats (FCFA). 0 = aucun arrondi.'),
  ('express_price_rounding_step', '0'::jsonb,
   'Pas d''arrondi propre aux zones express. Toujours vers le HAUT, jamais d''amortissement. 0 = aucun arrondi.'),
  ('driver_amortization_max', '0'::jsonb,
   'Montant maximum de course qu''un surplus d''arrondi peut amortir (FCFA).'),
  ('fastfood_margin', '0'::jsonb,
   'Marge en regime FASTFOOD. Cle distincte de platform_margin : les deux regimes ne composent pas le prix de la meme facon.'),
  ('fastfood_margin_tier_2_min_brut', '0'::jsonb,
   'Prix BRUT a partir duquel la marge fastfood passe au palier 2. 0 = aucun palier.'),
  ('fastfood_margin_tier_2_margin', '0'::jsonb,
   'Marge appliquee au palier 2, en remplacement de fastfood_margin.'),
  ('fastfood_min_covered_course', '0'::jsonb,
   'Course qu''un plat doit pouvoir couvrir seul via son surplus d''arrondi. Sert a REFUSER les prix de menu trop justes. 0 = aucune exigence.')
ON CONFLICT (key) DO NOTHING;

-- DELIVERY — livraison offerte et ses seuils.
INSERT INTO settings_delivery (key, value, description) VALUES
  ('delivery_free_mode', 'false'::jsonb,
   'Campagne « livraison offerte » globale. Les prix restent affiches normalement : seul deliveryOffer.reason = campaign change.'),
  ('platform_free_delivery_min_items_bonus', '1'::jsonb,
   'Plats minimum sur un depart pour qu''un bonus nominatif de livraison offerte s''applique (regime plateforme).'),
  ('platform_free_delivery_min_items_campaign', '1'::jsonb,
   'Plats minimum sur un depart pour qu''une campagne de livraison offerte s''applique (regime plateforme).')
ON CONFLICT (key) DO NOTHING;

-- WITHDRAWAL — barèmes de frais de retrait. Un jeu de clés par opérateur : les
-- valeurs sont identiques aujourd'hui, mais un opérateur qui change son barème
-- ne doit pas entraîner l'autre.
INSERT INTO settings_withdrawal (key, value, description) VALUES
  ('withdrawal_fee_mtn_threshold', '0'::jsonb,    'MTN : montant en dessous duquel le frais forfaitaire s''applique.'),
  ('withdrawal_fee_mtn_flat', '0'::jsonb,         'MTN : frais forfaitaire sous le seuil (FCFA).'),
  ('withdrawal_fee_mtn_percent', '0'::jsonb,      'MTN : frais en % au-dessus du seuil.'),
  ('withdrawal_fee_mtn_addend', '0'::jsonb,       'MTN : montant fixe ajoute au frais en pourcentage (FCFA).'),
  ('withdrawal_fee_orange_threshold', '0'::jsonb, 'Orange : montant en dessous duquel le frais forfaitaire s''applique.'),
  ('withdrawal_fee_orange_flat', '0'::jsonb,      'Orange : frais forfaitaire sous le seuil (FCFA).'),
  ('withdrawal_fee_orange_percent', '0'::jsonb,   'Orange : frais en % au-dessus du seuil.'),
  ('withdrawal_fee_orange_addend', '0'::jsonb,    'Orange : montant fixe ajoute au frais en pourcentage (FCFA).')
ON CONFLICT (key) DO NOTHING;

-- DEPLOYMENT — versions d'app et Apple Review.
INSERT INTO settings_deployment (key, value, description) VALUES
  ('platform_min_app_version', '"1.0.0"'::jsonb,
   'Version minimale requise pour utiliser l''app. En dessous : ecran de mise a jour forcee, non fermable.'),
  ('platform_latest_app_version', '"1.0.0"'::jsonb,
   'Derniere version publiee sur les stores. Affichee dans l''ecran de mise a jour non bloquante.'),
  ('apple_review_mode', 'false'::jsonb,
   'Mode Apple Review global. Expose au frontend par GET /fastFood/all (appleReviewMode).'),
  ('apple_version_review_mode', '""'::jsonb,
   'Version d''app exacte en cours de review App Store. POST /transaction bypasse le paiement seulement si le header x-app-version est identique. Vide = aucune version en review.')
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. Suppression de l'ancienne table
-- ----------------------------------------------------------------------------
-- Les valeurs ont été reprises à l'étape 2. Garder `settings` en place
-- laisserait deux états possibles en base et un doute permanent sur la source
-- de vérité : on la supprime.
DROP TABLE IF EXISTS settings;
