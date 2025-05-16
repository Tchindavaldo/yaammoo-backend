const { db } = require('../../config/firebase');

exports.getBonusRequestService = async (data, id) => {
  try {
    if (data === undefined && id) {
      const doc = await db.collection('bonusRequest').doc(id).get();
      if (!doc.exists) return { found: false };
      return { found: true, data: { id: doc.id, ...doc.data() } };
    }

    if (id === undefined && data) {
      const { bonusId, userId, bonusType } = data;
      const snapshot = await db.collection('bonusRequest').where('bonusId', '==', bonusId).where('userId', '==', userId).where('bonusType', '==', bonusType).limit(1).get();
      if (snapshot.empty) return { found: false };

      const doc = snapshot.docs[0];
      return { found: true, data: { id: doc.id, ...doc.data() } };
    }

    return { found: false, error: 'Aucun paramètre valide fourni.' };
  } catch (error) {
    console.error('Erreur dans getBonusRequestService:', error);
    return { found: false, error: error.message };
  }
};
