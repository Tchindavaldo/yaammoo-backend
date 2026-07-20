// ============================================================================
// emitBonusStats — Pousse les soldes recalculés de TOUS les bonus d'un user
// ============================================================================
// POT COMMUN GLOBAL (voulu) : les commandes sont une monnaie unique. Réclamer
// un bonus FASTFOOD décrémente aussi le solde PLATEFORME, et réclamer un bonus
// plateforme décrémente le solde du fastfood — les commandes d'un fastfood font
// partie du total plateforme, donc les dépenser les retire des deux côtés.
//
// Conséquence : réclamer UN bonus change le solde de TOUS. Le front ne peut pas
// se contenter du `bonusStats` renvoyé par le claim ; le backend recalcule donc
// l'ensemble et le pousse par socket. Le calcul reste côté serveur, le front
// applique la map telle quelle.
//
// Émis à chaque événement qui bouge le solde : réclamation (décrément) et
// nouvelle commande (incrément). PAS à la livraison des identifiants, qui ne
// touche pas au solde (le décrément a déjà eu lieu au claim).
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { computeBonusStats, applyConsumption } = require('./bonusStats.util');

/**
 * Recalcule le solde de chaque bonus pour un user et l'émet sur sa room.
 * Best-effort : un échec ne doit jamais faire échouer l'action métier appelante.
 *
 * @param {string} userId  uid du user (= nom de sa room socket, sans préfixe)
 * @param {Object} [ctx]   données déjà chargées par l'appelant, pour éviter de
 *                         refaire les mêmes requêtes (orders, userRequests, bonuses)
 * @returns {Promise<Object|null>} map bonusId -> bonusStats, ou null si échec
 */
async function emitBonusStats(userId, ctx = {}) {
  try {
    if (!userId) return null;

    const [bonuses, orders, userRequests] = await Promise.all([
      ctx.bonuses || repos.bonus.getAll(),
      ctx.orders || repos.orders.getByUser(userId),
      ctx.userRequests || repos.bonusRequests.getByUser(userId),
    ]);

    if (!bonuses || bonuses.length === 0) return null;

    const now = new Date();
    const statsByBonus = {};
    for (const bonus of bonuses) {
      // Le BRUT est cloisonné par fastFoodId (un bonus boutique ne compte que
      // ses commandes) ; le DÉCRÉMENT, lui, est global.
      const raw = computeBonusStats(orders, { fastFoodId: bonus.fastFoodId ?? null, now });
      statsByBonus[bonus.id] = applyConsumption(raw, bonus, userRequests, orders, now);
    }

    // Room nommée par l'uid, sans préfixe (cf. CLAUDE.md / socket.js).
    getIO().to(userId).emit('bonus.stats_updated', { data: { bonusStats: statsByBonus } });

    return statsByBonus;
  } catch (err) {
    console.error('emitBonusStats: échec (non bloquant):', err.message);
    return null;
  }
}

module.exports = { emitBonusStats };
