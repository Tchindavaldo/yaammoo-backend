const repos = require('../../../repositories');
const { birdClient, formatBirdError } = require('./birdClient');
const { assertBirdConfig } = require('../../../config/bird');
const settingsService = require('../../settings/settings.service');
const { normalizePhoneNumber } = require('../../../utils/validator/validatePhoneNumber');

/** Motifs de refus renvoyés par Bird dans `reason`, traduits pour le client. */
const REASON_MESSAGES = {
  incorrect_code: 'Code OTP incorrect',
  expired: 'Code OTP expiré, demandez-en un nouveau',
  max_attempts_reached: 'Trop de tentatives, demandez un nouveau code',
  already_verified: 'Ce code a déjà été utilisé',
};

/**
 * Vérifie un code OTP auprès de la Verify API de Bird.
 *
 * La vérification s'appuie sur le même identifiant que l'envoi (numéro ou
 * e-mail) : aucun identifiant de vérification n'est à transmettre par le client.
 * Bird contrôle le code, son expiration et le nombre de tentatives.
 *
 * @param {object} params
 * @param {string} params.code
 * @param {string} [params.phoneNumber]
 * @param {string} [params.email]
 * @returns {Promise<{success: boolean, message: string, data?: object}>}
 */
exports.verifyPhoneOtp = async ({ phoneNumber, email, code }) => {
  try {
    assertBirdConfig();

    if (!code) {
      return { success: false, message: 'Le code OTP est requis' };
    }

    if (!phoneNumber && !email) {
      return { success: false, message: 'Un numéro de téléphone ou une adresse e-mail est requis' };
    }

    const to = {};
    let recipient = null;

    if (phoneNumber) {
      const { defaultCountryCode } = await settingsService.getOtpSettings();
      recipient = normalizePhoneNumber(phoneNumber, defaultCountryCode);
      if (!recipient) {
        return { success: false, message: `Numéro de téléphone invalide : ${phoneNumber}` };
      }
      to.phone_number = recipient;
    }

    if (email) {
      to.email_address = email;
    }

    const data = await birdClient.post('/v1/verify/verifications/check', {
      to,
      code: String(code),
    });

    // Bird répond en HTTP 200 même pour un code refusé. Le verdict est porté par
    // le booléen `success` ; l'état de la vérification est imbriqué sous
    // `verification` (et non à la racine).
    const verification = data?.verification || {};
    const verified = data?.success === true || verification.status === 'verified';

    // Une vérification aboutie consomme la demande : on retire la trace locale.
    if (verified && recipient) {
      await repos.phoneOtp.deleteByPhone(recipient).catch(err => console.warn(`⚠️ [BIRD-OTP] Nettoyage impossible : ${err.message}`));
    }

    const reason = data?.reason || null;
    const attemptsRemaining = data?.attempts_remaining ?? null;

    console.log(`${verified ? '✅' : '⚠️'} [BIRD-OTP] Vérification ${recipient || email} : ` + `${verification.status || 'inconnu'}${reason ? ` (${reason})` : ''}`);

    return {
      success: verified,
      message: verified ? 'Code OTP validé' : REASON_MESSAGES[reason] || 'Code OTP invalide ou expiré',
      data: {
        status: verification.status || null,
        reason,
        attemptsRemaining,
        verificationId: verification.id || null,
        phoneNumber: recipient,
        email: email || null,
      },
    };
  } catch (error) {
    // Un mauvais code ne passe pas par ici : Bird répond alors en HTTP 200 avec
    // `success: false`. Ces 4xx couvrent les demandes introuvables ou expirées
    // côté Bird — un échec métier, pas une erreur serveur.
    const status = error?.status;
    if (status === 400 || status === 401 || status === 404 || status === 422) {
      const birdStatus = error?.payload?.status;
      console.warn(`⚠️ [BIRD-OTP] Vérification refusée (${status}) : ${birdStatus || 'code invalide'}`);
      return {
        success: false,
        message: 'Code OTP invalide ou expiré',
        data: { status: birdStatus || 'failed' },
      };
    }

    const formatted = formatBirdError(error, 'Échec de la vérification du code OTP');
    console.error(`❌ [BIRD-OTP] ${formatted.message}`);
    return { success: false, message: formatted.message, details: formatted.details };
  }
};
