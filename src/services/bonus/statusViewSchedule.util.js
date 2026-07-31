// ============================================================================
// statusViewSchedule.util — Campagne d'un bonus `status_view`
// ============================================================================
// Un bonus `status_view` n'est plus permanent : il porte une CAMPAGNE datée,
// décrite dans `criteria.schedule` (JSONB, aucune migration nécessaire) :
//
//   {
//     "downloadDate": "2026-08-05",              // date précise de retrait du flyer
//     "postDate":     "2026-08-06",              // optionnel — défaut J+1
//     "postWindow":  { "start": "18:00", "end": "21:00" },
//     "timezone":    "Africa/Douala"             // défaut si absent
//   }
//
// Déroulé :
//   J  = `downloadDate`  → le user peut télécharger le flyer. Passé ce jour, non.
//   `postDate`, dans `postWindow` → il poste le flyer en statut. Par DÉFAUT le
//   lendemain du retrait (J+1), mais la date peut être fixée explicitement.
//   Le délai `claimDelayHours` part de la FIN du créneau (`postWindow.end`) du
//   J+1 : on ne sait pas à quelle minute il a réellement posté, et prendre le
//   point le plus tardif du créneau garantit que le statut a bien tenu la durée
//   annoncée quel que soit le moment du post.
//
// Toutes les dates sont interprétées dans le fuseau du bonus (défaut
// `Africa/Douala`) : une campagne annoncée « le 5 août à 18h » doit tomber à 18h
// pour le user, pas à 19h ou 17h selon l'UTC.
// ============================================================================

// Défaut plateforme. Volontairement une constante et non une env : c'est la
// valeur de repli d'un champ porté par le bonus, pas un réglage de déploiement.
const DEFAULT_TIMEZONE = 'Africa/Douala';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Décalage du fuseau (en minutes) à un instant donné. Passe par `Intl` plutôt que
 * par une table codée en dur : gère l'heure d'été des fuseaux qui en ont un.
 */
function timezoneOffsetMinutes(date, timeZone) {
  // `en-US` + `hour12: false` donne un format stable, indépendant de la locale
  // du serveur.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = {};
  for (const { type, value } of dtf.formatToParts(date)) parts[type] = value;
  // `hour` peut valoir "24" à minuit selon l'implémentation : on normalise.
  const hour = parts.hour === '24' ? 0 : Number(parts.hour);
  const asUTC = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second));
  return (asUTC - date.getTime()) / 60000;
}

/**
 * Convertit une date/heure LOCALE (dans `timeZone`) en instant UTC.
 * Deux passes : le décalage dépend de l'instant, qu'on ne connaît qu'après
 * l'avoir appliqué une première fois (bascule d'heure d'été).
 * @param {string} dateStr `YYYY-MM-DD`
 * @param {string} timeStr `HH:mm`
 * @returns {Date}
 */
function zonedTimeToUtc(dateStr, timeStr, timeZone) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0);
  let offset = timezoneOffsetMinutes(new Date(naive), timeZone);
  let utc = naive - offset * 60000;
  const corrected = timezoneOffsetMinutes(new Date(utc), timeZone);
  if (corrected !== offset) utc = naive - corrected * 60000;
  return new Date(utc);
}

/** Date du jour (`YYYY-MM-DD`) telle que vue dans `timeZone`. */
function todayInZone(now, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return dtf.format(now); // en-CA formate en YYYY-MM-DD
}

/** `YYYY-MM-DD` du lendemain, sans dépendance au fuseau (arithmétique de calendrier). */
function nextDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

/** @returns {Object|null} le bloc `schedule` du bonus, ou null s'il n'en a pas. */
function getSchedule(bonus) {
  const schedule = bonus?.criteria?.schedule;
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) return null;
  return schedule;
}

/**
 * Instants clés d'une campagne, tous en UTC.
 * @returns {null|{timezone:string, downloadDate:string, postDate:string,
 *                 postWindowStart:Date, postWindowEnd:Date, downloadDeadline:Date}}
 *          null si le bonus n'a pas de campagne exploitable.
 */
