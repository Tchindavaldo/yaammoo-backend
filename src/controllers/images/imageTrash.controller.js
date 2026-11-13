// Corbeille d'images (admin) — migration 071. Voir architecture/images.md.
const { listImageTrash, restoreImage } = require('../../services/images/imageTrash.service');

exports.listImageTrashController = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: await listImageTrash() });
  } catch (error) {
    console.error('listImageTrash:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.restoreImageController = async (req, res) => {
  try {
    const result = await restoreImage(req.params.id);
    if (result.status !== 200) return res.status(result.status).json({ success: false, message: result.message });
    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    console.error('restoreImage:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
