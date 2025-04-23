const { db } = require('../../config/firebase');

exports.createOrderService = async (fastfoodId, order) => {
  const orderData = { ...order, createdAt: new Date() };
  const orderRef = await db.collection('fastfoods').doc(fastfoodId).collection('orders').add(orderData);
  return { id: orderRef.id, ...orderData };
};
