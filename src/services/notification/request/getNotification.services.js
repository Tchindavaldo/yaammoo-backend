const { db } = require('../../../config/firebase');

exports.getNotificationService = async (userId, fastFoodId) => {
  try {
    let snapshot;
    let allNotif;

    if (!userId && !fastFoodId) return { success: false, message: 'userId ou fastFoodId est requis' };
    if (userId && fastFoodId) return { success: false, message: 'userId et fastFoodId forunir' };
    if (userId && !fastFoodId) snapshot = await db.collection('notification').where('userId', '==', userId).limit(1).get();
    if (!userId && fastFoodId) snapshot = await db.collection('notification').where('fastFoodId', '==', fastFoodId).limit(1).get();

    allNotif = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return { success: true, data: allNotif, message: 'notifications récupérées avec succès' };
  } catch (error) {
    console.error('Erreur dans getNotification services:', error);
    return { success: false, message: error.message };
  }
};
