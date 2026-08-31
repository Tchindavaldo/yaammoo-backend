// ============================================================================
// deleteFastfood.controller — Suppression ADMIN de boutiques
// ============================================================================
// Toutes les routes sont derrière `firebaseAuth` + `adminGuard` : supprimer une
// boutique emporte ses menus, ses commandes et ses notifications, ce n'est
// jamais une action de marchand.
//
// La suppression est un SOFT DELETE annulable pendant
// `FASTFOOD_DELETE_RETENTION_DAYS` jours — voir le service pour les garde-fous
// (scope obligatoire, données financières intouchables).
// ============================================================================

const { deleteFastfoodsService, restoreFastfoodService, purgeDeletedFastfoodsService, listDeletedFastfoodsService } = require('../../services/fastfood/deleteFastfood.service');

/**
 * DELETE /fastFood/admin
 * Body : { fastFoodIds: string[], scopes: string[] | 'all' }
 *
 * Les ids passent par le BODY et non par l'URL : la route accepte un lot, et
 * une suppression ne doit pas finir dans un log d'accès ou un historique de
 * navigateur.
 */
exports.deleteFastfoodsController = async (req, res) => {
  try {
    const { fastFoodIds, scopes } = req.body || {};
    const result = await deleteFastfoodsService({ fastFoodIds, scopes });

    // 207 : le lot peut être partiellement appliqué (ids inconnus en `skipped`).
    const status = result.skipped.length && result.deleted.length ? 207 : 200;

    return res.status(status).json({
      success: true,
      message: `${result.deleted.length} boutique(s) supprimée(s), ${result.skipped.length} ignorée(s). Restaurable pendant ${result.retentionDays} jours.`,
      data: result,
    });
  } catch (error) {
    // Les erreurs du service sont des refus de validation (scope manquant,
    // scope financier, liste vide) — donc 400, pas 500.
    console.error('deleteFastfoods:', error.message);
    return res.status(400).json({ success: false, message: error.message });
  }
};

/** POST /fastFood/admin/:fastFoodId/restore — annule avant la purge. */
exports.restoreFastfoodController = async (req, res) => {
  try {
    const data = await restoreFastfoodService(req.params.fastFoodId);
    return res.status(200).json({
      success: true,
      message: 'Boutique restaurée. Le propriétaire doit être rattaché manuellement si nécessaire.',
      data,
    });
  } catch (error) {
    console.error('restoreFastfood:', error.message);
    return res.status(400).json({ success: false, message: error.message });
  }
};

/** GET /fastFood/admin/deleted — corbeille, avec le décompte avant purge. */
exports.listDeletedFastfoodsController = async (req, res) => {
  try {
    const data = await listDeletedFastfoodsService();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('listDeletedFastfoods:', error.message);
    return res.status(500).json({ success: false, message: 'Erreur serveur.', error: error.message });
  }
};

/**
 * POST /fastFood/admin/purge — force la purge sans attendre le job.
 * Utile pour un test, ou pour libérer un nom de boutique repris ailleurs.
 */
exports.purgeDeletedFastfoodsController = async (req, res) => {
  try {
    const { retentionDays } = req.body || {};
    const data = await purgeDeletedFastfoodsService(retentionDays !== undefined ? { retentionDays: Number(retentionDays) } : {});
    return res.status(200).json({
      success: true,
      message: `${data.purged} boutique(s) effacée(s) définitivement.`,
      data,
    });
  } catch (error) {
    console.error('purgeDeletedFastfoods:', error.message);
    return res.status(500).json({ success: false, message: 'Erreur serveur.', error: error.message });
  }
};
