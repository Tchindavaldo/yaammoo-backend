-- 095 : qualite du representant en texte libre (suggestions gerant / directeur /
-- proprietaire dans l'app, ou toute autre valeur : manager...). Le formulaire
-- d'adhesion est rempli apres la creation de la boutique (bottom sheet).
ALTER TABLE merchant_adhesions DROP CONSTRAINT IF EXISTS merchant_adhesions_representative_role_check;
