// ============================================================================
// patchBonusService — Mise à jour partielle d'un bonus
// ============================================================================
// Même contrôle d'autorisation que la création : seul le marchand PROPRIÉTAIRE
// de la boutique, ou un admin, peut modifier un bonus.
//
// Tous les champs de définition sont modifiables (y compris `criteria`,
// `usageLimit`, `claimDuration`). Les réclamations DÉJÀ faites ne sont pas
// affectées rétroactivement : chaque entrée du bonus_request a mémorisé son
// propre `target`, donc le décrément historique reste juste.
//
// `active: false` est le moyen de retirer un bonus de l'affichage (il n'existe
// pas de suppression : les codes déjà distribués resteraient orphelins).
// ============================================================================
const repos = require('../../repositories');
const { validateBonus } = require('../../utils/validator/validateBonus');

/**
 * @param {string} bonusId
 * @param {Object} data      champs à modifier
 * @param {string} viewerUid uid de l'appelant (req.user.uid)
 */
exports.patchBonusService = async (bonusId, data, viewerUid) => {
  if (!viewerUid) return { success: false, status: 401, message: 'Utilisateur non authentifié.' };
  if (!bonusId) return { success: false, status: 400, message: 'bonusId requis.' };

  const errors = validateBonus(data, { partial: true });
  if (errors.length > 0) {
    return { success: false, status: 400, message: 'Modification invalide.', errors };
  }

  const bonus = await repos.bonus.getById(bonusId);
  if (!bonus) return { success: false, status: 404, message: 'Bonus non trouvé.' };

  const viewer = await repos.users.getUserByIdSafe(viewerUid);
  if (!viewer) return { success: false, status: 404, message: 'Utilisateur non trouvé.' };
  const isAdmin = !!viewer.isAdmin;

  // Autorisation : propriétaire de la boutique du bonus, ou admin.
  if (bonus.fastFoodId) {
    const fastFood = await repos.fastfoods.getById(bonus.fastFoodId);
    if (!isAdmin && viewerUid !== fastFood?.userId) {
      return { success: false, status: 403, message: "Vous n'êtes pas propriétaire de cette boutique." };
    }
  } else if (!isAdmin) {
    // Bonus plateforme : admin uniquement.
    return { success: false, status: 403, message: 'Seul un administrateur peut modifier un bonus plateforme.' };
  }

  const fields = { ...data };

  // Rattachement à une autre boutique : re-contrôler la propriété et resynchroniser
  // le nom (toujours résolu côté serveur, jamais envoyé par le client).
  if ('fastFoodId' in fields) {
    if (fields.fastFoodId) {
      const target = await repos.fastfoods.getById(fields.fastFoodId);
      if (!target) return { success: false, status: 404, message: 'FastFood non trouvé.' };
      if (!isAdmin && viewerUid !== target.userId) {
        return { success: false, status: 403, message: "Vous n'êtes pas propriétaire de cette boutique." };
      }
      fields.fastFoodName = target.name ?? null;
    } else {
      // Bascule en bonus plateforme : réservé aux admins.
      if (!isAdmin) {
        return { success: false, status: 403, message: 'Seul un administrateur peut créer un bonus plateforme.' };
      }
      fields.fastFoodId = null;
      fields.fastFoodName = process.env.PLATFORM_NAME;
    }
  }

  const updated = await repos.bonus.update(bonusId, fields);
  return { success: true, status: 200, message: 'Bonus mis à jour avec succès.', data: updated };
};
