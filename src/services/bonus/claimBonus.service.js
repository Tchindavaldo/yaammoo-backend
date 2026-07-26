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
const { isBonusEligible, measureConsumption, collectSpentOrderIds } = require('./bonusStats.util');
const { emitBonusStats } = require('./emitBonusStats');
const { deriveRequestState, computeExpiresAt, pickCurrentRequest } = require('./enrichBonusForUser');
const { generateUniqueBonusCode } = require('./bonusCode.util');
const { postNotificationService } = require('../notification/request/postNotification.service');
const { getIO } = require('../../socket');

// Le message diffère selon l'issue : un bonus à livraison manuelle n'est pas
// encore utilisable, promettre le contraire serait trompeur.
async function notifyUser(userId, pending) {
  try {
    const user = await repos.users.getUserByIdSafe(userId);
    if (!user) return;
    const { fcm, apns } = repos.users.collectUserTokens(user);
    await postNotificationService({
      data: {
        title: 'Bonus',
        body: pending ? 'Votre réclamation est en cours de traitement ⏳' : 'Votre bonus a été réclamé avec succès 🎉',
        type: 'Bonus',
      },
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

    // Toutes les réclamations du user : le décrément est un POT COMMUN partagé
    // entre tous les bonus (plateforme et fastfood confondus).
    const userRequests = await repos.bonusRequests.getByUser(userId);
    // Réclamation COURANTE de ce bonus (`isCurrent`). Les autres lignes sont
    // l'historique des cycles précédents : elles ne comptent que pour le pot
    // commun et `userClaimedCount`.
    const existing = pickCurrentRequest(userRequests.filter(r => r.bonusId === bonusId));

    // Anti-doublon : une réclamation reste active tant qu'elle n'est ni
    // entièrement consommée ni expirée.
    const state = deriveRequestState(existing);
    const currentExpiresAt = computeExpiresAt(state.claimedAt, bonus.claimDuration);
    const stillValid = !currentExpiresAt || new Date(currentExpiresAt) >= new Date();
    if (state.requestStatus === 'pending' || (state.requestStatus === 'approved' && !state.redeemed && stillValid)) {
      return { success: false, status: 409, message: 'Vous avez déjà une réclamation active pour ce bonus.' };
    }

    // Éligibilité sur le solde DÉCRÉMENTÉ (source de vérité backend) : un palier
    // déjà consommé ne peut être re-réclamé sans nouvelles commandes.
    const orders = await repos.orders.getByUser(userId);
    const { eligible, metric, target } = isBonusEligible(bonus, orders, userRequests);
    if (!eligible) {
      return {
        success: false,
        status: 400,
        message: `Palier non atteint (${metric}/${target}).`,
      };
    }

    // Bonus à livraison manuelle (identifiants Netflix, clé…) : la réclamation
    // reste `pending` jusqu'à ce qu'un admin/marchand fournisse les identifiants.
    // Les autres sont auto-approuvés et le code est délivré immédiatement.
    const needsRewardCredentials = bonus.requiresRewardCredentials === true;

    const now = new Date().toISOString();
    // Modèle SOLDÉ : on exclut les commandes déjà dépensées par une réclamation
    // antérieure (pot commun), puis on mémorise celles que CE claim consomme —
    // par leurs IDs, plus les totaux dans LES DEUX unités (un palier en FCFA ne
    // peut pas être soustrait d'un compteur de commandes, et inversement).
    //
    // ⚠️ Le décrément a lieu DÈS le claim, y compris en `pending` : sans ça, le
    // user pourrait réclamer plusieurs bonus avec le même solde pendant que la
    // livraison est en cours de traitement.
    const spentOrderIds = collectSpentOrderIds(userRequests);
    const { consumedCount, consumedAmount, consumedOrderIds } = measureConsumption(bonus, orders, { spentOrderIds });

    const entry = {
      status: needsRewardCredentials ? 'pending' : 'approved',
      target: target,
      kind: bonus.criteria?.kind ?? null,
      period: bonus.criteria?.period ?? null,
      consumedCount,
      consumedAmount,
      consumedOrderIds,
      createdAt: now,
    };
    // Chaque réclamation ouvre sa PROPRE ligne : son tableau `status` ne porte
    // que sa propre entrée. L'historique se lit en listant les lignes du user,
    // plus en dépliant un JSONB accumulé.
    const statusArray = [entry];

    // Chaque réclamation ouvre un nouveau cycle d'utilisation : code neuf,
    // compteur d'usage remis à zéro. En attente de livraison, aucun code n'est
    // délivré — il le sera par le rewardCredentials.
    const code = needsRewardCredentials ? null : await generateUniqueBonusCode(c => repos.bonusRequests.codeExists(c));
    // Un nouveau cycle repart désarmé : le user ré-arme explicitement s'il veut
    // que le bonus s'applique à sa prochaine commande.
    const usageFields = { code, usageCount: 0, redeemed: false, armed: false };

    // TOUJOURS une nouvelle ligne : `createCurrent` démote le cycle précédent
    // (il devient de l'historique consultable) avant d'insérer celle-ci.
    const saved = await repos.bonusRequests.createCurrent({
      userId,
      bonusId,
      status: statusArray,
      ...usageFields,
    });

    const finalState = deriveRequestState(saved);
    const expiresAt = computeExpiresAt(finalState.claimedAt, bonus.claimDuration);

    // POT COMMUN GLOBAL : le décrément touche le solde de TOUS les bonus, pas
    // seulement celui réclamé. On recalcule donc l'ensemble et on le pousse par
    // socket — le front applique la map sans avoir à re-GET.
    const updatedRequests = [...userRequests, saved];
    const bonusStats = await emitBonusStats(userId, { orders, userRequests: updatedRequests });

    // État de CETTE réclamation. Le reste (nom, usageLimit…) est déjà connu via
    // GET /bonus/all et n'a pas bougé.
    const claimState = {
      bonusId,
      requestId: saved.id,
      requestStatus: finalState.requestStatus,
      code: finalState.code,
      claimedAt: finalState.claimedAt,
      expiresAt,
    };

    // Room nommée par l'uid, sans préfixe (cf. CLAUDE.md / socket.js).
    // Pas de `bonusStats` ici : les soldes sont portés par `bonus.stats_updated`,
    // émis juste au-dessus — un seul événement fait autorité sur le solde.
    try {
      getIO().to(userId).emit('bonus.claimed', { data: claimState });
    } catch (err) {
      console.error('claimBonus: émission socket échouée (non bloquant):', err.message);
    }
    await notifyUser(userId, needsRewardCredentials);

    return {
      success: true,
      status: 201,
      message: needsRewardCredentials ? 'Réclamation enregistrée, en attente de livraison.' : 'Bonus réclamé avec succès.',
      // La réponse HTTP porte les soldes : un claim reste correct même si le
      // socket est déconnecté, sans re-GET.
      data: { ...claimState, bonusStats },
    };
  } catch (error) {
    console.error('Erreur dans claimBonusService:', error);
    return { success: false, status: 500, message: error.message || 'Erreur serveur lors de la réclamation.' };
  }
};
