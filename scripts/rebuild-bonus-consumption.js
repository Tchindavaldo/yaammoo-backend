// ============================================================================
// rebuild-bonus-consumption — Recalcule la consommation en modèle SOLDÉ
// ============================================================================
// Après la purge, les réclamations accordées n'ont plus de contrepartie : un
// bonus apparaît actif (code valide) alors qu'aucune commande n'a été
// consommée — état incohérent.
//
// Ce script rejoue TOUTES les réclamations accordées d'un user dans l'ordre
// CHRONOLOGIQUE, en accumulant les commandes déjà dépensées : chaque entrée
// consomme uniquement des commandes encore libres. C'est exactement ce que
// produirait une suite de claims sous le nouveau modèle.
//
// Idempotent : une entrée portant déjà `consumedOrderIds` est laissée telle
// quelle et ses commandes restent réservées pour les entrées suivantes.
//
// Usage :
//   node scripts/rebuild-bonus-consumption.js          # simulation (dry-run)
//   node scripts/rebuild-bonus-consumption.js --apply  # écrit en base
// ============================================================================
require('dotenv').config();

const repos = require('../src/repositories');
const { measureConsumption, CLAIMED_STATUSES } = require('../src/services/bonus/bonusStats.util');

const APPLY = process.argv.includes('--apply');

(async () => {
  const requests = await repos.bonusRequests.getAll();
  console.log(`${requests.length} réclamation(s) trouvée(s)${APPLY ? '' : '  [DRY-RUN]'}\n`);

  // Regroupement par user : le solde est un POT COMMUN, l'ordre de dépense se
  // juge sur l'ensemble des réclamations du user, tous bonus confondus.
  const byUser = new Map();
  for (const r of requests) {
    if (!byUser.has(r.userId)) byUser.set(r.userId, []);
    byUser.get(r.userId).push(r);
  }

  const bonusCache = new Map();
  let touched = 0;

  for (const [userId, userRequests] of byUser) {
    const orders = await repos.orders.getByUser(userId);

    // Toutes les entrées accordées du user, à plat, triées par date de claim.
    const timeline = [];
    for (const request of userRequests) {
      const entries = Array.isArray(request.status) ? request.status : [];
      entries.forEach((entry, index) => {
        if (entry && CLAIMED_STATUSES.includes(entry.status)) timeline.push({ request, entry, index });
      });
    }
    timeline.sort((a, b) => new Date(a.entry.createdAt || 0) - new Date(b.entry.createdAt || 0));

    const spentOrderIds = new Set();
    const patched = new Map(); // requestId -> status[] modifié

    for (const { request, entry, index } of timeline) {
      // Déjà en modèle soldé : on réserve ses commandes et on n'y touche pas.
      if (Array.isArray(entry.consumedOrderIds)) {
        for (const id of entry.consumedOrderIds) spentOrderIds.add(id);
        continue;
      }

      if (!bonusCache.has(request.bonusId)) {
        bonusCache.set(request.bonusId, await repos.bonus.getById(request.bonusId));
      }
      const bonus = bonusCache.get(request.bonusId);
      if (!bonus) {
        console.log(`- ${request.id} : bonus ${request.bonusId} introuvable, ignoré`);
        continue;
      }

      // On se replace à la date de la réclamation : seules les commandes
      // antérieures pouvaient être consommées à ce moment-là.
      const at = new Date(entry.createdAt || Date.now());
      const past = orders.filter(o => new Date(o.createdAt) <= at);
      const { consumedCount, consumedAmount, consumedOrderIds } = measureConsumption(bonus, past, { spentOrderIds, now: at });

      for (const id of consumedOrderIds) spentOrderIds.add(id);

      const status = patched.get(request.id) || [...(request.status || [])];
      status[index] = {
        ...entry,
        kind: bonus.criteria?.kind ?? null,
        period: bonus.criteria?.period ?? null,
        target: bonus.criteria?.target ?? null,
        consumedCount,
        consumedAmount,
        consumedOrderIds,
      };
      patched.set(request.id, status);
      touched += 1;

      console.log(`- ${request.id} | ${bonus.name} (${bonus.criteria?.kind} ${bonus.criteria?.target}) @ ${entry.createdAt}`);
      console.log(`    -> ${consumedCount} cmd / ${consumedAmount} FCFA  ${JSON.stringify(consumedOrderIds)}`);
    }

    if (APPLY) {
      for (const [requestId, status] of patched) {
        await repos.bonusRequests.updateUsage(requestId, {}, status);
      }
    }
  }

  console.log(`\n${touched} entrée(s) ${APPLY ? 'recalculées' : 'à recalculer'}.`);
  if (!touched) console.log('Rien à faire.');
  else if (!APPLY) console.log('Relancer avec --apply pour écrire en base.');
  process.exit(0);
})().catch(err => {
  console.error('Échec du recalcul :', err);
  process.exit(1);
});
