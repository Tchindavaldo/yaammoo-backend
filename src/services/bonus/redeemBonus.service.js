// ============================================================================
// redeemBonusService — Consommation d'une utilisation du code bonus
// ============================================================================
// Appelé au moment de la commande : le user présente le code reçu à la
// réclamation, on signale la consommation.
//
// Contrôles (dans l'ordre) :
//   1. Code connu + appartenant au user authentifié
//   2. Réclamation active (approved, pas encore entièrement consommée)
//   3. Non expiré (claimedAt + claimDuration jours)
//   4. usageCount < usageLimit
// Puis : usageCount++ et redeemed=true quand la limite est atteinte.
// ============================================================================
const repos = require('../../repositories');
const { deriveRequestState, computeExpiresAt } = require('./enrichBonusForUser');
const { normalizeBonusCode } = require('./bonusCode.util');

const LOYALTY_TYPE = 'loyalty';

/**
 * @param {string} userId  uid du user courant (token Firebase)
 * @param {string} rawCode code présenté par le user
 * @param {Object} [meta]  contexte optionnel (ex. { orderId })
 * @returns {Promise<{success:boolean, status?:number, message:string, data?:object}>}
 */
exports.redeemBonusService = async (userId, rawCode, meta = {}) => {
  try {
    if (!userId) return { success: false, status: 401, message: 'Utilisateur non authentifié.' };

    const code = normalizeBonusCode(rawCode);
    if (!code) return { success: false, status: 400, message: 'Code bonus requis.' };

    const request = await repos.bonusRequests.findByCode(code, LOYALTY_TYPE);
    if (!request) return { success: false, status: 404, message: 'Code bonus introuvable.' };

    // Le code appartient-il bien au user authentifié ?
    if (request.userId !== userId) {
      return { success: false, status: 403, message: 'Ce code ne vous appartient pas.' };
    }

    const state = deriveRequestState(request);
    if (state.requestStatus !== 'approved') {
      return { success: false, status: 400, message: "Ce bonus n'a pas été réclamé." };
    }
    if (state.redeemed) {
      return { success: false, status: 409, message: 'Ce code a déjà été entièrement consommé.' };
    }

    // Validité : claimedAt + claimDuration jours
    const bonus = await repos.bonus.getById(request.bonusId);
    if (!bonus) return { success: false, status: 404, message: 'Bonus non trouvé.' };

    const expiresAt = computeExpiresAt(state.claimedAt, bonus.claimDuration);
    if (expiresAt && new Date(expiresAt) < new Date()) {
      return { success: false, status: 400, message: 'Ce code a expiré.', data: { expiresAt } };
    }

    // Limite d'utilisation
    const usageLimit = bonus.usageLimit != null ? Number(bonus.usageLimit) : null;
    if (usageLimit != null && state.usageCount >= usageLimit) {
      return { success: false, status: 409, message: "Limite d'utilisation atteinte." };
    }

    const usageCount = state.usageCount + 1;
    const redeemed = usageLimit != null ? usageCount >= usageLimit : false;

    const fields = { usageCount, redeemed };
    if (meta.orderId) fields.lastOrderId = meta.orderId;

    const saved = await repos.bonusRequests.updateUsage(request.id, fields);
    const finalState = deriveRequestState(saved);

    return {
      success: true,
      status: 200,
      message: redeemed ? 'Dernière utilisation consommée.' : 'Utilisation consommée.',
      data: {
        bonusId: request.bonusId,
        code,
        usageCount: finalState.usageCount,
        usageLimit,
        remainingUses: usageLimit != null ? Math.max(0, usageLimit - finalState.usageCount) : null,
        redeemed: finalState.redeemed,
        expiresAt,
      },
    };
  } catch (error) {
    console.error('Erreur dans redeemBonusService:', error);
    return { success: false, status: 500, message: error.message || 'Erreur serveur lors de la consommation.' };
  }
};