function resolveCampaign(bonus) {
  const schedule = getSchedule(bonus);
  if (!schedule) return null;

  const { downloadDate, postWindow } = schedule;
  if (!DATE_RE.test(downloadDate || '')) return null;
  if (!postWindow || !TIME_RE.test(postWindow.start || '') || !TIME_RE.test(postWindow.end || '')) return null;

  const timezone = schedule.timezone || DEFAULT_TIMEZONE;
  // Date de publication : explicite si fournie, sinon le LENDEMAIN du retrait —
  // le user a la journée pour récupérer le flyer, il publie le jour suivant.
  const postDate = DATE_RE.test(schedule.postDate || '') ? schedule.postDate : nextDay(downloadDate);

  return {
    timezone,
    downloadDate,
    postDate,
    postWindowStart: zonedTimeToUtc(postDate, postWindow.start, timezone),
    postWindowEnd: zonedTimeToUtc(postDate, postWindow.end, timezone),
    // Le téléchargement reste ouvert jusqu'à la fin du jour J (23:59 local).
    downloadDeadline: zonedTimeToUtc(downloadDate, '23:59', timezone),
  };
}

/**
 * Instant à partir duquel le claim est accepté.
 * Le délai part de la FIN du créneau de publication (point le plus tardif) :
 * quelle que soit l'heure réelle du post, le statut aura bien tenu `claimDelayHours`.
 * @returns {Date|null} null si le bonus n'a pas de campagne (ancien comportement).
 */
function computeClaimableAt(bonus, campaign = resolveCampaign(bonus)) {
  if (!campaign) return null;
  const delayHours = Number(bonus.claimDelayHours) || 0;
  return new Date(campaign.postWindowEnd.getTime() + delayHours * 3600 * 1000);
}

/**
 * Le user peut-il (encore) télécharger le flyer ?
 *
 * Le retrait est ouvert TANT QU'ON EST dans le jour `downloadDate` : le user peut
 * le télécharger autant de fois qu'il veut (il peut perdre l'image, changer
 * d'appareil…). Seule la date ferme le retrait, jamais le nombre de fois.
 * `downloadedAt` restant figé au premier, re-télécharger ne décale rien.
 *
 * @param {Object} bonus
 * @param {Object|null} download ligne `bonus_flyer_downloads` du user, si elle existe
 * @param {Date} [now]
 * @returns {{canDownload:boolean, reason:string|null}} `reason` : `inactive` |
 *          `download_closed` | null
 */
function evaluateDownload(bonus, download, now = new Date()) {
  if (bonus?.active === false) return { canDownload: false, reason: 'inactive' };

  const campaign = resolveCampaign(bonus);
  // Pas de campagne définie : ancien comportement (téléchargement libre tant que
  // le bonus a un flyer), sinon les bonus déjà en base deviendraient
  // inréclamables du jour au lendemain.
  if (!campaign) return { canDownload: true, reason: null };

  if (now > campaign.downloadDeadline) return { canDownload: false, reason: 'download_closed' };

  return { canDownload: true, reason: null };
}

/**
 * Le user peut-il envoyer sa vidéo preuve (= réclamer) ?
 * Vrai une fois le délai écoulé depuis la fin du créneau de publication. C'est le
 * pendant côté claim de `evaluateDownload` : le front active son bouton d'upload
 * sans avoir à recalculer la règle.
 *
 * ⚠️ Ne dit RIEN du flyer téléchargé ni de la vidéo fournie : ces contrôles
 * restent au claim (`checkProofDelay`), seul juge en écriture.
 * @returns {boolean}
 */
function canUploadProof(bonus, now = new Date()) {
  if (bonus?.active === false) return false;
  const claimableAt = computeClaimableAt(bonus);
  // Sans campagne, le délai court depuis le téléchargement : c'est le claim qui
  // tranche, on n'a pas l'info ici.
  if (!claimableAt) return false;
  return now >= claimableAt;
}

module.exports = {
  canUploadProof,
  DEFAULT_TIMEZONE,
  DATE_RE,
  TIME_RE,
  resolveCampaign,
  computeClaimableAt,
  evaluateDownload,
  todayInZone,
  nextDay,
  zonedTimeToUtc,
};
