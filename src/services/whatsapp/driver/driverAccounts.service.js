// Comptes des livreurs des boutiques WhatsApp. Ajout par le marchand (agent IA) : compte
// trouvé par numéro, sinon créé (numéro seul, connexion plus tard par code comme
// /auth/phone), puis rattaché (driverRecruit `add`). Numéro OM / MoMo : celui d'où le livreur
// écrit est validé sans code (WhatsApp le prouve) ; un autre numéro reçoit un code SMS, que
// le livreur renvoie à l'agent (frais SMS à la boutique, décision du 16/11/2026). Un livreur
// ne livre qu'avec un numéro validé : c'est là que part la part de la boutique (orderPayout).
// Doc : architecture/whatsapp-ai.md (« Livreurs »).
const { admin } = require('../../../config/firebase');
const repos = require('../../../repositories');
const mobilewallet = require('../../transaction/mobilewalletService');
const { onSendFailed } = require('../webhookEvents.service');
const { getOtpSettings } = require('../../settings/settings.service');
const { toBalanceKey } = require('../../../utils/mobileNetwork');
const { normalizePhoneNumber, phoneToNumero } = require('../../../utils/validator/validatePhoneNumber');
const { send } = require('../merchantChannel');
const dir = require('./driverDirectory');
const text = require('./driverMessages');

const OUT_OF_WINDOW = 131047;

const toE164 = async phone => {
  const { defaultCountryCode } = await getOtpSettings();
  return normalizePhoneNumber(phone, defaultCountryCode);
};

/** Compte créé par numéro seul (même uid que /auth/phone : `ph_<numéro>`). */
const createPhoneAccount = async (phone, { nom, prenom }) => {
  const uid = `ph_${phone.replace('+', '')}`;
  try {
    await admin.auth().createUser({ uid, phoneNumber: phone });
  } catch (e) {
    if (e.code !== 'auth/uid-already-exists' && e.code !== 'auth/phone-number-already-exists') throw e;
  }
  const existing = await repos.users.getUserByIdSafe(uid);
  if (existing) return existing;
  const user = {
    uid,
    id: uid,
    infos: { nom: nom || null, prenom: prenom || null, age: null, numero: phoneToNumero(phone), email: null, password: null },
    fastFoodId: null,
    statistique: 100,
    cmd: [],
    authProvider: 'phone',
    phoneNumber: phone,
    createdAt: new Date().toISOString(),
  };
  await repos.users.createUser(user);
  console.log(`✅ [WHATSAPP] Compte livreur créé ${uid} (${phone})`);
  return user;
};

/**
 * Le marchand ajoute un livreur à sa boutique. Le livreur reçoit un message de bienvenue
 * (template yam_livreur_ajoute hors fenêtre de 24 h).
 * @returns {Promise<{ ok, message?, already?, name?, payoutReady? }>}
 */
exports.addDriver = async ({ fastFood, phone, nom, prenom }) => {
  const e164 = await toE164(phone);
  if (!e164) return { ok: false, message: `Numéro invalide : ${phone}` };
  const user = (await dir.userOfPhone(e164)) || (await createPhoneAccount(e164, { nom, prenom }));
  const { recruitDriver } = require('../../driver/driverRecruit.service');
  const r = await recruitDriver(fastFood.id, { mode: 'add', phoneNumber: e164 });
  if (!r.success && r.code !== 409) return { ok: false, message: r.message };
  dir.forgetDriver(e164);
  const payoutReady = await dir.hasPayoutNumber(dir.uidOf(user));
  await send({ to: e164, type: 'text', reference: `drvwelcome_${fastFood.id}`, text: { body: text.welcome(fastFood.name, payoutReady) } }, 'Bienvenue livreur');
  return { ok: true, already: r.code === 409, name: dir.nameOf(user), payoutReady };
};

