// controllers/order/updateOrder.js
const { updateOrderService } = require('../../services/order/updateOrder');
const { getIO } = require('../../socket');

exports.updateOrder = async (req, res) => {
  try {
    const io = getIO();
    const { id, fastfoodId } = req.body;
    const updateData = req.body;

    const updatedOrder = await updateOrderService(id, updateData);
    res.status(200).json({ message: 'success.', data: updatedOrder });
    io.to(fastfoodId).emit('updateOrder', { message: 'Nouvelle commande Modifier', data: updatedOrder });
  } catch (error) {
    console.error('Erreur mise à jour commande :', error.message);
    res.status(error.code || 500).json({
      message: error.message || 'Erreur serveur lors de la mise à jour de la commande.',
    });
  }
};
