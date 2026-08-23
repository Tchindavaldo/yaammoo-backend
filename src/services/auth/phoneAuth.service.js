const { admin } = require('../../config/firebase');
const repos = require('../../repositories');
const { sendPhoneOtp } = require('../notification/bird/sendOtp.service');
const { verifyPhoneOtp } = require('../notification/bird/verifyOtp.service');
const { getVerificationDetails } = require('../notification/bird/getVerification.service');
const { recordVerificationSent, recordVerificationCost } = require('../notification/bird/birdCost.service');
const settingsService = require('../settings/settings.service');
const { normalizePhoneNumber, phoneToNumero, phoneVariants } = require('../../utils/validator/validatePhoneNumber');

/**
 * Authentification par numéro de téléphone (Bird Verify + Firebase custom token).
 *
 * Chaque envoi est facturé par Bird : sans le verrou de renvoi ci-dessous, un
 * utilisateur qui clique plusieurs fois sur « renvoyer » déclenche autant
 * d'envois payants, et chaque nouvelle demande rend la précédente orpheline
 * (elle expire sans être validée, mais reste facturée).
 *
 * Les réglages (cooldown, durée annoncée, indicatif) viennent de la table
 * `settings`, préfixe `otp_` — ajustables à chaud. Seul le secret Bird est en
 * variable d'environnement.
 */

/** UID Firebase dérivé du numéro : stable et rejouable sans table de correspondance. */
const uidFromPhone = phoneNumber => `ph_${phoneNumber.replace('+', '')}`;

/**
 * Secondes restantes avant qu'un nouvel envoi soit autorisé pour ce numéro.
 *
 * S'appuie sur `createdAt` de la dernière demande. En cas d'échec de lecture, on
 * autorise l'envoi : mieux vaut un SMS de trop qu'un utilisateur bloqué.
 *
 * @param {string} phoneNumber
 * @param {number} cooldownSeconds réglage `otp_resend_cooldown_seconds`
 * @returns {Promise<number>} 0 si l'envoi est autorisé
 */
const getCooldownRemaining = async (phoneNumber, cooldownSeconds) => {
  if (!cooldownSeconds) return 0;

  try {
    const request = await repos.phoneOtp.getByPhone(phoneNumber);
    if (!request || !request.createdAt) return 0;

    const elapsed = (Date.now() - new Date(request.createdAt).getTime()) / 1000;
    const remaining = Math.ceil(cooldownSeconds - elapsed);
    return remaining > 0 ? remaining : 0;
  } catch (error) {
    console.warn(`⚠️ [PHONE-AUTH] Contrôle du délai impossible : ${error.message}`);
    return 0;
  }
};

/**
 * Étape 1 — Demande d'un code de connexion par téléphone.
 *
 * Ne révèle pas si le numéro est déjà inscrit : la réponse est identique dans
 * les deux cas, pour ne pas transformer cet endpoint en outil d'énumération.
 *
 * @param {object} params
 * @param {string} params.phoneNumber
 */
exports.requestPhoneAuth = async ({ phoneNumber }) => {
  const { defaultCountryCode, resendCooldownSeconds, expiresInSeconds } = await settingsService.getOtpSettings();

  const recipient = normalizePhoneNumber(phoneNumber, defaultCountryCode);
  if (!recipient) {
    return { success: false, message: `Numéro de téléphone invalide : ${phoneNumber}` };
  }

  // Contrôle avant l'appel à Bird : passé ce point, l'envoi est facturé.
  const retryAfter = await getCooldownRemaining(recipient, resendCooldownSeconds);
  if (retryAfter > 0) {
    return {
      success: false,
      code: 'cooldown',
      message: `Veuillez patienter ${retryAfter} seconde${retryAfter > 1 ? 's' : ''} avant de demander un nouveau code`,
      data: { retryAfter },
    };
  }

  const sent = await sendPhoneOtp({ phoneNumber: recipient });
  if (!sent.success) return sent;

  // Trace du coût dès l'envoi : une demande abandonnée est facturée par Bird,
  // elle doit donc rester visible même si le code n'est jamais saisi.
  await recordVerificationSent({
    verificationId: sent.data.verificationId,
    phoneNumber: recipient,
  });

  return {
    success: true,
    message: 'Code de vérification envoyé',
    data: {
      verificationId: sent.data.verificationId,
      phoneNumber: recipient,
      expiresIn: expiresInSeconds,
    },
  };
};

/**
 * Étape 2 — Validation du code, puis connexion ou inscription.
 *
 * Enchaînement : Bird valide le code → on relit la vérification pour connaître
 * le coût réel et on le stocke → on crée (ou retrouve) l'utilisateur → on émet
 * un custom token Firebase.
 *
 * Le custom token est à usage unique : le frontend l'échange via
 * `signInWithCustomToken`, ce qui lui donne un refresh token persistant. La
 * session survit donc bien au-delà de six mois sans nouvelle saisie de code.
 *
 * @param {object} params
 * @param {string} params.phoneNumber
 * @param {string} params.code
 * @param {object} [params.profile] Champs de profil optionnels à l'inscription
 */
