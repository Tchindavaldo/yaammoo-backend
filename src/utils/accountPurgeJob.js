// ============================================================================
// accountPurgeJob — efface les comptes supprimés arrivés à échéance
// ============================================================================
// Un compte supprimé est archivé (account_archives, migration 080) : 10 ans si
// ses paiements réels s'étalent sur au moins 1 an, sinon 90 jours. À
// `retain_until`, toutes ses données (commandes, transactions, boutiques...)
// sont effacées. Tourne une fois par jour dans le process API.
// ============================================================================
const repos = require('../repositories');

const DAY_MS = 86400000;
let timer = null;

async function runOnce() {
  try {
    const expired = await repos.accountArchives.listExpired();
    for (const a of expired) {
      await repos.accountArchives.purge(a.uid, a.fastfood_ids || []);
      console.log(`[accountPurge] compte ${a.uid} effacé (échéance de conservation)`);
    }
  } catch (error) {
    console.error('[accountPurge] échec :', error.message);
  }
}

exports.startAccountPurgeJob = () => {
  if (timer) return;
  setTimeout(runOnce, 60000);
  timer = setInterval(runOnce, DAY_MS);
};
exports.runAccountPurgeOnce = runOnce;
