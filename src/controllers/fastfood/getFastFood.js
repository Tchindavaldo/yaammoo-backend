const { getFastFoodService } = require('../../services/fastfood/getFastFood');

exports.getfastfood = async (req, res) => {
  try {
    const { fastFoodId } = req.params;
    if (!fastFoodId) return res.status(400).json({ success: false, message: 'ID du fastfood requis.' });

    const orders = await getFastFoodService(fastFoodId);
    return res.status(200).json({ success: true, message: 'fastfood récupérées avec succès.', data: orders });
  } catch (error) {
    console.error('Erreur récupération fastfood :', error);
    return res.status(error.message === 'Fastfood non trouvé' ? 404 : 500).json({
      success: false,
      message: error.message === 'Fastfood non trouvé' ? "Le fastfood spécifié n'existe pas." : 'Erreur serveur lors de la récupération des fastfood.',
      ...(error.message !== 'Fastfood non trouvé' && {
        error: error.message,
      }),
    });
  }
};
