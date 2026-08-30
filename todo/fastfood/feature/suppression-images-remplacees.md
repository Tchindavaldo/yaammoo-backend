# Suppression des images remplacées (Storage Supabase)

[ ] Supprimer l'ancienne image quand elle est remplacée — aujourd'hui
    l'upload d'une nouvelle image stocke la nouvelle URL mais **laisse
    l'ancienne dans le bucket** (accumulation de fichiers orphelins).
    - Cas 1 — **Menu** : à la création/édition (`postMenu.service.js`,
      `updateMenu.service.js`), quand `coverImage` / `images[]` changent,
      supprimer de Supabase Storage les fichiers remplacés (l'ancienne cover,
      les anciennes images de la galerie retirées de la liste).
    - Cas 2 — **Boutique (fastfood)** : quand une boutique upload une nouvelle
      image (`image`) ou bannière (`imageUrl`) pour remplacer l'actuelle,
      supprimer la précédente.
    - À faire : un utilitaire générique `deleteSupabaseFile(url)` (extraire le
      path depuis l'URL publique, bucket existant), appelé APRÈS écriture réussie
      de la nouvelle donnée en base — jamais avant (si l'update échoue,
      l'ancienne image doit rester valide). Échec de suppression = log warn,
      non bloquant.
    - ⚠️ Ne jamais supprimer un fichier encore référencé ailleurs (même URL dans
      un autre menu/boutique/order transporté) : comparer avant suppression.