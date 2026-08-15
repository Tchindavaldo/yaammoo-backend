// ============================================================================
// uploadFileToSupabase — Upload générique vers Supabase Storage
// ============================================================================
// Généralisation de `images/uploadImage.service` : même bucket, même mécanique,
// mais le dossier est paramétrable et le type MIME libre (les preuves de bonus
// sont des VIDÉOS, pas des images).
// ============================================================================
const { v4: uuidv4 } = require('uuid');

/**
 * @param {Object} file   fichier multer (memoryStorage : buffer + mimetype)
 * @param {string} folder dossier de destination dans le bucket (ex. 'bonusProofs')
 * @returns {Promise<string>} URL publique
 */
exports.uploadFileToSupabase = async (file, folder) => {
  if (!file) throw new Error('Aucun fichier fourni');
  if (!folder) throw new Error('Dossier de destination requis');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  const bucketName = process.env.SUPABASE_BUCKET || 'public';

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Variables d'environnement Supabase manquantes (SUPABASE_URL, SUPABASE_KEY)");
  }

  const safeName = String(file.originalname || 'file').replace(/[^a-zA-Z0-9.\-_]/g, '');
  const fileName = `${folder}/${uuidv4()}_${safeName}`;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucketName}/${fileName}`;

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

  return `${supabaseUrl}/storage/v1/object/public/${bucketName}/${fileName}`;
};
