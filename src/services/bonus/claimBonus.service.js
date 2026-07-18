// ============================================================================
// claimBonusService — Réclamation d'un bonus (nouveau modèle fidélité)
// ============================================================================
// Flux (auto-approuvé + vérification d'éligibilité côté backend) :
//   1. Charge la définition du bonus (404 si absent) ; refuse si inactif.
//   2. Vérifie que le palier est atteint (welcome = toujours éligible).
//   3. Empêche une double réclamation active (déjà pending/approved non consommé).
//   4. Ajoute une entrée `approved` dans le bonus_request du user → `claimedAt`.
//   5. Notifie le user (best-effort).
// ============================================================================
const repos = require('../../repositories');
const { isBonusEligible } = require('./bonusStats.util');
const { deriveRequestState } = require('./enrichBonusForUser');
const { postNotificationService } = require('../notification/request/postNotification.service');

// bonus_type isolant les réclamations du nouveau modèle du legacy referral/claim.
const LOYALTY_TYPE = 'loyalty';

async function notifyUser(userId) {
  try {
    const user = await repos.users.getUserByIdSafe(userId);
    if (!user) return;
    const { fcm, apns } = repos.users.collectUserTokens(user);
    await postNotificationService({
      data: { title: 'Bonus', body: 'Votre bonus a été réclamé avec succès 🎉', type: 'Bonus' },
      tokens: fcm,
      apnsTokens: apns,
      userId,
    });
  } catch (err) {
    console.error('claimBonus: notification échouée (non bloquant):', err.message);
  }
}

/**
 * @param {string} userId   uid du user courant (token Firebase)
 * @param {string} bonusId  id du bonus à réclamer
 * @returns {Promise<{success:boolean, status?:number, message:string, data?:object}>}
 */
exports.claimBonusService = async (userId, bonusId) => {
  try {
    if (!userId) return { success: false, status: 401, message: 'Utilisateur non authentifié.' };
    if (!bonusId) return { success: false, status: 400, message: 'bonusId requis.' };

    const bonus = await repos.bonus.getById(bonusId);
    if (!bonus) return { success: false, status: 404, message: 'Bonus non trouvé.' };
    if (bonus.active === false) return { success: false, status: 400, message: "Ce bonus n'est pas actif." };

    // Éligibilité (source de vérité backend)
    const orders = await repos.orders.getByUser(userId);
    const { eligible, metric, target } = isBonusEligible(bonus, orders);
    if (!eligible) {
      return {
        success: false,
        status: 400,
        message: `Palier non atteint (${metric}/${target}).`,
      };
    }

    // Empêche une double réclamation active
    const existing = await repos.bonusRequests.findByUserBonus({ userId, bonusId, bonusType: LOYALTY_TYPE });
    const state = deriveRequestState(existing);
    if (state.requestStatus === 'pending' || (state.requestStatus === 'approved' && !state.redeemed)) {
      return { success: false, status: 409, message: 'Vous avez déjà une réclamation active pour ce bonus.' };
    }

    // Nouvelle entrée accordée (A = auto-approuvé)
    const now = new Date().toISOString();
    const entry = {
      status: 'approved',
      target: target,
      period: bonus.criteria?.period ?? null,
      createdAt: now,
    };
    const statusArray = existing ? [...(existing.status || []), entry] : [entry];

    let saved;
    if (existing) {
      // NB: le reset de usageCount/redeemed pour une nouvelle réclamation relève
      // du flux redemption (à venir) ; updateStatus ne touche que le tableau status.
      saved = await repos.bonusRequests.updateStatus(existing.id, statusArray);
    } else {
      saved = await repos.bonusRequests.create({
        userId,
        bonusId,
        bonusType: LOYALTY_TYPE,
        status: statusArray,
        usageCount: 0,
        redeemed: false,
      });
    }

    await notifyUser(userId);

    const finalState = deriveRequestState(saved);
    return {
      success: true,
      status: 201,
      message: 'Bonus réclamé avec succès.',
      data: {
        bonusId,
        requestStatus: finalState.requestStatus,
        claimedAt: finalState.claimedAt,
        userClaimedCount: finalState.userClaimedCount,
      },
    };
  } catch (error) {
    console.error('Erreur dans claimBonusService:', error);
    return { success: false, status: 500, message: error.message || 'Erreur serveur lors de la réclamation.' };
  }
};
