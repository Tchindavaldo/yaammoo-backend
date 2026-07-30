-- ============================================================================
-- 031_bonus_status_view_flyer.sql
-- ============================================================================
-- Bonus `criteria.kind = 'status_view'` : le user obtient le bonus en postant le
-- flyer Yaammoo en statut WhatsApp. Deux besoins nouveaux :
--
--   1. le bonus porte SON flyer (`flyer_url`) et SON délai d'attente
--      (`claim_delay_hours`) — pas d'env : modifiable à chaud via PATCH /bonus/:id,
--      sans redéploiement. 0 = claim instantané (cas de tous les autres bonus).
--   2. tracer QUAND le user a téléchargé le flyer, pour refuser un claim trop
--      précoce (le statut doit être resté posté `claim_delay_hours` heures).
--
-- Idempotent : rejouable sans effet de bord.
-- ============================================================================

ALTER TABLE bonus
  ADD COLUMN IF NOT EXISTS flyer_url         TEXT,
  ADD COLUMN IF NOT EXISTS claim_delay_hours INTEGER NOT NULL DEFAULT 0;

-- Un téléchargement de flyer par (user, bonus) : `downloaded_at` est le PREMIER
-- téléchargement du cycle en cours — c'est lui qui date le délai. Re-télécharger
-- ne remet pas le compteur à zéro (sinon le délai serait contournable dans
-- l'autre sens : on ne veut ni le raccourcir ni le rallonger par accident) ;
-- seul `last_downloaded_at` bouge. La ligne est supprimée à la réclamation :
-- le cycle suivant exige un nouveau téléchargement.
CREATE TABLE IF NOT EXISTS bonus_flyer_downloads (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT        NOT NULL,
  bonus_id           TEXT        NOT NULL,
  downloaded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  download_count     INTEGER     NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bonus_flyer_downloads_user_bonus_idx
  ON bonus_flyer_downloads (user_id, bonus_id);
