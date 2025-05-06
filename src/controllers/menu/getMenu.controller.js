const { getIO } = require('../../socket');
const { getMenuService } = require('../../services/menu/getMenu.services');

exports.getMenuController = async (req, res) => {
  try {
    const { fastFoodId } = req.params;
    const menuData = await getMenuService(fastFoodId);
    res.status(201).json({ message: 'menu recuperer avec succès.', data: menuData });
  } catch (error) {
    console.error('Erreur recupuration du menu :', error);
    res.status(error.statusCode || 500).json({ message: error.message || "Erreur serveur lors de l'recupuration du de la menu." });
  }
};
