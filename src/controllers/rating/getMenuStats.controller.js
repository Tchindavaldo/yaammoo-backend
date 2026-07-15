const { getMenuStats } = require('../../services/rating/getMenuStats.service');

// GET /menu/:menuId/stats (protégé firebaseAuth)
// Stats de commande d'un plat, adaptées au demandeur (self | client).
exports.getMenuStatsController = async (req, res) => {
  try {
    const { menuId } = req.params;
    const viewerUid = req.user?.uid;
    const result = await getMenuStats(menuId, viewerUid);
    if (!result.success) {
      return res.status(result.code || 400).json({ success: false, message: result.message });
    }
    return res.status(200).json({ success: true, scope: result.scope, data: result.data });
  } catch (error) {
    console.error('Erreur stats plat :', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};
