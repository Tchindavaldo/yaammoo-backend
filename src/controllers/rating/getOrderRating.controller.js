const { getOrderRating } = require('../../services/rating/getOrderRating.service');

// GET /rating/order/:orderId  (protégé firebaseAuth)
exports.getOrderRatingController = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user?.uid;
    const result = await getOrderRating({ orderId, userId });
    if (!result.success) {
      return res.status(result.code || 400).json({ success: false, message: result.message });
    }
    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Erreur lors de la récupération de la note' });
  }
};
