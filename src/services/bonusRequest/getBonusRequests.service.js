const { db } = require('../../config/firebase');

exports.getBonusRequestsService = async () => {
  try {
    const bonusCollection = await db.collection('bonus').get();
    if (bonusCollection.empty) throw new Error('collection bonus non trouvé');

    return bonusCollection.docs.map(doc => ({ ...doc.data(), id: doc.id }));
  } catch (error) {
    console.error('Erreur dans getBonusService:', error);
    throw new Error(error.message || 'Erreur lors de la récupération des bonus');
  }
};
