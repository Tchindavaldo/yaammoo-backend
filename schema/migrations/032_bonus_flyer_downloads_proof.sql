-- ============================================================================
-- 032 — bonus_flyer_downloads : marquer la preuve au lieu de purger la ligne
-- ============================================================================
-- Jusqu'ici, un claim `status_view` SUPPRIMAIT la ligne de téléchargement pour
-- que le cycle suivant exige un nouveau retrait. Conséquence : plus aucune trace
-- de ce que le user avait téléchargé ni de la preuve envoyée, et impossible de
-- rejouer un test sans re-télécharger.
--
-- On conserve désormais la ligne et on la MARQUE : `proof_uploaded_at` porte la
-- date du claim, `proof_video_url` la preuve envoyée. Le claim se base sur ce
-- marqueur (et non sur l'absence de ligne) pour refuser une seconde réclamation
-- sur le même téléchargement.
--
-- Remettre `proof_uploaded_at` à NULL rouvre l'upload pour ce téléchargement —
-- c'est le geste de test voulu.
-- ============================================================================

ALTER TABLE bonus_flyer_downloads
  ADD COLUMN IF NOT EXISTS proof_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proof_video_url   TEXT;

-- Retrouver rapidement les téléchargements encore « ouverts » (preuve non
-- envoyée) d'un user : c'est la lecture faite à chaque claim.
CREATE INDEX IF NOT EXISTS idx_bonus_flyer_downloads_open
  ON bonus_flyer_downloads (user_id, bonus_id)
  WHERE proof_uploaded_at IS NULL;

COMMENT ON COLUMN bonus_flyer_downloads.proof_uploaded_at IS
  'Date du claim ayant consommé ce téléchargement. NULL = preuve pas encore envoyée, upload possible.';
COMMENT ON COLUMN bonus_flyer_downloads.proof_video_url IS
  'URL de la vidéo preuve envoyée lors du claim (miroir de status[].proofVideoUrl).';
