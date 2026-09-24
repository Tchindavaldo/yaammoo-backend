-- 049_fastfood_open_days.sql
-- Jours d'ouverture + interrupteur de disponibilité manuel d'une boutique.
-- open_days : 0 = dimanche … 6 = samedi. Tableau vide = n'ouvre jamais
--             => boutique indisponible (calculé à la lecture, jamais stocké).
-- is_available : coupure MANUELLE par le marchand ; ne modifie pas open_days.

ALTER TABLE fastfoods
  ADD COLUMN IF NOT EXISTS open_days    SMALLINT[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  ADD COLUMN IF NOT EXISTS is_available BOOLEAN    NOT NULL DEFAULT true;
