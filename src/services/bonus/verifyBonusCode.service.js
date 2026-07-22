// ============================================================================
// verifyBonusCodeService — Vérification d'un code bonus (LECTURE SEULE)
// ============================================================================
// Sert à l'écran de commande : le user saisit/présente un code, le front veut
// savoir s'il est valide AVANT de passer la commande, pour afficher la livraison
// comme offerte. Cet armement-là est purement local (il meurt avec l'écran),
// d'où l'absence totale d'écriture ici.
//
// ⚠️ Ne fait JAMAIS autorité : POST /order rejoue tous les contrôles. Un code
// vérifié puis consommé ailleurs entre-temps sera refusé à la commande.
//
// La propriété du code n'est PAS vérifiée : un code peut circuler entre users
// (bonus offert à un proche). Le code lui-même fait foi.
// ============================================================================
const repos = require('../../repositories');
const { normalizeBonusCode } = require('./bonusCode.util');
const { checkDeliveryBonusUsable, buildDeliveryOffer, messageForReason } = require('./deliveryOffer');

const LOYALTY_TYPE = 'loyalty';

/**
 * @param {string} rawCode    code présenté
 * @param {string} [fastFoodId] boutique visée — omis, la correspondance n'est pas testée
 */
exports.verifyBonusCodeService = async (rawCode, fastFoodId) => {
  try {
    const code = normalizeBonusCode(rawCode);
    if (!code) return { success: false, status: 400, message: 'Code bonus requis.' };

    const request = await repos.bonusRequests.findByCode(code, LOYALTY_TYPE);
    if (!request) {
      return { success: true, status: 200, message: messageForReason('code_not_found'), data: { valid: false, reason: 'code_not_found' } };
    }

    const bonus = await repos.bonus.getById(request.bonusId);
    const check = checkDeliveryBonusUsable(bonus, request, { fastFoodId });

    if (!check.usable) {
      return {
        success: true,
        status: 200,
        message: messageForReason(check.reason),
        data: {
          valid: false,
          reason: check.reason,
          bonusId: bonus?.id ?? null,
          expiresAt: check.expiresAt ?? null,
          remainingUses: check.remainingUses ?? null,
        },
      };
    }

    return {
      success: true,
      status: 200,
      message: 'Code valide.',
      data: {
        valid: true,
        bonusId: bonus.id,
        bonusName: bonus.name ?? null,
        type: bonus.type,
        fastFoodId: bonus.fastFoodId ?? null,
        expiresAt: check.expiresAt,
        remainingUses: check.remainingUses,
        deliveryOffer: buildDeliveryOffer(bonus, request),
      },
    };
  } catch (error) {
    console.error('Erreur dans verifyBonusCodeService:', error);
    return { success: false, status: 500, message: error.message || 'Erreur serveur lors de la vérification.' };
  }
};
