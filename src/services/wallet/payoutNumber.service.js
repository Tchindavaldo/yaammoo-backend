// Vérification d'un numéro de retrait (Orange Money / MTN MoMo) par code SMS.
// Réutilise la mécanique OTP de la connexion (cooldown, coût Bird journalisé
// dans `bird_costs` avec le userId du marchand), SANS connexion ni création de
// compte : un code valide marque seulement le numéro vérifié (migration 079).
const repos = require('../../repositories');
const { requestPhoneAuth } = require('../auth/phoneAuth.service');
const { verifyPhoneOtp } = require('../notification/bird/verifyOtp.service');
const { getVerificationDetails } = require('../notification/bird/getVerification.service');
const { recordVerificationCost } = require('../notification/bird/birdCost.service');
const settingsService = require('../settings/settings.service');
const { normalizePhoneNumber } = require('../../utils/validator/validatePhoneNumber');

const smsFee = require('./smsFee.service');

/**
 * Envoie le code par SMS uniquement. Chaque envoi est facturé au marchand au
 * coût réel Bird (smsFee.service, CGU 12.5 bis), débité du réseau vérifié.
 * `whatsappShortcut` (app >= payout_number_whatsapp_min_app_version, R11) : un numéro
 * déjà validé sur WhatsApp par ce compte est vérifié tout de suite, sans SMS ni frais
 * (réponse `verified: true`, migration 093).
 */
exports.requestPayoutNumberCode = async ({ userId, phoneNumber, network, whatsappShortcut = false }) => {
  if (!['orange', 'mtn'].includes(network)) return { success: false, message: 'Réseau requis : orange ou mtn' };
  if (whatsappShortcut) {
    const { defaultCountryCode } = await settingsService.getOtpSettings();
    const recipient = normalizePhoneNumber(phoneNumber, defaultCountryCode);
    const onWhatsapp = recipient && (await repos.payoutNumbers.listWhatsappByUser(userId)).some(n => n.phoneNumber === recipient);
    if (onWhatsapp) {
      await repos.payoutNumbers.markVerified(userId, recipient);
      return { success: true, message: 'Numéro vérifié (déjà validé sur WhatsApp)', data: { verified: true, phoneNumber: recipient } };
    }
  }
  const r = await requestPhoneAuth({ phoneNumber, channel: 'sms', userId });
  if (r.success) await smsFee.markPayoutSend(r.data?.verificationId, network);
  return r;
};

/** Estimation des frais d'un code, affichée avant l'envoi. */
exports.estimatePayoutNumberFee = () => smsFee.estimateSmsFee();

/** WhatsApp de la boutique : code envoyé sur WhatsApp UNIQUEMENT (aucun repli SMS). */
exports.requestWhatsappNumberCode = ({ userId, phoneNumber }) => requestPhoneAuth({ phoneNumber, channel: 'whatsapp', userId });

/** Valide le code puis enregistre le numéro comme vérifié pour ce compte. */
exports.verifyPayoutNumberCode = args => verifyCode(args, (userId, recipient) => repos.payoutNumbers.markVerified(userId, recipient));

/** Idem pour le WhatsApp ; garde-fou : un code livré par SMS ne vérifie pas un WhatsApp. */
exports.verifyWhatsappNumberCode = args =>
  verifyCode(args, async (userId, recipient, deliveredChannel) => {
    if (deliveredChannel && deliveredChannel !== 'whatsapp') {
      const m = "Le code n'est pas arrivé par WhatsApp. Réessayez avec un numéro WhatsApp.";
      return { success: false, message: m, data: { reason: m } };
    }
    await repos.verifiedNumbers.markWhatsapp(userId, recipient, 'otp');
    return null;
  });

async function verifyCode({ userId, phoneNumber, code }, onVerified) {
  const { defaultCountryCode } = await settingsService.getOtpSettings();
  const recipient = normalizePhoneNumber(phoneNumber, defaultCountryCode);
  if (!recipient) return { success: false, message: `Numéro de téléphone invalide : ${phoneNumber}` };
  if (!code) return { success: false, message: 'Le code de vérification est requis' };

  let verificationId = null;
  try {
    verificationId = (await repos.phoneOtp.getByPhone(recipient))?.verificationId || null;
  } catch (e) {
    console.warn(`[PAYOUT-NUMBER] Lecture de la demande impossible : ${e.message}`);
  }
  const verified = await verifyPhoneOtp({ phoneNumber: recipient, code });
  if (!verified.success) {
    return { success: false, message: verified.message, data: { reason: verified.data?.reason || null, attemptsRemaining: verified.data?.attemptsRemaining ?? null } };
  }
  verificationId = verificationId || verified.data?.verificationId;
  let deliveredChannel = null;
  if (verificationId) {
    const details = await getVerificationDetails({ verificationId });
    if (details.success) deliveredChannel = (await recordVerificationCost({ verificationId, verification: details.data.raw, verified: true, userId })).deliveredChannel;
    await smsFee.chargePendingSmsFees(verificationId).catch(e => console.warn(`[PAYOUT-NUMBER] frais SMS : ${e.message}`));
  }
  const refused = await onVerified(userId, recipient, deliveredChannel);
  if (refused) return refused;
  return { success: true, message: 'Numéro vérifié', data: { phoneNumber: recipient } };
}

/** true si le numéro de retrait est vérifié pour ce compte. */
exports.isPayoutNumberVerified = async (userId, phone) => {
  const { defaultCountryCode } = await settingsService.getOtpSettings();
  const recipient = normalizePhoneNumber(phone, defaultCountryCode);
  if (!recipient) return false;
  return repos.payoutNumbers.isVerified(userId, [recipient]);
};
