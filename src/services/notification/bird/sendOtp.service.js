const repos = require('../../../repositories');
const { birdClient, formatBirdError } = require('./birdClient');
const { assertBirdConfig } = require('../../../config/bird');
const settingsService = require('../../settings/settings.service');
const { normalizePhoneNumber } = require('../../../utils/validator/validatePhoneNumber');

/**
 * Envoie un code OTP via la Verify API de Bird.
 *
 * Bird choisit lui-même le canal de livraison selon le pays du destinataire
 * (WhatsApp en priorité, puis SMS) et gère la génération du code, son
 * expiration et le nombre de tentatives. Aucun expéditeur ni template n'est à
 * configurer ; les messages sont envoyés sous la marque Authifly de Bird.
 *
 * Le code n'est jamais stocké côté yaammoo : on ne conserve que l'identifiant
 * de vérification, nécessaire à l'étape de contrôle.
 *
 * Les canaux actifs par pays se règlent dans le dashboard : Verify → Countries.
 *
 * @param {object} params
 * @param {string} [params.phoneNumber] Numéro du destinataire (E.164 ou local)
 * @param {string} [params.email]       Adresse e-mail (alternative au numéro)
 * @param {string} [params.userId]      UID utilisateur, pour tracer la demande
 * @returns {Promise<{success: boolean, message: string, data?: object}>}
 */
exports.sendPhoneOtp = async ({ phoneNumber, email, userId }) => {
  try {
    assertBirdConfig();

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

    const data = await birdClient.post('/v1/verify/verifications', { to });

    // On mémorise l'id de vérification pour que le client n'ait à renvoyer
    // que son numéro et le code reçu.
    if (recipient) {
      await repos.phoneOtp.saveRequest({
        phoneNumber: recipient,
        verificationId: data.id,
        userId: userId || null,
        status: data.status || 'pending',
      });
    }

    console.log(`✅ [BIRD-OTP] Code envoyé à ${recipient || email} (verification: ${data.id})`);

    return {
      success: true,
      message: 'Code OTP envoyé',
      data: {
        verificationId: data.id,
        phoneNumber: recipient,
        email: email || null,
        status: data.status,
      },
    };
  } catch (error) {
    const formatted = formatBirdError(error, "Échec de l'envoi du code OTP");
    console.error(`❌ [BIRD-OTP] ${formatted.message}`);
    return { success: false, message: formatted.message, details: formatted.details };
  }
};
