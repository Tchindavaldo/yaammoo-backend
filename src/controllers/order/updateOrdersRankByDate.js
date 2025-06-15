const { updateOrdersRankByDate } = require('../../services/order/updateOrdersRankByDate.service');

/**
 * Met à jour le rang des commandes en fonction de leur date de création
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.updateOrdersRankByDate = async (req, res) => {
  try {
    const { fastFoodId } = req.params;

    const result = await updateOrdersRankByDate(fastFoodId);

    if (!result.success) {
      return res.status(400).json({
        code: 400,
        message: result.message,
      });
    }

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour des rangs:', error);
    res.status(500).json({
      message: error.message || 'Erreur serveur lors de la mise à jour des rangs.',
    });
  }
};
