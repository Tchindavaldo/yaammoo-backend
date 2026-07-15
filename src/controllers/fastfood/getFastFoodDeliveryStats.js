const { getFastFoodDeliveryStats } = require('../../services/fastfood/getFastFoodDeliveryStats.service');

// GET /fastFood/:fastFoodId/delivery-stats (protégé firebaseAuth)
// Stats de livraison self du fastFood, adaptées au demandeur (self | client).
exports.getFastFoodDeliveryStatsController = async (req, res) => {
  try {
    const { fastFoodId } = req.params;
    const viewerUid = req.user?.uid;
    const result = await getFastFoodDeliveryStats(fastFoodId, viewerUid);
    if (!result.success) {
      return res.status(result.code || 400).json({ success: false, message: result.message });
    }
    return res.status(200).json({ success: true, scope: result.scope, data: result.data });
  } catch (error) {
    console.error('Erreur stats livraison fastFood :', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};
