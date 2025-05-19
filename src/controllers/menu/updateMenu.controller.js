const { updateMenuService } = require('../../services/menu/updateMenu.service');

exports.updateMenuController = async (req, res) => {
  try {
    const menuId = req.params.menuId;
    const updateData = req.body;

    const result = await updateMenuService(menuId, updateData);

    res.status(result.success ? 200 : 400).json({
      message: result.message,
      data: result.data,
      success: result.success,
    });
  } catch (error) {
    console.error('Erreur mise à jour menu:', error);
    res.status(error.code || 500).json({
      message: error.message || 'Erreur serveur lors de la mise à jour du menu',
      success: false,
    });
  }
};
