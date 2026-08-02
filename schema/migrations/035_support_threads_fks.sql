-- 035_support_threads_fks.sql
-- Ajoute les cles etrangeres manquantes sur support_threads.
-- Sans elles, PostgREST refuse les jointures imbriquees du repository
-- (erreur PGRST200 "Could not find a relationship ... in the schema cache").
-- La migration 034 avait cree la table sans REFERENCES.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_threads_user_id_fkey'
  ) THEN
    ALTER TABLE support_threads
      ADD CONSTRAINT support_threads_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_threads_fastfood_id_fkey'
  ) THEN
    ALTER TABLE support_threads
      ADD CONSTRAINT support_threads_fastfood_id_fkey
      FOREIGN KEY (fastfood_id) REFERENCES fastfoods(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Recharge le cache de schema de PostgREST (sinon la jointure reste en echec).
NOTIFY pgrst, 'reload schema';
