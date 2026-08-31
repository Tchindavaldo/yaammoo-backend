// ============================================================================
// deleteFastfood.service — Suppression ADMIN d'une ou plusieurs boutiques
// ============================================================================
// SOFT DELETE : la boutique et les données choisies sont marquées `deleted_at`,
// puis effacées définitivement après `FASTFOOD_DELETE_RETENTION_DAYS` jours.
// Tant que la purge n'est pas passée, `restoreFastfoodService` annule tout.
//
// Deux garde-fous non négociables :
//
//  1. **`scopes` est obligatoire.** Pas de « tout » implicite : un admin qui
//     omet le champ reçoit une erreur, jamais une suppression totale.
//  2. **Les données financières ne sont jamais touchées** — ni ici, ni à la
//     purge. `withdrawals`, `order_settlements`, `platform_revenues` et
//     `transactions` sont des pièces comptables : elles survivent à la boutique.
//     Aucun scope ne permet de les viser, même explicitement.
// ============================================================================

const repos = require('../../repositories');
const { deleteImageFromSupabase } = require('../images/uploadImage.service');
const { getFastfoodDeletionSettings } = require('../settings/settings.service');
const { getIO } = require('../../socket');

/**
 * Types de données qu'un admin peut emporter avec la boutique.
 * La boutique elle-même (`fastfoods`) part toujours : c'est l'objet de l'appel.
 */
const DELETABLE_SCOPES = ['menus', 'orders', 'notifications', 'bonus', 'drivers', 'support', 'deliveries'];

/**
 * Scopes refusés même s'ils sont demandés explicitement — voir garde-fou 2.
 * Listés pour renvoyer un message clair plutôt qu'un « scope inconnu » trompeur.
 */
const FINANCIAL_SCOPES = ['withdrawals', 'settlements', 'revenues', 'transactions'];

// ⚠️ La rétention vient de la BASE (`settings_deployment`, migration 048), pas
// de `.env` : allonger le délai pour sauver une boutique dont les 30 jours
// expirent ne doit pas demander un redéploiement. Elle est donc lue à chaque
// appel (le service settings met en cache), jamais figée au chargement du module.

/**
 * Valide la liste de scopes reçue.
 * @returns {{ scopes: string[] } | { error: string }}
 */
function normalizeScopes(input) {
  if (input === undefined || input === null) {
    return { error: `Le champ "scopes" est obligatoire : préciser ce qui doit être supprimé (${DELETABLE_SCOPES.join(', ')}), ou "all".` };
  }

  // `"all"` reste explicite : l'admin l'a écrit, ce n'est pas un défaut subi.
  if (input === 'all') return { scopes: [...DELETABLE_SCOPES] };

  if (!Array.isArray(input) || input.length === 0) {
    return { error: '"scopes" doit être un tableau non vide, ou la chaîne "all".' };
  }

  const financial = input.filter(s => FINANCIAL_SCOPES.includes(s));
  if (financial.length) {
    return {
      error: `Données financières non supprimables (${financial.join(', ')}) : ce sont des pièces comptables, elles survivent à la boutique.`,
    };
  }

  const unknown = input.filter(s => !DELETABLE_SCOPES.includes(s));
  if (unknown.length) {
    return { error: `Scope(s) inconnu(s) : ${unknown.join(', ')}. Valeurs acceptées : ${DELETABLE_SCOPES.join(', ')}.` };
  }

  return { scopes: [...new Set(input)] };
}

/**
 * Supprime (soft) une ou plusieurs boutiques.
 *
 * Chaque boutique est traitée séparément : une boutique introuvable n'annule
 * pas la suppression des autres, elle est reportée dans `skipped`. Le lot d'un
 * admin qui colle dix ids ne doit pas échouer entièrement sur une coquille.
 *
 * @param {Object} params
 * @param {string[]} params.fastFoodIds
 * @param {string[]|'all'} params.scopes
 * @returns {Promise<{deleted: Object[], skipped: Object[], retentionDays: number}>}
 */
