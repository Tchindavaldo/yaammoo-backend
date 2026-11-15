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

/** Envoie le code par SMS uniquement. */
exports.requestPayoutNumberCode = ({ userId, phoneNumber }) => requestPhoneAuth({ phoneNumber, channel: 'sms', userId });

/** Valide le code puis enregistre le numéro comme vérifié pour ce compte. */
exports.verifyPayoutNumberCode = async ({ userId, phoneNumber, code }) => {
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
  if (verificationId) {
    const details = await getVerificationDetails({ verificationId });
    if (details.success) await recordVerificationCost({ verificationId, verification: details.data.raw, verified: true, userId });
  }
  await repos.payoutNumbers.markVerified(userId, recipient);
  return { success: true, message: 'Numéro vérifié', data: { phoneNumber: recipient } };
};

/** true si le numéro de retrait est vérifié pour ce compte. */
exports.isPayoutNumberVerified = async (userId, phone) => {
  const { defaultCountryCode } = await settingsService.getOtpSettings();
  const recipient = normalizePhoneNumber(phone, defaultCountryCode);
  if (!recipient) return false;
  return repos.payoutNumbers.isVerified(userId, [recipient]);
};
