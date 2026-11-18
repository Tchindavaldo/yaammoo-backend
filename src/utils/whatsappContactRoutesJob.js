// ============================================================================
// whatsappContactRoutesJob — numéros admin fixés sur la clé de CE backend
// ============================================================================
// Yaammoo prod et test partagent le même numéro WhatsApp : le module relaie un message reçu
// au backend qui a écrit en dernier au contact. Les super-administrateurs de ce backend
// (`ai_admin_phones`) y sont donc fixés (PUT /contact-routes du module) : au démarrage, puis
// toutes les 15 min (un réglage changé en base est pris au plus tard 15 min après).
// Un clic de bouton reste au backend qui a envoyé le message. Démarré par src/server.js.
// `wa_pin_admin_phones` = false : rien n'est fixé ici (même admin en prod et en test).
// Doc : architecture/whatsapp-ai.md (« Agent admin et alertes »).
// ============================================================================
const wa = require('../services/whatsapp/whatsappModule.client');
const repos = require('../repositories');
const { adminPhones } = require('../services/whatsapp/admin/adminAlerts.service');
const { getAiSettings } = require('../services/settings/settings.service');

const EVERY_MS = 15 * 60e3;
const FIRST_MS = 20e3;
let last = null; // dernière liste envoyée avec succès : journalisée seulement quand elle change

async function runOnce() {
  // wa_pin_admin_phones = false (migration 103) : ce backend ne fixe rien (et ne retire rien).
  if (!(await getAiSettings()).pinAdminPhones) return;
  // Admin parti sur l'autre backend (« passe en test », migration 104) : pas repris, sauf s'il
  // est déjà revenu (fixé ici, liste du module).
  const [admins, away, mine] = await Promise.all([adminPhones(), repos.waAdminAway.listPhones(), wa.listContactRoutes()]);
  if (!mine.ok) return; // liste du module illisible : rien ne bouge ce tour-ci
  const here = new Set(mine.data?.contacts || []);
  const phones = admins.filter(p => !away.includes(p) || here.has(p));
  const r = await wa.setContactRoutes(phones);
  const sent = JSON.stringify(phones);
  if (r.ok && sent !== last) console.log(`[whatsappContactRoutes] ${phones.length} numéro(s) admin fixé(s) sur ce backend`);
  if (r.ok) last = sent;
}

exports.startWhatsappContactRoutesJob = () => {
  const tick = async () => {
    await runOnce().catch(e => console.error('[whatsappContactRoutes] échec :', e.message));
    setTimeout(tick, EVERY_MS).unref?.();
  };
  setTimeout(tick, FIRST_MS).unref?.();
};
exports.runWhatsappContactRoutesOnce = runOnce;
