// Mode des marchands et livreurs WhatsApp (migration 102, décision du 18/11/2026) : « les 2 »
// (WhatsApp + app, défaut) ou « app seule ». À chaque connexion à l'app par code
// (auth/phoneAuth.service.verifyPhoneAuth), l'agent demande sur WhatsApp s'il garde le mode
// WhatsApp. App seule : boutique WhatsApp coupée (marchand), plus aucun envoi
// (merchantChannel.send). S'il écrit ensuite, on propose de réactiver. Enregistré par
// merchantOrders.registerMerchantFlows, avant l'agent des boutiques.
const repos = require('../../repositories');
const { onButton, onText } = require('./webhookEvents.service');
const { send, shopNumber, forgetAppOnly } = require('./merchantChannel');
const { driverOfPhone, forgetDriver, phoneOfUser } = require('./driver/driverDirectory');
const { isAdminPhone } = require('./admin/adminAlerts.service');

const ASK = "Nous avons détecté une connexion dans l'application Yaammoo. Voulez-vous conserver le mode WhatsApp ?";
const BOTH = 'Mode WhatsApp conservé : vous recevez tout sur WhatsApp et dans l\'application.';
const APP = "C'est noté : vous êtes en mode application seule. Plus rien ne vous arrivera sur WhatsApp. Écrivez-nous ici pour le réactiver.";

const buttons = (to, body, list) => send({ to, type: 'interactive', interactive: { kind: 'buttons', body, buttons: list } }, 'Mode WhatsApp', 'system', { force: true });
const text = (to, body) => send({ to, type: 'text', text: { body } }, 'Mode WhatsApp', 'system', { force: true });

/** Rôles WhatsApp de ce compte : [{ role, phone, fastFoodId }] (marchand, livreur). */
const rolesOf = async uid => {
  const out = [];
  const shop = await repos.fastfoods.getByUserId(uid);
  const shopPhone = shop ? await shopNumber(shop) : null;
  if (shopPhone && shop.whatsappOrders === true) out.push({ role: 'merchant', phone: shopPhone, fastFoodId: shop.id });
  const user = await repos.users.getUserByIdSafe(uid);
  const phone = await phoneOfUser(user);
  if (phone && (await driverOfPhone(phone))) out.push({ role: 'driver', phone, fastFoodId: null });
  return out;
};

/** Connexion à l'app par code : demande sur WhatsApp s'il garde le mode WhatsApp. */
exports.onAppLogin = async uid => {
  if (!uid || (await repos.waAppOnly.get(uid))) return;
  for (const r of await rolesOf(uid)) {
    if (await isAdminPhone(r.phone)) continue; // un super-admin garde toujours WhatsApp
    await buttons(r.phone, ASK, [
      { id: `${uid}:ch_both`, title: 'Oui, garder les 2' },
      { id: `${uid}:ch_app`, title: 'Non, app seule' },
    ]);
    return; // un seul message, même s'il est marchand et livreur sur le même numéro
  }
};

/** Le clic vient-il bien du numéro de ce compte ? Renvoie ses rôles sur ce numéro. */
const rolesFrom = async (uid, from) => (await rolesOf(uid)).filter(r => r.phone === from);

const keepBoth = async ({ ref: uid, event }) => {
  if (!(await rolesFrom(uid, event.from)).length) return;
  await text(event.from, BOTH);
};

const appOnly = async ({ ref: uid, event }) => {
  const roles = await rolesFrom(uid, event.from);
  if (!roles.length) return;
  const { setWhatsappOrders } = require('./merchantShop.service');
  const shop = roles.find(r => r.role === 'merchant');
  if (shop) await setWhatsappOrders(shop.fastFoodId, false);
  await repos.waAppOnly.set({ userId: uid, phone: event.from, role: shop ? 'merchant' : 'driver', fastFoodId: shop?.fastFoodId || null });
  forgetAppOnly();
  forgetDriver(event.from);
  await text(event.from, APP);
  console.log(`✅ [WHATSAPP] ${uid} passe en mode app seule (${shop ? 'marchand' : 'livreur'})`);
};

const reactivate = async ({ ref: uid, event }) => {
  const row = await repos.waAppOnly.get(uid);
  if (!row || row.phone !== event.from) return;
  if (row.role === 'merchant' && row.fastFoodId) {
    const { setWhatsappOrders } = require('./merchantShop.service');
    const r = await setWhatsappOrders(row.fastFoodId, true);
    if (!r.success) return text(event.from, `Réactivation impossible : ${r.message}`);
  }
  await repos.waAppOnly.remove(uid);
  forgetAppOnly();
  forgetDriver(event.from);
  await text(event.from, 'Mode WhatsApp réactivé : vous recevez de nouveau tout sur WhatsApp, et toujours dans l\'application.');
  console.log(`✅ [WHATSAPP] ${uid} repasse en mode WhatsApp + app`);
};

/** Message d'un numéro en app seule : propose de réactiver WhatsApp (rien d'autre). */
const onAppOnlyText = async event => {
  const rows = await repos.waAppOnly.listByPhone(event.from);
  if (!rows.length) return false;
  const row = rows[0];
  await buttons(event.from, `Vous êtes en mode application seule : vos ${row.role === 'merchant' ? 'commandes' : 'courses'} n'arrivent plus sur WhatsApp. Voulez-vous réactiver le mode WhatsApp ?`, [
    { id: `${row.userId}:ch_wa`, title: 'Réactiver WhatsApp' },
  ]);
  return true;
};

exports.registerChannelModeFlows = () => {
  onButton('ch_both', keepBoth);
  onButton('ch_app', appOnly);
  onButton('ch_wa', reactivate);
  onText(onAppOnlyText);
};

