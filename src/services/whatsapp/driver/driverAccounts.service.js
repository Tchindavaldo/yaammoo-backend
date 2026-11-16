// Comptes des livreurs des boutiques WhatsApp. Ajout par le marchand (agent IA) : compte
// trouvé par numéro, sinon créé (numéro seul, connexion plus tard par code comme
// /auth/phone), puis rattaché (driverRecruit `add`). Numéro OM / MoMo validé SANS code par
// WhatsApp : le numéro d'où le livreur écrit (WhatsApp le prouve), ou un autre numéro prouvé
// par « NUMERO <jeton> » envoyé DEPUIS lui (wa_number_claims, migration 093). Un livreur ne
// livre qu'avec un numéro validé : c'est là que part la part de la boutique (orderPayout).
// Doc : architecture/whatsapp-ai.md (« Livreurs »).
const { admin } = require('../../../config/firebase');
const repos = require('../../../repositories');
const mobilewallet = require('../../transaction/mobilewalletService');
const wa = require('../whatsappModule.client');
const { onText, onSendFailed } = require('../webhookEvents.service');
const { getOtpSettings, getSettings, KEYS } = require('../../settings/settings.service');
const { normalizePhoneNumber, phoneToNumero } = require('../../../utils/validator/validatePhoneNumber');
const { send, sendText } = require('../merchantChannel');
const dir = require('./driverDirectory');
const text = require('./driverMessages');

const OUT_OF_WINDOW = 131047;
const CLAIM_RE = /^\s*NUMERO\s+([A-Z0-9_-]{6,16})\s*$/i;

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

const claimTtl = async () => {
  const v = Number((await getSettings())[KEYS.WA_NUMBER_CLAIM_TTL_MINUTES]);
  return Number.isFinite(v) && v > 0 ? v : 30;
};

/** Enregistre le numéro OM / MoMo (E.164) comme validé pour le compte. */
const markPayout = async (uid, phone) => {
  await repos.payoutNumbers.markVerified(uid, phone);
  await repos.payoutNumbers.markWhatsapp(uid, phone, 'inbound');
};

/**
 * Le livreur donne son numéro OM / MoMo. Absent ou égal au numéro d'où il écrit : validé
 * tout de suite. Autre numéro : lien « NUMERO <jeton> » à envoyer depuis ce numéro.
 * @returns {Promise<{ ok, message, verified?, linkSent? }>}
 */
exports.registerPayoutNumber = async ({ driverUser, fromPhone, phone }) => {
  const uid = dir.uidOf(driverUser);
  const target = phone ? await toE164(phone) : fromPhone;
  if (!target) return { ok: false, message: `Numéro invalide : ${phone}` };
  const op = await mobilewallet.predictOperator({ phone: target });
  if (!op.success || !op.network) return { ok: false, message: `Le numéro ${target} n'est ni Orange Money ni MTN MoMo.` };
  if (target === fromPhone) {
    await markPayout(uid, target);
    dir.forgetDriver(fromPhone);
    return { ok: true, verified: true, message: `Numéro ${target} validé : la part de la boutique y arrivera au scan du QR code du client.` };
  }
  const ttl = await claimTtl();
  const claim = await repos.waNumberClaims.create({ userId: uid, phone: target, ttlMinutes: ttl });
  const yam = await wa.myPhone();
  if (!yam) return { ok: false, message: 'Lien de validation indisponible pour le moment.' };
  const link = `https://wa.me/${yam.replace(/\D/g, '')}?text=${encodeURIComponent(text.claimText(claim.token))}`;
  const r = await sendText(fromPhone, text.claimInstructions(target, link, ttl), 'ai');
  return r.ok ? { ok: true, verified: false, linkSent: true, message: 'Lien de validation envoyé au livreur.' } : { ok: false, message: "L'envoi du lien a échoué." };
};

/** « NUMERO <jeton> » reçu : valide le numéro s'il vient bien de lui. true si c'était ce message. */
const onClaimText = async event => {
  const match = CLAIM_RE.exec(event.text || '');
  if (!match) return false;
  const claim = await repos.waNumberClaims.getByToken(match[1].toUpperCase());
  if (!claim || claim.usedAt || new Date(claim.expiresAt).getTime() < Date.now()) {
    await sendText(event.from, "Ce lien a expiré ou a déjà servi : redemandez-en un à l'assistant Yaammoo.");
    return true;
  }
  if (claim.phone !== event.from) {
    await sendText(event.from, `Ce message doit être envoyé depuis le numéro ${claim.phone}.`);
    return true;
  }
  if (!(await repos.waNumberClaims.markUsed(claim.token))) return true;
  await markPayout(claim.userId, claim.phone);
  const user = await repos.users.getUserByIdSafe(claim.userId);
  const driverPhone = await dir.phoneOfUser(user);
  if (driverPhone) dir.forgetDriver(driverPhone);
  await sendText(event.from, `Numéro ${claim.phone} validé pour les versements de ${dir.nameOf(user)}.`);
  if (driverPhone && driverPhone !== event.from) await sendText(driverPhone, `Votre numéro de paiement ${claim.phone} est validé : la part de la boutique y arrivera au scan du QR code du client.`);
  return true;
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
  onText(onClaimText);
  onSendFailed(onFailed);
};