exports.verifyPhoneAuth = async ({ phoneNumber, code, profile = {} }) => {
  const { defaultCountryCode } = await settingsService.getOtpSettings();

  const recipient = normalizePhoneNumber(phoneNumber, defaultCountryCode);
  if (!recipient) {
    return { success: false, message: `Numéro de téléphone invalide : ${phoneNumber}` };
  }
  if (!code) {
    return { success: false, message: 'Le code de vérification est requis' };
  }

  // On mémorise l'id avant vérification : une vérification réussie supprime la
  // trace locale, et l'id reste nécessaire pour relire le coût.
  let verificationId = null;
  try {
    const request = await repos.phoneOtp.getByPhone(recipient);
    if (request) verificationId = request.verificationId;
  } catch (error) {
    console.warn(`⚠️ [PHONE-AUTH] Lecture de la demande impossible : ${error.message}`);
  }

  const verified = await verifyPhoneOtp({ phoneNumber: recipient, code });
  if (!verified.success) {
    return {
      success: false,
      message: verified.message,
      data: {
        reason: verified.data?.reason || null,
        attemptsRemaining: verified.data?.attemptsRemaining ?? null,
      },
    };
  }

  verificationId = verificationId || verified.data?.verificationId;

  // Coût réel : disponible seulement une fois les tentatives résolues par Bird.
  let cost = { totalCost: null, currencyCode: null };
  if (verificationId) {
    const details = await getVerificationDetails({ verificationId });
    if (details.success) {
      cost = await recordVerificationCost({
        verificationId,
        verification: details.data.raw,
        verified: true,
      });
    }
  }

  const uid = uidFromPhone(recipient);
  const now = new Date().toISOString();

  // Connexion si le numéro est connu, inscription sinon.
  let user = null;
  try {
    user = await repos.users.getUserByAnyPhone(phoneVariants(recipient, defaultCountryCode));
  } catch (error) {
    console.error(`❌ [PHONE-AUTH] Recherche du compte impossible : ${error.message}`);
    return { success: false, message: 'Erreur lors de la recherche du compte' };
  }

  const isNewUser = !user;

  if (isNewUser) {
    // Compte Firebase Auth : indispensable pour que le middleware firebaseAuth
    // accepte ensuite les idTokens issus de ce parcours.
    try {
      await admin.auth().createUser({ uid, phoneNumber: recipient });
    } catch (error) {
      // Le compte Auth peut survivre à la suppression de la ligne users.
      if (error.code !== 'auth/uid-already-exists' && error.code !== 'auth/phone-number-already-exists') {
        console.error(`❌ [PHONE-AUTH] Création Firebase Auth échouée : ${error.message}`);
        return { success: false, message: 'Échec de la création du compte' };
      }
    }

    const userData = {
      uid,
      id: uid,
      infos: {
        nom: profile.nom ?? null,
        prenom: profile.prenom ?? null,
        age: profile.age ?? null,
        numero: phoneToNumero(recipient),
        email: profile.email ?? null,
        password: null,
      },
      fastFoodId: null,
      statistique: 100,
      cmd: [],
      // Champs libres (extra_data) : traçabilité du parcours d'inscription.
      authProvider: 'phone',
      phoneVerified: true,
      phoneNumber: recipient,
      createdAt: now,
    };

    try {
      await repos.users.createUser(userData);
    } catch (error) {
      console.error(`❌ [PHONE-AUTH] Création du profil échouée : ${error.message}`);
      return { success: false, message: 'Échec de la création du compte' };
    }

    user = { ...userData };
    console.log(`✅ [PHONE-AUTH] Nouvel utilisateur ${uid} (${recipient})`);
  } else {
    // Compte existant : on marque le numéro comme vérifié sans écraser le profil.
    await repos.users.updateUser(user.id, { phoneVerified: true, phoneNumber: recipient, lastLoginAt: now }).catch(err => console.warn(`⚠️ [PHONE-AUTH] Mise à jour du profil : ${err.message}`));
    console.log(`✅ [PHONE-AUTH] Connexion ${user.id} (${recipient})`);
  }

  // `user.uid` d'abord : un compte préexistant peut avoir un uid d'une autre origine
  // (inscription e-mail/Google), et c'est celui-là qui porte la session Firebase.
  const authUid = user.uid || user.id || uid;

  let customToken;
  try {
    customToken = await admin.auth().createCustomToken(authUid, { authProvider: 'phone' });
  } catch (error) {
    console.error(`❌ [PHONE-AUTH] Génération du token échouée : ${error.message}`);
    return { success: false, message: 'Compte validé mais génération du token impossible' };
  }

  return {
    success: true,
    message: isNewUser ? 'Compte créé' : 'Connexion réussie',
    data: {
      customToken,
      isNewUser,
      user: {
        id: user.id,
        uid: authUid,
        phoneNumber: recipient,
        nom: user.infos?.nom || null,
        prenom: user.infos?.prenom || null,
        email: user.infos?.email || null,
        fastFoodId: user.fastFoodId || null,
        isMarchand: !!user.fastFoodId,
      },
      cost,
    },
  };
};
