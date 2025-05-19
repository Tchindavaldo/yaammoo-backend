const { getIO } = require('../../socket');
const { createOrderService } = require('../../services/order/createOrder');
const { getFastFoodService } = require('../../services/fastfood/getFastFood');
const { validateOrder } = require('../../utils/validator/validateOrder');

exports.createOrder = async (req, res) => {
  try {
    const io = getIO();
    const { fastFoodId, userId, status } = req.body;

    const errors = validateOrder(req.body);
    if (errors.length > 0) {
      return res.status(400).json({
        code: 400,
        message: errors,
      });
    }

    const fastfood = await getFastFoodService(fastFoodId);
    const orderData = await createOrderService({ ...req.body, status: status || 'pendingToBuy' });

    io.to(userId).emit('newUserOrder', { message: 'Nouvelle commande user  ajoutée', data: orderData });
    if (orderData.status !== 'pendingToBuy') io.to(fastfood.userId).emit('newFastFoodOrder', { message: 'Nouvelle commande fastfood ajoutée', data: orderData });
    res.status(201).json({ message: 'Commande ajoutée avec succès.', data: orderData });
  } catch (error) {
    // console.error('Erreur ajout commande :', error);
    res.status(error.statusCode || 500).json({ message: error.message || "Erreur serveur lors de l'ajout de la commande." });
  }
};

// const socketsInRoom = await io.in(userId).fetchSockets();
// if (socketsInRoom.length > 0) {
//   console.log(
//     'Sockets dans la room:',
//     socketsInRoom.map(s => s.id)
//   );
// } else {
//   console.log('Aucun socket trouvé pour cet userId:', fastfood.userId);
// }
