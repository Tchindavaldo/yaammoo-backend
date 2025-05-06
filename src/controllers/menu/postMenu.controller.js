const { getIO } = require('../../socket');
const { postMenuService } = require('../../services/menu/postMenu.service');

exports.postMenuController = async (req, res) => {
  try {
    const io = getIO();
    const menuData = await postMenuService(req.body);

    io.to(menuData.fastFoodId).emit('newMenu', { message: 'Nouveau menu ajoutée', data: menuData });
    res.status(201).json({ message: 'menu ajoutée avec succès.', data: menuData });
  } catch (error) {
    console.error('Erreur ajout menu :', error);
    res.status(error.statusCode || 500).json({ message: error.message || "Erreur serveur lors de l'ajout de la menu." });
  }
};
