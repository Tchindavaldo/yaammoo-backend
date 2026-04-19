const { db } = require('../../config/firebase');
const { postTransactionService } = require('../transaction/postTransaction.service');
const { reserveRank } = require('./rankQueue.service');

exports.createOrderService = async order => {
  const orderData = { ...order, createdAt: new Date().toISOString() };

  if (order.status === 'pending') {
    const deliveryDate = order.delivery?.date || new Date().toISOString().split('T')[0];
    orderData.rank = await reserveRank({
      fastFoodId: order.fastFoodId,
      deliveryDate,
      status: 'pending',
    });
  }

  const orderRef = await db.collection('orders').add(orderData);

  const transaction = {
    type: 'order',
    userId: order.userId,
    name: order.menu.name,
    amount: order.total,
    payBy: 'OM',
    currentAmount: 0,
  };

  await postTransactionService(transaction);

  return { id: orderRef.id, ...orderData };
};
