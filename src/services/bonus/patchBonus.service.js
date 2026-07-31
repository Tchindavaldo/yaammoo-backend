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
const { broadcastBonusActivation } = require('./broadcastBonusActivation');

/**
 * Fusionne un `criteria` partiel avec celui déjà en base (et, à l'intérieur, un
 * `schedule` partiel). Les autres champs sont scalaires : l'affectation directe
 * suffit, on ne fusionne QUE `criteria`.
 * @returns {Object} les champs à écrire, `criteria` complété
 */
function mergeCriteria(bonus, input) {
  if (!input || typeof input.criteria !== 'object' || input.criteria === null || Array.isArray(input.criteria)) {
    return { ...input };
  }

  const current = bonus.criteria && typeof bonus.criteria === 'object' ? bonus.criteria : {};
  const merged = { ...current, ...input.criteria };

  // `schedule` est lui-même un sous-objet cohérent : même traitement d'un cran
  // plus bas. `null` explicite = suppression de la campagne, on ne fusionne pas.
  if (input.criteria.schedule && typeof input.criteria.schedule === 'object' && !Array.isArray(input.criteria.schedule)) {
    const currentSchedule = current.schedule && typeof current.schedule === 'object' ? current.schedule : {};
    merged.schedule = { ...currentSchedule, ...input.criteria.schedule };
    if (input.criteria.schedule.postWindow && currentSchedule.postWindow) {
      merged.schedule.postWindow = { ...currentSchedule.postWindow, ...input.criteria.schedule.postWindow };
    }
  }

  return { ...input, criteria: merged };
}

/**
 * @param {string} bonusId
 * @param {Object} input     champs à modifier (`criteria` peut être partiel)
 * @param {string} viewerUid uid de l'appelant (req.user.uid)
 */
exports.patchBonusService = async (bonusId, input, viewerUid) => {
  if (!viewerUid) return { success: false, status: 401, message: 'Utilisateur non authentifié.' };
  if (!bonusId) return { success: false, status: 400, message: 'bonusId requis.' };

  const bonus = await repos.bonus.getById(bonusId);
  if (!bonus) return { success: false, status: 404, message: 'Bonus non trouvé.' };

  // `criteria` est un JSONB écrit en bloc : envoyé partiellement, il écraserait
  // les clés absentes (`kind`, `period`, `target`…). On le FUSIONNE donc avec
  // l'existant, sinon PATCH ne tiendrait pas sa promesse de mise à jour
  // partielle. Même chose pour `criteria.schedule`, sous-objet cohérent : on doit
  // pouvoir ne changer que `postDate` sans réémettre tout le créneau.
  // `null` reste un effacement explicite, à tous les niveaux.
  const data = mergeCriteria(bonus, input);

  // Validation APRÈS fusion : c'est le `criteria` résultant qui doit être
  // cohérent, pas le fragment envoyé (un fragment est valide par construction).
  const errors = validateBonus(data, { partial: true });
  if (errors.length > 0) {
    return { success: false, status: 400, message: 'Modification invalide.', errors };
  }

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

  // `criteria` a été fusionné à partir de `bonus` lu plus haut : on n'écrit que
  // si personne ne l'a modifié depuis, sinon la modification de l'autre admin
  // disparaîtrait silencieusement. Les autres champs sont écrits tels quels
  // (colonnes indépendantes), aucun verrou n'est nécessaire pour eux.
  const updated = await repos.bonus.update(bonusId, fields, 'criteria' in fields ? { expectedCriteria: bonus.criteria ?? null } : {});
  if (updated?.conflict) {
    return {
      success: false,
      status: 409,
      message: 'Ce bonus a été modifié entre-temps. Rechargez-le puis réessayez.',
    };
  }

  // Bascule active/inactive : tous les clients doivent le savoir (socket + push).
  // On ne diffuse que sur un CHANGEMENT réel, pour ne pas notifier un PATCH qui
  // renvoie la même valeur.
  if ('active' in fields && !!fields.active !== !!bonus.active) {
    await broadcastBonusActivation(updated, !!fields.active);
  }

  return { success: true, status: 200, message: 'Bonus mis à jour avec succès.', data: updated };
};
