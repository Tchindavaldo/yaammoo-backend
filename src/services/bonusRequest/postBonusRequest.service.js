// ============================================================================
// postBonuRequestsService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { validateBonusRequest } = require('../../utils/validator/validateBonusRequest');
const { postNotificationService } = require('../notification/request/postNotification.service');
const { getBonusRequestService } = require('./getBonusRequest.service');

exports.postBonuRequestsService = async (data, totalBonus) => {
  try {
    const errors = validateBonusRequest(data);
    if (errors.length > 0) return { success: false, message: errors };

    const response = await getBonusRequestService(data, undefined);

    const buildNotif = async () => {
      const user = await repos.users.getUserByIdSafe(data.userId);
      const { fcm, apns } = user ? repos.users.collectUserTokens(user) : { fcm: [], apns: [] };
      return {
        data: {
          title: 'Bonus',
          body: 'votre demande de bonus a ete soumis avec success',
          type: 'Bonus',
        },
        tokens: fcm,
        apnsTokens: apns,
        userId: data.userId,
      };
    };

    if (!response.found) {
      const created = await repos.bonusRequests.create({
        ...data,
        status: [{ status: 'pending', totalBonus, createdAt: new Date().toISOString() }],
      });
      await postNotificationService(await buildNotif());
      return { success: true, data: created, message: 'Bonus soumis avec success' };
    }

    const existingStatusArray = response.data.status || [];
    const bonusAlreadyRequested = existingStatusArray.some((entry) => totalBonus <= entry.totalBonus);
    if (bonusAlreadyRequested) {
      return { success: false, message: 'Vous avez déjà soumis une demande pour ce bonus.' };
    }

    const newStatus = { status: 'pending', totalBonus, createdAt: new Date().toISOString() };
    const updatedStatusArray = [...existingStatusArray, newStatus];
    const updated = await repos.bonusRequests.updateStatus(response.data.id, updatedStatusArray);
    await postNotificationService(await buildNotif());
    return { success: true, data: updated };
  } catch (error) {
    console.error('Erreur dans postBonuRequestsService:', error);
    return { success: false, message: error.message || String(error) };
  }
};
