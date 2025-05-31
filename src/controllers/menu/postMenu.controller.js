const { getIO } = require('../../socket');
const { postMenuService } = require('../../services/menu/postMenu.service');

exports.postMenuController = async (req, res) => {
  try {
    const io = getIO();
    const result = await postMenuService(req.body);

    if (!result.success) {
      return res.status(400).json({ message: result.message, success: false });
    }

    io.to(result.data.fastFoodId).emit('newMenu', { message: 'Nouveau menu ajouté', data: result.data });
    res.status(201).json({ message: result.message, data: result.data, success: true });
  } catch (error) {
    // console.error('Erreur ajout menu :', error);
    res.status(500).json({ message: error.message || "Erreur serveur lors de l'ajout du menu", success: false });
  }
};
