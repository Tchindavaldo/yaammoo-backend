const { db } = require('../../../config/firebase');
const { flattenNotifications } = require('../../../utils/flattenNotifications');

exports.getNotificationsService = async (userId, fastFoodId) => {
  try {
    let allNotif;

    if (!userId) return { success: false, message: 'userId est requis' };
    const userNotifsSnap = await db.collection('notification').where('target', '==', 'all').orderBy('updatedAt', 'desc').get();
    const allNotifsSnap = await db.collection('notification').where('userId', '==', userId).orderBy('updatedAt', 'desc').get();

    allNotif = [...userNotifsSnap.docs.map(doc => ({ idGroup: doc.id, ...doc.data() })), ...allNotifsSnap.docs.map(doc => ({ idGroup: doc.id, ...doc.data() }))];
    allNotif.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    if (fastFoodId !== undefined) allNotif = allNotif.filter(doc => doc.fastFoodId !== fastFoodId);
    const finalData = flattenNotifications(allNotif);

    return { success: true, data: finalData, message: 'notifications récupérées avec succès' };
  } catch (error) {
    console.error('Erreur dans getNotifications services:', error);
    return { success: false, message: error.message };
  }
};
