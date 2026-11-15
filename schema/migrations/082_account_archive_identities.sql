-- 082 : identites de connexion du compte supprime (email, telephone, sub Google/Apple).
-- Un compte recree apres suppression a un NOUVEL uid Firebase : la boutique
-- supprimee se retrouve par ces identites, quel que soit le mode de connexion.
ALTER TABLE account_archives ADD COLUMN IF NOT EXISTS identity_keys TEXT[] DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_account_archives_identity_keys ON account_archives USING GIN (identity_keys);

-- Compte peu actif (90 jours) : a l'echeance, seules les donnees PERSONNELLES
-- sont effacees ; commandes, transactions, reglements, retraits restent 10 ans
-- (CGU). personal_purged = premiere etape faite, retain_until repousse a 10 ans.
ALTER TABLE account_archives ADD COLUMN IF NOT EXISTS personal_purged BOOLEAN DEFAULT FALSE;
