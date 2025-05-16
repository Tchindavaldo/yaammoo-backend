const { admin, db } = require('../../config/firebase');
const { getBonusRequestService } = require('./getBonusRequest.service');

exports.getBonusRequestStatus = async (id, totalBonus) => {
  try {
    const response = await getBonusRequestService(undefined, id);

    if (!response.found) {
      return {
        success: false,
        message: "Vous n'avez pas encore soumis une demande de bonus pour ce bonus.",
      };
    }

    const existingStatusArray = response.data.status || [];

    const matchedBonus = existingStatusArray.find(entry => entry.totalBonus === totalBonus);

    if (!matchedBonus) {
      return {
        success: false,
        message: "Vous n'avez pas de bonus correspondant à cette demande de bonus.",
      };
    }

    if (matchedBonus.status === 'pending') {
      return {
        success: true,
        message: 'Demande de bonus en attente.',
      };
    }

    if (matchedBonus.status === 'completed') {
      return {
        success: true,
        message: 'Bonus déjà attribuée.',
      };
    }

    // Si le status est autre que "pending" ou "completed"
    return {
      success: false,
      message: `État de la demande inconnu : ${matchedBonus.status}`,
    };
  } catch (error) {
    console.error('Erreur dans getBonusRequestStatus:', error);
    return {
      success: false,
      message: 'Erreur serveur',
      error: error.message || error,
    };
  }
};
