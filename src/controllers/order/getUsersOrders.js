const { getUserOrdersService } = require('../../services/order/getUserOrders');

exports.getUsersOrders = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ success: false, message: 'ID du user requis.' });

    const orders = await getUserOrdersService(userId);
    return res.status(200).json({ success: true, message: 'Commandes récupérées avec succès.', data: orders });
  } catch (error) {
    console.error('Erreur récupération commandes :', error);
    return res.status(error.message === 'user non trouvé' ? 404 : 500).json({
      success: false,
      message: error.message === 'user non trouvé' ? "Le user spécifié n'existe pas." : 'Erreur serveur lors de la récupération des commandes.',
      ...(error.message !== 'user non trouvé' && {
        error: error.message,
      }),
    });
  }
};
