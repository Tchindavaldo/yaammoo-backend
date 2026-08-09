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
const { checkFreeDeliveryAffordable, affordabilityMessage } = require('./deliveryOfferAffordability');
const { getPricingSettings } = require('../settings/settings.service');
const { toNumber } = require('../pricing/deliveryPricing');

/**
 * @param {string} rawCode    code présenté
 * @param {string} [fastFoodId] boutique visée — omis, la correspondance n'est pas testée
 * @param {Object} [order]     contexte de la commande en cours de composition :
 *   `{ brutUnit, quantity, coursePrice }`. Fourni, il permet d'annoncer AVANT
 *   la commande qu'un bonus plateforme n'est pas finançable (« ajoutez N plats »)
 *   — le même refus que `POST /transaction` opposera, mais sans surprise.
 *   Omis, ce contrôle est simplement sauté : la vérification d'un code hors
 *   contexte reste possible.
 */
exports.verifyBonusCodeService = async (rawCode, fastFoodId, order) => {
  try {
    const code = normalizeBonusCode(rawCode);
    if (!code) return { success: false, status: 400, message: 'Code bonus requis.' };

    const request = await repos.bonusRequests.findByCode(code);
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

    // Finançabilité : contrôlée seulement si le contexte de commande est fourni.
    // Le refus est DUR à la commande — mieux vaut l'annoncer ici, pendant que le
    // user peut encore ajouter un plat.
    if (order && fastFoodId) {
      const pricing = await getPricingSettings();
      const fastfood = await repos.fastfoods.getById(fastFoodId).catch(() => null);
      const afford = checkFreeDeliveryAffordable({
        fastfood,
        brutUnit: toNumber(order.brutUnit),
        quantity: order.quantity,
        coursePrice: toNumber(order.coursePrice),
        coveredBy: buildDeliveryOffer(bonus, request)?.coveredBy,
        pricing,
      });
      if (!afford.affordable) {
        return {
          success: true,
          status: 200,
          message: affordabilityMessage(afford),
          data: {
            valid: false,
            reason: 'not_affordable',
            bonusId: bonus.id,
            minItems: Number.isFinite(afford.minItems) ? afford.minItems : null,
            missingItems: afford.missing,
            expiresAt: check.expiresAt,
            remainingUses: check.remainingUses,
          },
        };
      }
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
