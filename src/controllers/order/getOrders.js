const { getOrdersService } = require('../../services/order/getOrders');

exports.getOrders = async (req, res) => {
  try {
    const { fastFoodId } = req.params;
    if (!fastFoodId) return res.status(400).json({ success: false, message: 'ID du fastfood requis.' });

    const orders = await getOrdersService(fastFoodId);
    return res.status(200).json({ success: true, message: 'Commandes récupérées avec succès.', data: orders });
  } catch (error) {
    console.error('Erreur récupération commandes :', error);
    return res.status(error.message === 'Fastfood non trouvé' ? 404 : 500).json({
      success: false,
      message: error.message === 'Fastfood non trouvé' ? "Le fastfood spécifié n'existe pas." : 'Erreur serveur lors de la récupération des commandes.',
      ...(error.message !== 'Fastfood non trouvé' && {
        error: error.message,
      }),
    });
  }
};