exports.deleteFastfoodsService = async ({ fastFoodIds, scopes } = {}) => {
  const ids = Array.isArray(fastFoodIds) ? fastFoodIds.filter(Boolean) : [];
  if (ids.length === 0) throw new Error('Aucune boutique à supprimer : "fastFoodIds" doit contenir au moins un id.');

  const parsed = normalizeScopes(scopes);
  if (parsed.error) throw new Error(parsed.error);

  const deleted = [];
  const skipped = [];

  for (const id of ids) {
    try {
      const result = await repos.fastfoodDeletion.softDelete(id, parsed.scopes);
      if (!result?.found) {
        skipped.push({ id, reason: 'Boutique introuvable ou déjà supprimée.' });
        continue;
      }
      deleted.push({ id, deletedAt: result.deletedAt, counts: result.counts || {} });
    } catch (error) {
      skipped.push({ id, reason: error.message });
    }
  }

  // Le front doit retirer ces boutiques du home sans attendre un refresh.
  if (deleted.length) {
    try {
      // getIO() lève si le socket n'est pas initialisé — d'où le try/catch.
      getIO().emit('fastfoodsDeleted', { ids: deleted.map(d => d.id) });
    } catch (error) {
      // Socket indisponible : la suppression en base reste valide, on ne la
      // fait pas échouer pour un broadcast raté.
      console.error('deleteFastfoods: emit fastfoodsDeleted:', error.message);
    }
  }

  const { retentionDays } = await getFastfoodDeletionSettings();
  return { deleted, skipped, scopes: parsed.scopes, retentionDays };
};

/**
 * Annule une suppression tant que la purge n'est pas passée.
 *
 * ⚠️ Le lien `users.fastfood_id` n'est PAS rétabli automatiquement (le
 * propriétaire a pu créer une autre boutique entre-temps) : il est renvoyé
 * dans `ownerReattached: false` pour que l'admin le refasse sciemment.
 */
exports.restoreFastfoodService = async fastFoodId => {
  if (!fastFoodId) throw new Error('fastFoodId requis.');

  const result = await repos.fastfoodDeletion.restore(fastFoodId);
  if (!result?.restored) {
    throw new Error(result?.reason === 'not_deleted' ? "Cette boutique n'est pas supprimée." : 'Restauration impossible.');
  }

  const fastfood = await repos.fastfoodDeletion.getByIdIncludingDeleted(fastFoodId);
  return { fastfood, ownerReattached: false };
};

/**
 * Efface définitivement les boutiques marquées depuis plus de N jours.
 *
 * La fonction SQL supprime les lignes ET renvoie les URL des images à effacer :
 * Postgres n'ayant pas accès au bucket, le nettoyage des fichiers se fait ici,
 * APRÈS. Une image qui résiste laisse donc un fichier orphelin plutôt qu'une
 * ligne pointant vers un fichier disparu — elle est signalée dans `imageErrors`
 * pour un nettoyage manuel, sans faire échouer la purge.
 *
 * @param {Object} [opts]
 * @param {number} [opts.retentionDays] Surcharge ponctuelle ; par défaut, la
 *                 valeur en base (`settings_deployment`).
 */
exports.purgeDeletedFastfoodsService = async ({ retentionDays } = {}) => {
  const effectiveRetention = Number.isFinite(retentionDays) && retentionDays >= 0 ? retentionDays : (await getFastfoodDeletionSettings()).retentionDays;

  const result = await repos.fastfoodDeletion.purgeExpired(effectiveRetention);
  const imageErrors = [];

  for (const url of result?.imageUrls || []) {
    try {
      await deleteImageFromSupabase(url);
    } catch (error) {
      imageErrors.push({ url, reason: error.message });
    }
  }

  return {
    purged: result?.purged || 0,
    ids: result?.ids || [],
    imagesDeleted: (result?.imageUrls || []).length - imageErrors.length,
    imageErrors,
    retentionDays: effectiveRetention,
  };
};

/** Boutiques en corbeille, avec le nombre de jours restants avant purge. */
exports.listDeletedFastfoodsService = async () => {
  const [rows, { retentionDays }] = await Promise.all([repos.fastfoodDeletion.listDeleted(), getFastfoodDeletionSettings()]);
  const now = Date.now();

  return rows.map(row => {
    const elapsedDays = (now - new Date(row.deletedAt).getTime()) / 86400000;
    return {
      ...row,
      daysUntilPurge: Math.max(0, Math.ceil(retentionDays - elapsedDays)),
    };
  });
};

exports.DELETABLE_SCOPES = DELETABLE_SCOPES;
