const { getIO } = require('../../socket');
const { deleteMenuService } = require('../../services/menu/deleteMenu.service');

exports.deleteMenuController = async (req, res) => {
  try {
    const menuId = req.params.menuId;
    const result = await deleteMenuService(menuId);
    res.status(result.success ? 200 : 400).json({ message: result.message, data: result.data, success: result.success });
  } catch (error) {
    console.error('Erreur suppression menu:', error);
    res.status(error.code || 500).json({ message: error.message || 'Erreur serveur lors de la suppression du menu' });
  }
};
