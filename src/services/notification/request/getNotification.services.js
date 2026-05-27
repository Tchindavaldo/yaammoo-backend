// ============================================================================
// getNotificationService — Façade vers l'orchestrateur
// ============================================================================
// Retourne le groupe de notifications (un seul) pour user OU fastfood.
// Le format est conservé : { success, data: [groupe] | [], message }
const repos = require('../../../repositories');

exports.getNotificationService = async (userId, fastFoodId) => {
  try {
    if (!userId && !fastFoodId) return { success: false, message: 'userId ou fastFoodId est requis' };
    if (userId && fastFoodId) return { success: false, message: 'userId et fastFoodId forunir' };

    let group;
    if (userId) group = await repos.notifications.getGroupForUser(userId);
    else group = await repos.notifications.getGroupForFastFood(fastFoodId);

    const data = group ? [group] : [];
    return { success: true, data, message: 'notifications récupérées avec succès' };
  } catch (error) {
    console.error('Erreur dans getNotification services:', error);
    return { success: false, message: error.message };
  }
};
