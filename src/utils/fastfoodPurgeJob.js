// ============================================================================
// fastfoodPurgeJob — Efface définitivement les boutiques supprimées expirées
// ============================================================================
// La suppression admin d'une boutique est un SOFT DELETE (migration 047) :
// sans ce job, les lignes marquées resteraient en base indéfiniment et les
// images continueraient d'occuper le bucket.
//
// Le job tourne dans le process API plutôt que dans un cron externe : le
// backend tourne déjà en continu, et une purge manquée n'a aucune conséquence
// (les lignes sont simplement effacées au tour suivant). Un
// `POST /fastFood/admin/purge` permet de la déclencher à la demande.
//
// ⚠️ L'intervalle vient de la BASE (`settings_deployment`, migration 048), pas
// de `.env`. Il est donc relu à CHAQUE tour : changer la valeur en base se
// propage sans redémarrer le process — d'où un `setTimeout` réarmé plutôt qu'un
// `setInterval`, dont la période serait figée au démarrage.
// ============================================================================

const { purgeDeletedFastfoodsService } = require('../services/fastfood/deleteFastfood.service');
const { getFastfoodDeletionSettings } = require('../services/settings/settings.service');

let timer = null;
let stopped = false;

async function runOnce() {
  try {
    const result = await purgeDeletedFastfoodsService();
    if (result.purged > 0) {
      console.log(`[fastfoodPurge] ${result.purged} boutique(s) effacée(s), ${result.imagesDeleted} image(s) supprimée(s).`);
    }
    if (result.imageErrors.length) {
      // Les lignes sont parties, ces fichiers sont désormais orphelins dans le
      // bucket : on les journalise pour un nettoyage manuel.
      console.warn(`[fastfoodPurge] ${result.imageErrors.length} image(s) non supprimée(s) :`, result.imageErrors);
    }
  } catch (error) {
    // Un échec ne doit pas arrêter le job : le tour suivant réessaiera.
    console.error('[fastfoodPurge] échec :', error.message);
  }
}

/** Programme le tour suivant, en relisant l'intervalle courant. */
async function scheduleNext() {
  if (stopped) return;

  let intervalMs = 86400000;
  try {
    ({ purgeIntervalMs: intervalMs } = await getFastfoodDeletionSettings());
  } catch (error) {
    console.error('[fastfoodPurge] lecture des réglages impossible, repli 24h —', error.message);
  }

  // 0 en base = purge automatique désactivée. On ne réarme pas : redémarrer le
  // process (ou POST /fastFood/admin/purge) reste la voie de sortie.
  if (!intervalMs || intervalMs <= 0) {
    console.warn('[fastfoodPurge] intervalle à 0 : purge automatique désactivée.');
    return;
  }

  timer = setTimeout(async () => {
    await runOnce();
    scheduleNext();
  }, intervalMs);
  timer.unref?.(); // Ne retient pas le process à l'arrêt.
}

/**
 * Démarre la purge périodique.
 *
 * Le premier passage est différé d'un intervalle complet : au démarrage, le
 * process a mieux à faire que de balayer la base, et rien n'est urgent — les
 * lignes concernées attendent déjà depuis des semaines.
 */
exports.startFastfoodPurgeJob = () => {
  stopped = false;
  scheduleNext();
};

/** Arrête le job (tests, arrêt propre). */
exports.stopFastfoodPurgeJob = () => {
  stopped = true;
  if (timer) clearTimeout(timer);
  timer = null;
};
