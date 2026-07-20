// ============================================================================
// purge-bonus-consumption — Remet à zéro la consommation des réclamations
// ============================================================================
// Le modèle de consommation était RECALCULÉ : chaque réclamation repartait des
// commandes les plus anciennes de la fenêtre, sans savoir lesquelles avaient
// déjà été dépensées. Les mêmes commandes finançaient donc plusieurs paliers,
// et le total consommé pouvait dépasser le total réellement commandé — écrasant
// le solde affiché à 0.
//
// Le modèle est désormais SOLDÉ (`consumedOrderIds` sur chaque entrée). Ce
// script purge la consommation héritée de l'ancien modèle : les réclamations
// (codes, historique) sont CONSERVÉES, seuls les compteurs de consommation
// sont effacés, ce qui fait repartir le solde des users au brut.
//
// Idempotent : les entrées déjà purgées sont ignorées.
//
// Usage :
//   node scripts/purge-bonus-consumption.js          # simulation (dry-run)
//   node scripts/purge-bonus-consumption.js --apply  # écrit en base
// ============================================================================
require('dotenv').config();

const repos = require('../src/repositories');

const APPLY = process.argv.includes('--apply');

// Champs de consommation issus de l'ancien modèle recalculé.
const CONSUMPTION_FIELDS = ['consumedCount', 'consumedAmount', 'consumedOrderIds', 'target'];

function hasConsumption(entry) {
  return entry && CONSUMPTION_FIELDS.some(f => entry[f] != null);
}

(async () => {
  const requests = await repos.bonusRequests.getAll();
  console.log(`${requests.length} réclamation(s) trouvée(s)${APPLY ? '' : '  [DRY-RUN]'}\n`);

  let touched = 0;

  for (const request of requests) {
    const entries = Array.isArray(request.status) ? request.status : [];
    const dirty = entries.filter(hasConsumption);
    if (dirty.length === 0) continue;

    const purged = entries.map(e => {
      if (!hasConsumption(e)) return e;
      // On conserve l'entrée (statut, date, code associé) et on ne retire que
      // sa contrepartie consommée : le user garde son bonus, pas la dette.
      const { consumedCount, consumedAmount, consumedOrderIds, target, ...rest } = e;
      console.log(`- ${request.id} | bonus ${request.bonusId} | ${e.status} @ ${e.createdAt} -> purge (count=${consumedCount ?? '-'} amount=${consumedAmount ?? '-'})`);
      return rest;
    });

    if (APPLY) await repos.bonusRequests.updateUsage(request.id, {}, purged);
    touched += dirty.length;
  }

  console.log(`\n${touched} entrée(s) ${APPLY ? 'purgées' : 'à purger'}.`);
  if (!touched) console.log('Rien à faire.');
  else if (!APPLY) console.log('Relancer avec --apply pour écrire en base.');
  process.exit(0);
})().catch(err => {
  console.error('Échec de la purge :', err);
  process.exit(1);
});