/** Enregistre le numéro OM / MoMo (E.164) comme validé pour le compte. */
const markPayout = async (uid, phone) => {
  await repos.payoutNumbers.markVerified(uid, phone);
  await repos.payoutNumbers.markWhatsapp(uid, phone, 'inbound');
};

/**
 * Le livreur donne son numéro OM / MoMo. Absent ou égal au numéro d'où il écrit : validé
 * tout de suite (WhatsApp le prouve), sans SMS. Autre numéro : code SMS (mêmes envois que
 * /wallet/payout-number/request), facturé à la boutique `billUserId` ; il renvoie le code à
 * l'agent (verifyPayoutCode).
 * @returns {Promise<{ ok, message, verified?, codeSent? }>}
 */
exports.registerPayoutNumber = async ({ driverUser, fromPhone, phone, billUserId }) => {
  const uid = dir.uidOf(driverUser);
  const target = phone ? await toE164(phone) : fromPhone;
  if (!target) return { ok: false, message: `Numéro invalide : ${phone}` };
  const op = await mobilewallet.predictOperator({ phone: target });
  const network = toBalanceKey(op.network);
  if (!op.success || !network) return { ok: false, message: `Le numéro ${target} n'est ni Orange Money ni MTN MoMo.` };
  if (target === fromPhone) {
    await markPayout(uid, target);
    dir.forgetDriver(fromPhone);
    return { ok: true, verified: true, message: `Numéro ${target} validé : la part de la boutique y arrivera au scan du QR code du client.` };
  }
  const { requestPayoutNumberCode } = require('../../wallet/payoutNumber.service');
  const r = await requestPayoutNumberCode({ userId: uid, phoneNumber: target, network, billUserId });
  if (r.code === 'cooldown') return { ok: false, message: `Un code vient déjà d'être envoyé au ${target} : réessayez dans ${r.data?.retryAfter ?? 60} s.` };
  if (!r.success) return { ok: false, message: r.message || "L'envoi du code a échoué." };
  return { ok: true, verified: false, codeSent: true, message: `Code envoyé par SMS au ${target} : il doit le renvoyer ici.` };
};

/** Code SMS renvoyé par le livreur : valide le numéro OM / MoMo pour son compte. */
exports.verifyPayoutCode = async ({ driverUser, fromPhone, phone, code, billUserId }) => {
  const target = await toE164(phone);
  if (!target) return { ok: false, message: `Numéro invalide : ${phone}` };
  const { verifyPayoutNumberCode } = require('../../wallet/payoutNumber.service');
  const r = await verifyPayoutNumberCode({ userId: dir.uidOf(driverUser), phoneNumber: target, code: String(code || '').replace(/\s/g, ''), billUserId });
  if (!r.success) {
    const left = r.data?.attemptsRemaining;
    return { ok: false, message: `Code refusé${left != null ? ` (${left} essai(s) restant(s))` : ''}.` };
  }
  dir.forgetDriver(fromPhone);
  return { ok: true, message: `Numéro ${target} validé : la part de la boutique y arrivera au scan du QR code du client.` };
};

/** Bienvenue refusée hors fenêtre de 24 h : template yam_livreur_ajoute (boutique). */
const onFailed = async event => {
  if (Number(event.error?.code) !== OUT_OF_WINDOW || !event.reference?.startsWith('drvwelcome_')) return false;
  const shop = await repos.fastfoods.getById(event.reference.slice('drvwelcome_'.length));
  const to = event.to ? await toE164(String(event.to).startsWith('+') ? event.to : `+${String(event.to).replace(/\D/g, '')}`) : null;
  if (!shop || !to) return false;
  await send({ to, type: 'template', reference: `drvwelcometpl_${shop.id}`, template: { name: 'yam_livreur_ajoute', language: 'fr', bodyParams: [shop.name || 'Yaammoo'] } }, 'Bienvenue livreur (template)');
  return true;
};

exports.registerDriverAccountFlows = () => {
  onSendFailed(onFailed);
};
