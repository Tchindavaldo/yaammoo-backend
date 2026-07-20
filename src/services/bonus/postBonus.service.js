// ============================================================================
// postBonusService — Création d'un bonus (définition uniquement)
// ============================================================================
// Seule la DÉFINITION est persistée. Les champs dépendant du user (bonusStats,
// compteurs, requestStatus…) sont recalculés au GET et rejetés par le
// validateur. Cf. architecture/bonus.md.
//
// Autorisation :
//   • bonus de boutique (fastFoodId) → seul le marchand PROPRIÉTAIRE
//     (viewerUid === fastfood.userId), ou un admin.
//   • bonus plateforme (sans fastFoodId) → admin uniquement.
// ============================================================================
const repos = require('../../repositories');
const { validateBonus } = require('../../utils/validator/validateBonus');

/**
 * @param {Object} data      définition du bonus
 * @param {string} viewerUid uid de l'appelant (req.user.uid)
 */
exports.postBonusService = async (data, viewerUid) => {
  if (!viewerUid) return { success: false, status: 401, message: 'Utilisateur non authentifié.' };

  const errors = validateBonus(data);
  if (errors.length > 0) {
    return { success: false, status: 400, message: 'Définition de bonus invalide.', errors };
  }

  const viewer = await repos.users.getUserByIdSafe(viewerUid);
  if (!viewer) return { success: false, status: 404, message: 'Utilisateur non trouvé.' };
  const isAdmin = !!viewer.isAdmin;

  // Cible du bonus : explicite si fourni, sinon déduite du compte appelant.
  // Le rôle admin PRIME : un admin sans fastFoodId explicite crée un bonus
  // plateforme, même si son compte possède par ailleurs une boutique.
  const targetFastFoodId = data.fastFoodId ?? (isAdmin ? null : (viewer.fastFoodId ?? null));

  let fastFoodName = null;

  if (targetFastFoodId) {
    // Bonus de boutique : le marchand doit en être le propriétaire.
    const fastFood = await repos.fastfoods.getById(targetFastFoodId);
    if (!fastFood) return { success: false, status: 404, message: 'FastFood non trouvé.' };

    if (!isAdmin && viewerUid !== fastFood.userId) {
      return { success: false, status: 403, message: "Vous n'êtes pas propriétaire de cette boutique." };
    }

    // Nom toujours pris en base : jamais celui envoyé par le client, qui
    // pourrait ne pas correspondre à la boutique.
    fastFoodName = fastFood.name ?? null;
  } else if (isAdmin) {
    // Bonus plateforme : porte le nom de la plateforme côté front.
    fastFoodName = process.env.PLATFORM_NAME;
  } else {
    // Bonus plateforme yaammoo : réservé aux admins.
    return {
      success: false,
      status: 403,
      message: 'Seul un administrateur peut créer un bonus plateforme (sans fastFoodId).',
    };
  }

  // Valeurs par défaut : un bonus est actif sauf mention contraire.
  const created = await repos.bonus.create({
    ...data,
    fastFoodId: targetFastFoodId,
    fastFoodName,
    active: data.active ?? true,
    createdBy: viewerUid,
  });

  return { success: true, status: 201, message: 'Bonus créé avec succès.', data: created };
};
