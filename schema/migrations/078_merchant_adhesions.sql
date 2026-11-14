-- 078 : formulaire d'adhésion du Marchand (Annexe 3 des CGU).
-- Une ligne par boutique et par version acceptée : preuve de l'acceptation
-- (Conditions générales + Annexe 1) et informations figées au moment de la
-- validation de la création de la boutique.
CREATE TABLE IF NOT EXISTS merchant_adhesions (
  id                   BIGSERIAL PRIMARY KEY,
  fastfood_id          TEXT NOT NULL,
  user_id              TEXT NOT NULL,
  version              INTEGER NOT NULL REFERENCES legal_documents(version),
  representative_name  TEXT NOT NULL,
  representative_role  TEXT NOT NULL CHECK (representative_role IN ('gerant', 'directeur', 'proprietaire')),
  shop_name            TEXT NOT NULL,
  legal_name           TEXT,
  address              TEXT NOT NULL,
  sector               TEXT NOT NULL DEFAULT 'restauration et vente de produits alimentaires',
  app_version          TEXT,
  accepted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fastfood_id, version)
);
CREATE INDEX IF NOT EXISTS merchant_adhesions_user_idx ON merchant_adhesions (user_id);
ALTER TABLE merchant_adhesions ENABLE ROW LEVEL SECURITY;
