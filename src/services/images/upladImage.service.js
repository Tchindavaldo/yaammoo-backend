const { v4: uuidv4 } = require('uuid');

// Nous gardons le nom original de la fonction pour éviter de casser le contrôleur
exports.uploadImageToFirebase = async file => {
  if (!file) throw new Error('Aucun fichier fourni');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY; // Service role key ou anon key
  const bucketName = process.env.SUPABASE_BUCKET || 'public'; // 'public' par défaut ou nom du bucket

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Variables d\'environnement Supabase manquantes (SUPABASE_URL, SUPABASE_KEY)');
  }

  const fileName = `fastFood/${uuidv4()}_${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucketName}/${fileName}`;

  try {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
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
    console.error('Erreur lors de l\'envoi vers Supabase:', error);
    throw error;
  }
};
