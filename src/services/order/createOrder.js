const { db } = require('../../config/firebase');
const { postTransactionService } = require('../transaction/postTransaction.service');

exports.createOrderService = async order => {
  const orderData = { ...order, createdAt: new Date().toISOString() };
  
  if (order.status === 'pending') {
    const deliveryDate = order.delivery?.date || new Date().toISOString().split('T')[0];
    const pendingSnapshot = await db.collection('orders')
      .where('fastFoodId', '==', order.fastFoodId)
      .where('status', 'in', ['pending', 'processing'])
      .where('delivery.date', '==', deliveryDate)
      .get();
    orderData.rank = pendingSnapshot.size + 1;
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

  const transactionResult = await postTransactionService(transaction);

  return { id: orderRef.id, ...orderData };
};
