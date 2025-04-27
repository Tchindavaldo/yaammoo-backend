// services/order/updateOrder.js
const { db } = require('../../config/firebase');
const { validateOrderUpdate } = require('../../utils/validator/validateOrderUpdate');

exports.updateOrderService = async (orderId, updateData) => {
  const errors = validateOrderUpdate(updateData);
  if (errors.length > 0) {
    const formattedErrors = errors.map(err => `${err.field}: ${err.message}`).join(', ');
    const error = new Error(`Erreur de validation: ${formattedErrors}`);
    error.code = 400;
    throw error;
  }

  const orderRef = db.collection('orders').doc(orderId);
  const doc = await orderRef.get();

  if (!doc.exists) {
    const error = new Error('Commande non trouvée');
    error.code = 404;
    throw error;
  }

  await orderRef.update({ ...updateData, updatedAt: new Date().toISOString() });

  const updatedDoc = await orderRef.get();
  return { id: updatedDoc.id, ...updatedDoc.data() };
};
