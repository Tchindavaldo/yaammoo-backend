const { rateDriver, getDriverRatings } = require('../../services/rating/rateDriver.service');

// POST /driver/:driverId/rating  (protégé firebaseAuth)
exports.rateDriverController = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { orderId, value, comment } = req.body || {};
    const userId = req.user?.uid;
    const result = await rateDriver({ driverId, userId, orderId, value, comment });
    if (!result.success) {
      return res.status(result.code || 400).json({ success: false, message: result.message });
    }
    res.status(200).json({ success: true, message: result.message, data: result.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Erreur lors de la notation du livreur' });
  }
};

// GET /driver/:driverId/ratings  (public)
exports.getDriverRatingsController = async (req, res) => {
  try {
    const result = await getDriverRatings(req.params.driverId);
    if (!result.success) {
      return res.status(result.code || 400).json({ success: false, message: result.message });
    }
    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Erreur lors de la récupération des avis' });
  }
};
