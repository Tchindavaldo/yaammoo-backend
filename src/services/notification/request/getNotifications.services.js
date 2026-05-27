// ============================================================================
// getNotificationsService — Façade vers l'orchestrateur
// ============================================================================
// Combine les notifications broadcast (target='all') et les notifications
// personnelles (userId=X), trie par updatedAt desc, et applique flattenNotifications.
const repos = require('../../../repositories');
const { flattenNotifications } = require('../../../utils/flattenNotifications');

exports.getNotificationsService = async (userId, fastFoodId) => {
  try {
    if (!userId) return { success: false, message: 'userId est requis' };

    const [broadcasts, personnels] = await Promise.all([
      repos.notifications.getAllForTarget('all'),
      repos.notifications.getAllForUser(userId),
    ]);

    let allNotif = [
      ...(broadcasts || []).map((d) => ({ idGroup: d.id, ...d })),
      ...(personnels || []).map((d) => ({ idGroup: d.id, ...d })),
    ];
    allNotif.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    if (fastFoodId !== undefined) {
      allNotif = allNotif.filter((doc) => doc.fastFoodId !== fastFoodId);
    }

    const finalData = flattenNotifications(allNotif);
    return { success: true, data: finalData, message: 'notifications récupérées avec succès' };
  } catch (error) {
    console.error('Erreur dans getNotifications services:', error);
    return { success: false, message: error.message };
  }
};
