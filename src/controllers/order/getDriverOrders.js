const { getDriverOrders } = require('../../services/order/driverOrders.service');

exports.getDriverOrders = async (req, res) => {
  try {
    const { driverId } = req.params;
    if (!driverId) return res.status(400).json({ success: false, message: 'driverId requis.' });

    const orders = await getDriverOrders(driverId);
    return res.status(200).json({ success: true, message: 'Commandes du livreur récupérées avec succès.', data: orders });
  } catch (error) {
    console.error('Erreur récupération commandes livreur :', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur lors de la récupération des commandes du livreur.', error: error.message });
  }
};
