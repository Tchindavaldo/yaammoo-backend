// ============================================================================
// getBonusService — Liste tous les bonus, enrichis pour le user courant
// ============================================================================
// La table `bonus` ne stocke QUE la définition. Les champs qui dépendent du
// user (bonusStats, compteurs, état de la demande) sont recalculés ici au GET
// puis fusionnés dans chaque bonus. Cf. architecture/bonus.md.
// ============================================================================
const repos = require('../../repositories');
const { enrichBonusForUser, CLAIMED_ENTRY_STATUSES } = require('./enrichBonusForUser');

/**
 * @param {string} userId  uid du user courant (issu du token Firebase)
 * @returns {Promise<Array>} bonus enrichis au format payload complet
 */
exports.getBonusService = async userId => {
  try {
    const bonuses = await repos.bonus.getAll();
    if (!bonuses || bonuses.length === 0) return [];

    // Contexte user : commandes + demandes du user, + compteurs globaux.
    // Sans userId (fallback), on renvoie quand même la définition + compteurs
    // globaux, avec une progression/état vides.
    const [orders, userRequests, totalClaimCounts] = await Promise.all([
      userId ? repos.orders.getByUser(userId) : Promise.resolve([]),
      userId ? repos.bonusRequests.getByUser(userId) : Promise.resolve([]),
      repos.bonusRequests.claimCountsByBonus(CLAIMED_ENTRY_STATUSES),
    ]);

    // Index demandes du user par bonusId
    const userRequestByBonus = {};
    for (const req of userRequests) {
      if (req && req.bonusId) userRequestByBonus[req.bonusId] = req;
    }

    // Nb de bonus proposés par chaque fastfood (calculé depuis la liste)
    const fastFoodBonusCounts = {};
    for (const b of bonuses) {
      if (b.fastFoodId) fastFoodBonusCounts[b.fastFoodId] = (fastFoodBonusCounts[b.fastFoodId] || 0) + 1;
    }

    const now = new Date();
    return bonuses.map(bonus => enrichBonusForUser(bonus, { orders, userRequestByBonus, fastFoodBonusCounts, totalClaimCounts, now }));
  } catch (error) {
    console.error('Erreur dans getBonusService:', error);
    throw new Error(error.message || 'Erreur lors de la récupération des bonus');
  }
};
