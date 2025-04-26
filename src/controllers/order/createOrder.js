const { createOrderService } = require('../../services/order/createOrder');
const { getIO } = require('../../socket');

exports.createOrder = async (req, res) => {
  try {
    const io = getIO();
    const { fastfoodId } = req.params;
    const { clientName, items, total, status } = req.body;

    if (!clientName || !items || !Array.isArray(items) || !total) {
      return res.status(400).json({
        message: 'Données de commande invalides.',
      });
    }

    const orderData = await createOrderService({ clientName, items, total, status: status || 'pending' });

    io.to(fastfoodId).emit('newOrder', { message: 'Nouvelle commande ajoutée', data: orderData });

    res.status(201).json({
      message: 'Commande ajoutée avec succès.',

      data: orderData,
    });
  } catch (error) {
    console.error('Erreur ajout commande :', error);
    res.status(500).json({
      message: "Erreur serveur lors de l'ajout de la commande.",
    });
  }
};
