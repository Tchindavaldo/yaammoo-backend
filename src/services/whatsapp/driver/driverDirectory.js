// Livreurs des boutiques WhatsApp : numéro -> compte livreur et boutiques servies, numéro
// WhatsApp d'un compte, livreurs d'une boutique, numéro OM / MoMo validé. Un livreur est
// un user (`driverId` = son uid) rattaché par driver_applications `accepted` (drivers.md).
// Utilisé par l'agent IA (ai/), le journal (conversationLog.js) et « LIVRÉ ».
// Doc : architecture/whatsapp-ai.md (« Livreurs »).
const repos = require('../../../repositories');
const { getOtpSettings } = require('../../settings/settings.service');
const { normalizePhoneNumber, phoneVariants } = require('../../../utils/validator/validatePhoneNumber');

const uidOf = u => u?.uid || u?.id || null;

/** « Paul Mbarga », sinon « Livreur ». */
const nameOf = user => [user?.infos?.prenom, user?.infos?.nom].filter(Boolean).join(' ').trim() || user?.displayName || 'Livreur';

/** Numéro WhatsApp E.164 d'un compte (phoneNumber, sinon infos.numero) ; null si absent. */
const phoneOfUser = async user => {
  const raw = String(user?.phoneNumber || user?.infos?.numero || '').trim();
  if (!raw || raw === '0') return null;
  const { defaultCountryCode } = await getOtpSettings();
  // `infos.numero` est un BIGINT : local (698087460) ou international sans « + » (237698087460).
  const digits = raw.replace(/\D/g, '');
  const intl = !raw.startsWith('+') && digits.length > 9 && digits.startsWith(String(defaultCountryCode).replace(/\D/g, ''));
  return normalizePhoneNumber(intl ? `+${digits}` : raw, defaultCountryCode);
};

/** Compte d'un numéro (toutes ses formes en base). */
const userOfPhone = async phone => {
  const { defaultCountryCode } = await getOtpSettings();
  return repos.users.getUserByAnyPhone(phoneVariants(phone, defaultCountryCode));
};

// Numéro E.164 -> { user, shops } (livreur d'au moins une boutique WhatsApp) ou null. Gardé 1 min.
const cache = new Map();
const driverOfPhone = async phone => {
  const hit = cache.get(phone);
  if (hit && Date.now() - hit.at < 60000) return hit.value;
  let value = null;
  const user = await userOfPhone(phone);
  if (user?.driverId) {
    const apps = await repos.driverApplications.getByUser(uidOf(user), { status: 'accepted' });
    const shops = (await Promise.all(apps.map(a => repos.fastfoods.getById(a.fastFoodId)))).filter(f => f?.whatsappOrders === true);
    if (shops.length) value = { user, shops };
  }
  cache.set(phone, { at: Date.now(), value });
  return value;
};
/** Oublie le cache d'un numéro (livreur ajouté, numéro validé). */
const forgetDriver = phone => cache.delete(phone);

/** true si le compte a au moins un numéro OM / MoMo validé (obligatoire pour livrer, R22). */
const hasPayoutNumber = async uid => (await repos.payoutNumbers.listByUser(uid)).length > 0;

/** Livreurs `accepted` d'une boutique : { user, uid, name, phone, payoutReady }. */
const shopDrivers = async fastFoodId => {
  const apps = await repos.driverApplications.getByFastFood(fastFoodId, { status: 'accepted' });
  const out = [];
  for (const a of apps) {
    const user = await repos.users.getUserByIdSafe(a.userId);
    if (!user) continue;
    const uid = uidOf(user);
    out.push({ user, uid, name: nameOf(user), phone: await phoneOfUser(user), payoutReady: await hasPayoutNumber(uid) });
  }
  return out;
};

/** Numéro WhatsApp du livreur assigné à la commande (null sans livreur). */
const driverPhoneOfOrder = async order => {
  if (!order?.driverId) return null;
  return phoneOfUser(await repos.users.getUserByIdSafe(order.driverId));
};

module.exports = { uidOf, nameOf, phoneOfUser, userOfPhone, driverOfPhone, forgetDriver, hasPayoutNumber, shopDrivers, driverPhoneOfOrder };
