// controllers/order/updateOrder.js
const { updateOrders } = require('../../services/order/updateOrders.service');

exports.updateOrdersConstroller = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await updateOrders(req.body, userId);
    
    if (!result.success) {
      return res.status(400).json({ message: result.message, success: false });
    }
    
    res.status(200).json({ message: result.message, data: result.data, success: true });
  } catch (error) {
    // console.error('Erreur mise à jour commande :', error.message);
    res.status(500).json({
      message: error.message || 'Erreur serveur lors de la mise à jour de la commande.',
      success: false
    });
  }
};
