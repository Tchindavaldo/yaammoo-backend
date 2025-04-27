const { db } = require('../../config/firebase');

exports.createOrderService = async order => {
  const orderData = { ...order, createdAt: new Date().toISOString() };
  const orderRef = await db.collection('orders').add(orderData);
  return { id: orderRef.id, ...orderData };
};
