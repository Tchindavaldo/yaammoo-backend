// ============================================================================
// rewardCredentialsBonusService — Livraison manuelle d'une réclamation en attente
// ============================================================================
// Les bonus marqués `requiresRewardCredentials` (Netflix, clé de jeu…) ne sont pas
// auto-approuvés : le claim reste `pending` jusqu'à ce qu'un admin (bonus
// plateforme) ou le marchand propriétaire fournisse les identifiants.
//
// Flux :
//   1. Charge la réclamation + le bonus (404 si absents).
//   2. Autorisation : admin, ou propriétaire de la boutique du bonus.
//   3. Refuse si aucune entrée `pending` (déjà livrée / rien à livrer).
//   4. Passe l'entrée en `approved`, y attache `rewardCredentials` et délivre le code.
//   5. Notifie le user : socket `bonus.reward_credentials` + push.
//
// ⚠️ Le solde a DÉJÀ été décrémenté au claim (cf. claimBonus.service) : la
// livraison ne touche pas aux `consumedOrderIds`.
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { generateBonusCode } = require('./bonusCode.util');
const { deriveRequestState, computeExpiresAt } = require('./enrichBonusForUser');
const { postNotificationService } = require('../notification/request/postNotification.service');

async function notifyUser(userId, bonus, isCorrection = false) {
  try {
    const user = await repos.users.getUserByIdSafe(userId);
    if (!user) return;
    const { fcm, apns } = repos.users.collectUserTokens(user);
    await postNotificationService({
      data: {
        // Le user possède déjà les accès sur une correction : annoncer une
        // nouvelle livraison serait trompeur.
        title: isCorrection ? 'Bonus mis à jour' : 'Bonus disponible',
        body: isCorrection ? `Vos accès « ${bonus.name} » ont été mis à jour.` : `Vos accès « ${bonus.name} » sont disponibles 🎉`,
        type: 'Bonus',
      },
      tokens: fcm,
      apnsTokens: apns,
      userId,
    });
  } catch (err) {
    console.error('rewardCredentialsBonus: notification échouée (non bloquant):', err.message);
  }
}

/**
 * Pour un bonus à profil (`requiresProfile`, cf. migration 017),
 * `rewardCredentials.profile` doit porter le nom du profil attribué au user ET son
 * code d'accès — sans quoi les identifiants de compte seuls ne permettent pas
 * d'entrer sur le profil.
 *
 * L'exigence est portée par le bonus lui-même : aucune liste de types en dur ici,
 * la règle se change en base ou via PATCH /bonus/:id.
 * @returns {string|null} message d'erreur, ou null si valide
 */
function validateProfileCredentials(bonus, rewardCredentials) {
  if (!bonus?.requiresProfile) return null;

  const label = bonus.name || bonus.type || 'ce bonus';
  const profile = rewardCredentials.profile;
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return `« ${label} » donne accès à un profil : rewardCredentials.profile est requis (objet {name, code}).`;
  }

  const missing = ['name', 'code'].filter(k => {
    const v = profile[k];
    return typeof v !== 'string' || v.trim() === '';
  });
  if (missing.length > 0) {
    return `« ${label} » donne accès à un profil : rewardCredentials.profile.${missing.join(' et .')} ${missing.length > 1 ? 'sont requis' : 'est requis'} (chaîne non vide).`;
  }

  return null;
}

/**
 * @param {string} requestId    id du bonus_request à livrer
 * @param {Object} rewardCredentials  identifiants livrés (forme libre : login/password,
 *                              clé, lien… selon le type de bonus). Si le bonus est
 *                              `requiresProfile` : `profile {name, code}` est
 *                              obligatoire en plus des identifiants de compte.
 * @param {string} viewerUid    uid de l'appelant (req.user.uid)
 */
