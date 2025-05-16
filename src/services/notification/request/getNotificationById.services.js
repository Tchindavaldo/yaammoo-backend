const { db } = require('../../../config/firebase');

exports.getNotificationByIdService = async id => {
  try {
    const docRef = await db.collection('notification').doc(id).get();
    if (!docRef.exists) return { success: false, message: 'Notification non trouvée' };

    const doc = { id: docRef.id, ...docRef.data() };
    return { success: true, data: doc, message: 'Notification récupérée avec succès' };
  } catch (error) {
    console.error('Erreur dans getNotificationService:', error);
    return { success: false, message: error.message };
  }
};
