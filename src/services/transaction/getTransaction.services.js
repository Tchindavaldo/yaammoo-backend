// services/transaction/getTransaction.services.js
const { db } = require('../../config/firebase');

exports.getTransactionService = async userId => {
  try {
    if (!userId) return { success: false, message: 'userId est requis' };
    let query = db.collection('transaction').where('userId', '==', userId);
    const transactionSnapshot = await query.orderBy('createdAt', 'desc').get();

    if (transactionSnapshot.empty) return { success: true, data: [], message: "La collection transaction n'existe pas" };
    const data = transactionSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return { success: true, data, message: 'transactions récupérées avec succès' };
  } catch (error) {
    return { success: false, message: error.message || 'Erreur lors de la récupération des transactions' };
  }
};

exports.getTransactionByIdService = async transactionId => {
  try {
    if (!transactionId) throw new Error('transactionId est requis');

    const transactionDoc = await db.collection('transaction').doc(transactionId).get();

    if (!transactionSnapshot.exists) return { success: true, data: [], message: "La collection transaction n'existe pas" };
    return { success: true, data: { id: transactionDoc.id, ...transactionDoc.data() }, message: 'transaction récupérée avec succès' };
  } catch (error) {
    return { success: false, message: error.message || 'Erreur lors de la récupération de la transaction' };
  }
};
