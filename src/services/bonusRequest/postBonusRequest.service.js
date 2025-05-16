const { admin, db } = require('../../config/firebase');
const { validateBonusRequest } = require('../../utils/validator/validateBonusRequest');
const sendPushNotification = require('../notification/FCM/sendPushNotification.service');
const { postNotificationService } = require('../notification/request/postNotification.service');
const { getBonusRequestService } = require('./getBonusRequest.service');

exports.postBonuRequestsService = async (data, totalBonus) => {
  try {
    const errors = validateBonusRequest(data);
    if (errors.length > 0) return { success: false, message: errors };
    const response = await getBonusRequestService(data, undefined);

    if (!response.found) {
      const bonusRequestData = { ...data, status: [{ status: 'pending', totalBonus, createdAt: new Date().toISOString() }] };
      const docRef = await db.collection('bonusRequest').add(bonusRequestData);
      const dataNotif = {
        data: {
          title: 'Bonus',
          body: 'votre demande de bonus a ete soumis avec success',
          type: 'Bonus',
        },
        token: data.fcmToken,
        userId: data.userId,
      };

      await postNotificationService(dataNotif);
      return { success: true, data: { id: docRef.id, ...bonusRequestData }, message: 'Bonus soumis avec success' };
    } else {
      const existingStatusArray = response.data.status || [];
      const bonusAlreadyRequested = existingStatusArray.some(entry => totalBonus <= entry.totalBonus);

      if (bonusAlreadyRequested) {
        return { success: false, message: 'Vous avez déjà soumis une demande pour ce bonus.' };
      }

      const newStatus = { status: 'pending', totalBonus, createdAt: new Date().toISOString() };
      const updatedStatusArray = [...existingStatusArray, newStatus];
      await db.collection('bonusRequest').doc(response.data.id).update({ status: updatedStatusArray });
      const dataNotif = {
        data: {
          title: 'Bonus',
          body: 'votre demande de bonus a ete soumis avec success',
          type: 'Bonus',
        },
        token: data.fcmToken,
        userId: data.userId,
      };

      await postNotificationService(dataNotif);
      return { success: true, data: { ...response.data, status: updatedStatusArray } };
    }
  } catch (error) {
    console.error('Erreur dans getBonusRequestService:', error);
    return { success: false, message: error };
  }
};

// io.emit('newbonus', { message: 'Nouveau bonus', data: docRef });
