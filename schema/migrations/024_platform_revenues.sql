-- ============================================================================
-- 024_platform_revenues.sql
-- ============================================================================
-- GRAND LIVRE des revenus de la plateforme — posé dès maintenant comme socle,
-- **volontairement pas encore alimenté**.
--
-- Pourquoi le créer avant d'en avoir besoin : la marge ne viendra pas que des
-- commandes (flyers, mise en avant d'une boutique, abonnements…). Ces recettes
-- n'ont pas d'`order_id` et ne peuvent donc pas entrer dans
-- `order_settlements`, dont la clé primaire EST `order_id`. Avoir la forme
-- cible écrite évite qu'une future source de revenu soit greffée de travers
-- dans une table qui ne lui convient pas.
--
--   order_settlements → le détail d'UNE commande, source de vérité
--   platform_revenues → l'agrégat de TOUTES les sources, quelle qu'en soit
--                       l'origine
--
-- Les règlements de commandes viendront s'y déverser (`source_type = 'order'`,
-- `source_id = order_id`) le jour où une seconde source existera. Tant qu'il n'y
-- a que les commandes, interroger `order_settlements` directement reste plus
-- simple et plus sûr.
--
-- ⚠️ Aucun code n'écrit dans cette table à ce jour. C'est intentionnel.
--
-- Idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_revenues (
  id            TEXT PRIMARY KEY,

  -- D'où vient la recette. Volontairement TEXT + CHECK plutôt qu'un ENUM :
  -- ajouter une source ne doit pas demander de migration de type.
  source_type   TEXT NOT NULL,
  -- Identifiant dans la table d'origine (order_id, flyer_id…). Pas de clé
  -- étrangère : la cible dépend de `source_type`.
  source_id     TEXT,

  -- Contreparties, quand elles existent.
  fastfood_id   TEXT,
  user_id       TEXT,

  -- Montant total encaissé pour cette ligne.
  gross_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Ce qui revient réellement à la plateforme. Jamais négatif : une gratuité
  -- fait renoncer à un gain, elle ne crée pas une dépense.
  platform_margin NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Frais du prestataire de paiement, CONTENUS dans gross_amount.
  payment_fee   NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Date de l'événement économique, distincte de la date d'écriture : une
  -- reprise d'historique ne doit pas fausser les agrégats mensuels.
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),

  -- Détail propre à chaque source (durée d'un abonnement, zone d'un flyer…).
  metadata      JSONB DEFAULT '{}'::jsonb,

  CONSTRAINT platform_revenues_source_type_chk
    CHECK (source_type IN ('order', 'flyer', 'subscription', 'promotion', 'other')),
  CONSTRAINT platform_revenues_margin_chk CHECK (platform_margin >= 0)
);

-- Une source ne doit être comptabilisée qu'une fois.
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_revenues_source
  ON platform_revenues(source_type, source_id) WHERE source_id IS NOT NULL;

-- Agrégats attendus : par période, et par boutique.
CREATE INDEX IF NOT EXISTS idx_platform_revenues_occurred
  ON platform_revenues(occurred_at);

CREATE INDEX IF NOT EXISTS idx_platform_revenues_fastfood
  ON platform_revenues(fastfood_id, occurred_at) WHERE fastfood_id IS NOT NULL;
