const { uploadImageToSupabase, deleteImageFromSupabase } = require('../../services/images/uploadImage.service');

exports.handleUpload = async (req, res) => {
  try {
    // console.log('upload appeler', req.file);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const imageUrl = await uploadImageToSupabase(req.file);
    res.status(200).json({ message: 'photo uploader avec succès.', data: imageUrl });
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
