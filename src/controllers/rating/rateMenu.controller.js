const { rateMenu, getMenuRatings } = require('../../services/rating/rateMenu.service');

// POST /menu/:menuId/rating  (protégé firebaseAuth)
exports.rateMenuController = async (req, res) => {
  try {
    const { menuId } = req.params;
    const { orderId, value, comment } = req.body || {};
    const userId = req.user?.uid;
    const result = await rateMenu({ menuId, userId, orderId, value, comment });
    if (!result.success) {
      return res.status(result.code || 400).json({ success: false, message: result.message });
    }
    res.status(200).json({ success: true, message: result.message, data: result.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Erreur lors de la notation du plat' });
  }
};

// GET /menu/:menuId/ratings  (public)
exports.getMenuRatingsController = async (req, res) => {
  try {
    const result = await getMenuRatings(req.params.menuId);
    if (!result.success) {
      return res.status(result.code || 400).json({ success: false, message: result.message });
    }
    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Erreur lors de la récupération des avis' });
  }
};