exports.rewardCredentialsBonusService = async (requestId, rewardCredentials, viewerUid) => {
  try {
    if (!viewerUid) return { success: false, status: 401, message: 'Utilisateur non authentifié.' };
    if (!requestId) return { success: false, status: 400, message: 'requestId requis.' };
    if (!rewardCredentials || typeof rewardCredentials !== 'object' || Array.isArray(rewardCredentials) || Object.keys(rewardCredentials).length === 0) {
      return { success: false, status: 400, message: 'rewardCredentials requis (objet non vide).' };
    }

    const request = await repos.bonusRequests.getById(requestId);
    if (!request) return { success: false, status: 404, message: 'Réclamation non trouvée.' };

    const bonus = await repos.bonus.getById(request.bonusId);
    if (!bonus) return { success: false, status: 404, message: 'Bonus non trouvé.' };

    // Les bonus à profil (Netflix…) sont inutilisables sans le profil ET son code
    // d'accès : on refuse la livraison plutôt que de livrer des accès incomplets.
    const profileError = validateProfileCredentials(bonus, rewardCredentials);
    if (profileError) return { success: false, status: 400, message: profileError };

    // Autorisation : chacun gère sa part — admin pour les bonus plateforme,
    // marchand propriétaire pour les bonus de sa boutique.
    const viewer = await repos.users.getUserByIdSafe(viewerUid);
    if (!viewer) return { success: false, status: 404, message: 'Utilisateur non trouvé.' };
    const isAdmin = !!viewer.isAdmin;

    if (bonus.fastFoodId) {
      const fastFood = await repos.fastfoods.getById(bonus.fastFoodId);
      if (!isAdmin && viewerUid !== fastFood?.userId) {
        return { success: false, status: 403, message: "Vous n'êtes pas propriétaire de cette boutique." };
      }
    } else if (!isAdmin) {
      return { success: false, status: 403, message: 'Seul un administrateur peut livrer un bonus plateforme.' };
    }

    // Cible : la dernière entrée en attente. À défaut, la dernière déjà livrée —
    // corriger/compléter des identifiants après coup est un besoin réel (ex. un
    // bonus passé `requiresProfile` alors que d'anciennes livraisons n'ont pas de
    // profil), sans quoi il faudrait re-livrer et invalider le code du user.
    const entries = Array.isArray(request.status) ? [...request.status] : [];
    const statuses = entries.map(e => e && e.status);
    const index = statuses.lastIndexOf('pending');
    const updateIndex = index !== -1 ? index : statuses.lastIndexOf('approved');
    if (updateIndex === -1) {
      return { success: false, status: 409, message: 'Aucune réclamation à livrer ou à corriger.' };
    }
    // Mise à jour d'accès déjà remis au user (vs première livraison).
    const isCorrection = index === -1;

    const now = new Date().toISOString();
    const code = request.code || generateBonusCode();

    entries[updateIndex] = {
      ...entries[updateIndex],
      status: 'approved',
      rewardCredentials,
      credentialsSentAt: now,
      credentialsSentBy: viewerUid,
    };

    // Sur une correction, le user a pu déjà consommer des utilisations : on
    // préserve ses compteurs (les remettre à zéro lui rendrait des usages).
    const usage = isCorrection
      ? { code, usageCount: request.usageCount ?? 0, redeemed: request.redeemed ?? false }
      : { code, usageCount: 0, redeemed: false };

    const saved = await repos.bonusRequests.updateUsage(requestId, usage, entries);

    const finalState = deriveRequestState(saved);
    const expiresAt = computeExpiresAt(finalState.claimedAt, bonus.claimDuration);

    // Strictement ce qui change : la réclamation passe en `approved` et les
    // identifiants deviennent disponibles.
    const payload = {
      bonusId: request.bonusId,
      requestId,
      requestStatus: finalState.requestStatus,
      code: finalState.code,
      rewardCredentials,
      // `claimedAt` n'existe qu'à partir de l'approbation : au claim la
      // réclamation était `pending`, donc le front ne l'a jamais reçue.
      claimedAt: finalState.claimedAt,
      expiresAt,
    };

    // Room nommée par l'uid, sans préfixe (cf. CLAUDE.md / socket.js).
    try {
      getIO().to(request.userId).emit('bonus.reward_credentials', { data: payload });
    } catch (err) {
      console.error('rewardCredentialsBonus: émission socket échouée (non bloquant):', err.message);
    }
    await notifyUser(request.userId, bonus, isCorrection);

    return {
      success: true,
      status: 200,
      message: isCorrection ? 'Identifiants mis à jour avec succès.' : 'Bonus livré avec succès.',
      data: payload,
    };
  } catch (error) {
    console.error('Erreur dans rewardCredentialsBonusService:', error);
    return { success: false, status: 500, message: error.message || 'Erreur serveur lors de la livraison.' };
  }
};
