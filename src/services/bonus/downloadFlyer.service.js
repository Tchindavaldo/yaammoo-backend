// ============================================================================
// downloadFlyerService — Téléchargement du flyer d'un bonus `status_view`
// ============================================================================
// Le user récupère ici le flyer à poster en statut WhatsApp. L'appel n'est pas
// qu'une lecture : il HORODATE le départ du délai (`claimDelayHours`) — c'est ce
// timestamp que le claim vérifie pour s'assurer que le statut est bien resté
// publié. Sans cet enregistrement, n'importe qui pourrait claim dans la seconde.
//
// `downloadedAt` est figé au PREMIER téléchargement du cycle : re-télécharger le
// flyer ne rallonge ni ne raccourcit l'attente.
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { evaluateDownload, resolveCampaign, computeClaimableAt } = require('./statusViewSchedule.util');

// Message d'erreur par motif de refus : le front affiche la raison telle quelle.
const DOWNLOAD_REFUSAL = {
  inactive: "Ce bonus n'est pas actif.",
  download_closed: "La date de retrait du flyer est passée pour cette campagne.",
};

/**
 * @param {string} userId  uid du user courant
 * @param {string} bonusId id du bonus
 */
exports.downloadFlyerService = async (userId, bonusId) => {
  try {
    if (!userId) return { success: false, status: 401, message: 'Utilisateur non authentifié.' };
    if (!bonusId) return { success: false, status: 400, message: 'bonusId requis.' };

    const bonus = await repos.bonus.getById(bonusId);
    if (!bonus) return { success: false, status: 404, message: 'Bonus non trouvé.' };
    if (bonus.active === false) return { success: false, status: 400, message: "Ce bonus n'est pas actif." };
    if (!bonus.flyerUrl) return { success: false, status: 404, message: "Ce bonus n'a pas de flyer." };

    // Le retrait n'est ouvert que le jour de campagne — mais autant de fois qu'il
    // le faut dans la journée. `downloadedAt` reste figé au premier, donc
    // re-télécharger ne décale ni ne raccourcit rien.
    const { canDownload, reason } = evaluateDownload(bonus);
    if (!canDownload) {
      return { success: false, status: 400, message: DOWNLOAD_REFUSAL[reason] || 'Téléchargement indisponible.' };
    }

    const record = await repos.bonusFlyerDownloads.record(userId, bonusId);

    const delayHours = Number(bonus.claimDelayHours) || 0;
    const campaign = resolveCampaign(bonus);
    // Date à partir de laquelle le claim sera accepté : le front peut afficher un
    // compte à rebours sans recalculer la règle métier. Avec une campagne, elle
    // part de la fin du créneau de publication ; sinon du téléchargement.
    const claimableAt = (
      computeClaimableAt(bonus, campaign) || new Date(new Date(record.downloadedAt).getTime() + delayHours * 3600 * 1000)
    ).toISOString();

    const data = {
      bonusId,
      flyerUrl: bonus.flyerUrl,
      downloadedAt: record.downloadedAt,
      lastDownloadedAt: record.lastDownloadedAt,
      downloadCount: record.downloadCount,
      claimDelayHours: delayHours,
      claimableAt,
      // Créneau de publication (null si le bonus n'a pas de campagne) : le front
      // affiche « poste demain entre 18h et 21h » sans recalculer les dates.
      postWindow: campaign
        ? { date: campaign.postDate, start: campaign.postWindowStart.toISOString(), end: campaign.postWindowEnd.toISOString(), timezone: campaign.timezone }
        : null,
    };

    // Room nommée par l'uid, sans préfixe (cf. CLAUDE.md / socket.js) : le user
    // peut être sur plusieurs appareils, tous doivent voir le compte à rebours.
    try {
      getIO().to(userId).emit('bonus.flyer_downloaded', { data });
    } catch (err) {
      console.error('downloadFlyer: émission socket échouée (non bloquant):', err.message);
    }

    return { success: true, status: 200, message: 'Flyer téléchargé.', data };
  } catch (error) {
    console.error('Erreur dans downloadFlyerService:', error);
    return { success: false, status: 500, message: error.message || 'Erreur serveur lors du téléchargement du flyer.' };
  }
};
