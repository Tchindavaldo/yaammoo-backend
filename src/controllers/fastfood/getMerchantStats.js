const { getMerchantStats } = require('../../services/fastfood/getMerchantStats.service');

// GET /fastFood/:fastFoodId/stats?from&to&bucket (firebaseAuth, proprietaire)
exports.getMerchantStatsController = async (req, res) => {
  try {
    const result = await getMerchantStats(req.params.fastFoodId, req.user?.uid, req.query || {});
    if (!result.success) return res.status(result.code || 400).json({ success: false, message: result.message });
    return res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    console.error('Erreur stats marchand :', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};
