const { updateFastFoodService } = require('../../services/fastfood/updateFastFood');

exports.updateFastfoodController = async (req, res) => {
  try {
    const { fastFoodId } = req.params;

    if (!fastFoodId) {
      return res.status(400).json({
        success: false,
        message: 'ID du fastfood requis.'
      });
    }

    const data = await updateFastFoodService(fastFoodId, req.body);

    res.status(200).json({
      success: true,
      data,
      message: 'Fastfood mis à jour avec succès.'
    });
  } catch (error) {
    const statusCode = error.code || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Erreur serveur lors de la mise à jour du fastfood.',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};
