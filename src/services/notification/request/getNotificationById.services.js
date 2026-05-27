// ============================================================================
// getNotificationByIdService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../../repositories');

exports.getNotificationByIdService = async (id) => {
  try {
    const doc = await repos.notifications.getById(id);
    if (!doc) return { success: false, message: 'Notification non trouvée' };
    return { success: true, data: doc, message: 'Notification récupérée avec succès' };
  } catch (error) {
    console.error('Erreur dans getNotificationByIdService:', error);
    return { success: false, message: error.message };
  }
};
