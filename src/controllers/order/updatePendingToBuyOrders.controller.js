// controllers/order/updateOrder.js
const { updatePendingToBuyOrders } = require('../../services/order/updatePendingToBuyOrders.service');

exports.updatePendingToBuyOrdersConstroller = async (req, res) => {
  try {
    const updatedOrder = await updatePendingToBuyOrders(req.body);
    res.status(200).json({ message: 'success.', data: updatedOrder });
  } catch (error) {
    console.error('Erreur mise à jour commande :', error.message);
    res.status(error.code || 500).json({
      message: error.message || 'Erreur serveur lors de la mise à jour de la commande.',
    });
  }
};
