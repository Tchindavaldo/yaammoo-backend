// Alertes WhatsApp aux super-administrateurs (migration 098, numéros `ai_admin_phones`) :
// l'agent d'une boutique ou d'un livreur bute sur un problème grave (outil alert_admin),
// ou un utilisateur écrit au support de la plateforme (notifySupportMessage). Fenêtre de
// 24 h ouverte : le détail part tout de suite ; sinon template `yam_alerte_admin` dont le
// bouton « Voir » envoie le détail. L'administrateur répond ensuite à l'agent admin
// (ai/adminAgent.service.js). Doc : architecture/whatsapp-ai.md.
const repos = require('../../../repositories');
const { getAiSettings, getOtpSettings } = require('../../settings/settings.service');
const { normalizePhoneNumber } = require('../../../utils/validator/validatePhoneNumber');
const { onButton } = require('../webhookEvents.service');
const { send, sendText } = require('../merchantChannel');

const WINDOW_MS = 24 * 3600e3 - 10 * 60e3; // marge de 10 min avant la fermeture de la fenêtre
const SOURCE_LABEL = { merchant: 'boutique', driver: 'livreur', support: 'support' };
const oneLine = s => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Numéros E.164 des super-administrateurs. */
exports.adminPhones = async () => {
  const { adminPhones } = await getAiSettings();
  if (!adminPhones.length) return [];
  const { defaultCountryCode } = await getOtpSettings();
  return [...new Set(adminPhones.map(p => normalizePhoneNumber(p, defaultCountryCode)).filter(Boolean))];
};

/** Ce numéro est-il celui d'un super-administrateur ? */
exports.isAdminPhone = async phone => !!phone && (await exports.adminPhones()).includes(phone);

/** Fenêtre de 24 h ouverte avec ce numéro (dernier message reçu de lui) ? */
exports.windowOpen = async phone => {
  const last = await repos.waConversations.lastInboundAt(phone);
  return !!last && Date.now() - new Date(last).getTime() < WINDOW_MS;
};

/** Texte complet d'une alerte. */
const alertText = a =>
  [
    `Alerte Yaammoo (${SOURCE_LABEL[a.source] || a.source})`,
    a.summary,
    a.details && a.details !== a.summary ? `\n${a.details}` : null,
    `\nRéf. alerte : ${a.id}${a.sourcePhone ? ` · WhatsApp ${a.sourcePhone}` : ''}${a.threadId ? ` · fil support ${a.threadId}` : ''}`,
    'Dites-moi quoi répondre ou quoi faire : je vous proposerai l’action à confirmer.',
  ]
    .filter(Boolean)
    .join('\n');

/**
 * Crée l'alerte et prévient chaque super-administrateur. `who` = qui écrit (boutique,
 * livreur, client du support), `summary` = le problème en une phrase. Ne lève jamais.
 */
exports.alertAdmins = async ({ source, sourcePhone = null, fastFoodId = null, threadId = null, who, summary, details = '' }) => {
  try {
    const phones = await exports.adminPhones();
    if (!phones.length) {
      console.warn(`⚠️ [ADMIN] alerte ${source} sans administrateur (ai_admin_phones vide) : ${oneLine(summary)}`);
      return null;
    }
    const alert = await repos.waAdminAlerts.create({ source, sourcePhone, fastFoodId, threadId, summary: `${oneLine(who)} : ${oneLine(summary)}`.slice(0, 500), details: String(details || '').slice(0, 2000) });
    for (const to of phones) {
      if (await exports.windowOpen(to)) {
        await sendText(to, alertText(alert));
        continue;
      }
      // Variables de template : une ligne, sans saut (règle Meta).
      await send(
        { to, type: 'template', reference: `adminalert_${alert.id}`, template: { name: 'yam_alerte_admin', language: 'fr', bodyParams: [oneLine(who).slice(0, 100), oneLine(summary).slice(0, 300)], buttons: [{ payload: `${alert.id}:adm_alert` }] } },
        `Alerte admin ${alert.id}`
      );
    }
    return alert;
  } catch (e) {
    console.error(`❌ [ADMIN] alerte ${source} : ${e.message}`);
    return null;
  }
};

/** Bouton « Voir » du template : détail de l'alerte, à un administrateur seulement. */
const onAlertButton = async ({ ref, event }) => {
  if (!(await exports.isAdminPhone(event.from))) return console.warn(`⚠️ [ADMIN] bouton d'alerte ${ref} depuis ${event.from} : pas un administrateur`);
  const alert = await repos.waAdminAlerts.getById(ref);
  await sendText(event.from, alert ? alertText(alert) : 'Alerte introuvable (effacée).');
};

exports.alertText = alertText;
exports.registerAdminAlertFlows = () => onButton('adm_alert', onAlertButton);
