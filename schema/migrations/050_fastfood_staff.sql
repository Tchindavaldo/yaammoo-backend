-- 050_fastfood_staff.sql
-- Employés d'une boutique et leurs rôles (permissions).
--
-- staff_roles   : rôle PROPRE à une boutique (ex. « Caissier »), porteur d'une
--                 liste de permissions. Créé à la volée à la création d'un
--                 employé, réutilisable ensuite.
-- staff_members : un employé = un numéro de téléphone rattaché à une boutique
--                 avec un rôle. `user_id` est NULL tant que la personne ne s'est
--                 jamais connectée : il est posé à sa première connexion OTP.

CREATE TABLE IF NOT EXISTS staff_roles (
  id           TEXT PRIMARY KEY,
  fastfood_id  TEXT NOT NULL REFERENCES fastfoods(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  permissions  TEXT[] NOT NULL DEFAULT '{}',
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_roles_name ON staff_roles (fastfood_id, lower(name));

CREATE TABLE IF NOT EXISTS staff_members (
  id           TEXT PRIMARY KEY,
  fastfood_id  TEXT NOT NULL REFERENCES fastfoods(id) ON DELETE CASCADE,
  role_id      TEXT NOT NULL REFERENCES staff_roles(id) ON DELETE RESTRICT,
  phone_number TEXT NOT NULL,              -- E.164 (+237…)
  user_id      TEXT,                       -- NULL tant que jamais connecté
  nom          TEXT,
  prenom       TEXT,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_members_phone ON staff_members (fastfood_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_staff_members_user  ON staff_members (user_id);
CREATE INDEX IF NOT EXISTS idx_staff_members_phone ON staff_members (phone_number);

NOTIFY pgrst, 'reload schema';
