// smsFeeJob : taux USD->XAF du jour (1x/jour) et débit des frais SMS des
// numéros de retrait (1x/h, coûts Bird résolus). Voir services/wallet/smsFee.service.js.
const svc = require('../services/wallet/smsFee.service');

const HOUR = 3600000;
let started = false;

async function hourly() {
  try {
    await svc.resolveAbandonedSends();
    await svc.chargePendingSmsFees();
  } catch (e) {
    console.error('[smsFeeJob] échec :', e.message);
  }
}

exports.startSmsFeeJob = () => {
  if (started) return;
  started = true;
  setTimeout(async () => { await svc.refreshUsdXafRate(); await hourly(); }, 90000);
  setInterval(svc.refreshUsdXafRate, 24 * HOUR);
  setInterval(hourly, HOUR);
};
