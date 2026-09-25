const { uploadImageToSupabase, deleteImageFromSupabase } = require('../../services/images/uploadImage.service');
const { uploadFileToSupabase } = require('../../services/storage/uploadFile.service');
const { STORAGE_FOLDERS } = require('../../services/storage/storageFolders');

/**
 * Champ `folder` (multipart) = dossier de rangement dans le bucket, parmi
 * `STORAGE_FOLDERS`. Absent = ancien comportement (`fastFood/`) : les apps
 * deja publiees n'envoient pas ce champ.
 */
exports.handleUpload = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const folder = req.body?.folder;
    if (folder && !STORAGE_FOLDERS.includes(folder)) {
      return res.status(400).json({ message: `Dossier inconnu: ${folder}` });
    }
    const imageUrl = folder
      ? await uploadFileToSupabase(req.file, folder)
      : await uploadImageToSupabase(req.file);
    res.status(200).json({ message: 'fichier uploade avec succes.', data: imageUrl });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** DELETE — supprime une image du storage (à partir de son URL publique). */
exports.handleDelete = async (req, res) => {
  try {
    const url = req.body?.url || req.query?.url;
    if (!url) return res.status(400).json({ success: false, message: "Champ `url` requis." });
    await deleteImageFromSupabase(url);
    res.status(200).json({ success: true, message: "Image supprimée avec succès." });
  } catch (error) {
    console.error("Erreur suppression image:", error.message);
    res.status(500).json({ success: false, message: error.message || "Erreur serveur." });
  }
};
