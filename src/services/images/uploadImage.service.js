const { v4: uuidv4 } = require('uuid');

exports.uploadImageToSupabase = async file => {
  if (!file) throw new Error('Aucun fichier fourni');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY; // Service role key ou anon key
  const bucketName = process.env.SUPABASE_BUCKET || 'public'; // 'public' par défaut ou nom du bucket

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Variables d'environnement Supabase manquantes (SUPABASE_URL, SUPABASE_KEY)");
  }

  const fileName = `fastFood/${uuidv4()}_${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucketName}/${fileName}`;

  try {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': file.mimetype,
      },
      body: file.buffer,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Supabase upload error:', errorText);
      throw new Error(`Échec de l'upload Supabase: ${response.statusText}`);
    }

    // On retourne l'URL publique de l'image
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${fileName}`;
    return publicUrl;
  } catch (error) {
    console.error("Erreur lors de l'envoi vers Supabase:", error);
    throw error;
  }
};

/**
 * Supprime une image du storage Supabase à partir de son URL publique.
 * L'URL publique a la forme `{supabaseUrl}/storage/v1/object/public/{bucket}/{...path}`.
 * On extrait le chemin complet (y compris le bucket) pour viser le bon objet.
 */
exports.deleteImageFromSupabase = async publicUrl => {
  if (!publicUrl) throw new Error("URL manquante.");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Variables d'environnement Supabase manquantes (SUPABASE_URL, SUPABASE_KEY)");
  }

  // Token public dans l'URL ("?token=") ? On le retire : il n'appartient pas au chemin objet.
  const cleanUrl = publicUrl.split('?')[0];
  const base = supabaseUrl + "/storage/v1/object/public/";
  if (!cleanUrl.startsWith(base)) {
    throw new Error("URL non reconnue comme image Supabase: " + publicUrl);
  }

  const objectPath = cleanUrl.slice(base.length);
  if (!objectPath) throw new Error("Chemin d'objet vide.");

  const deleteUrl = supabaseUrl + "/storage/v1/object/" + objectPath;
  try {
    const response = await fetch(deleteUrl, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + supabaseKey,
      },
    });
    if (!response.ok && response.status !== 404) {
      const errorText = await response.text();
      console.error("Supabase delete error:", errorText);
      throw new Error("Échec de la suppression Supabase: " + response.statusText);
    }
    return true;
  } catch (error) {
    console.error("Erreur lors de la suppression de l'image:", error);
    throw error;
  }
};
