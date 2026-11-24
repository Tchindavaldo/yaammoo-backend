// services/auth/emailAuth.service.js
// Inscription par e-mail avec code de verification (Bird Verify, canal e-mail).
// Utilise par controllers/auth/emailAuth.controller.js (POST /auth/email/*).
const { admin } = require('../../config/firebase');
const repos = require('../../repositories');
const { sendPhoneOtp } = require('../notification/bird/sendOtp.service');
const { verifyPhoneOtp } = require('../notification/bird/verifyOtp.service');
const settingsService = require('../settings/settings.service');

/**
 * Parcours : `requestEmailCode` envoie un code a 6 chiffres a l'adresse, puis
 * `verifyEmailRegister` valide le code, cree (ou repare) le compte Firebase
 * Auth avec le mot de passe choisi, cree le profil `users`, et renvoie un
 * custom token. Les connexions suivantes restent en e-mail + mot de passe
 * (Firebase cote app) : le code ne sert qu'a l'inscription.
 *
 * Reparation : un compte Firebase cree par l'ancien flux sans profil `users`
 * (inscription interrompue) est repris ici, mot de passe remplace.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = e => String(e || '').trim().toLowerCase();

// Verrou de renvoi en memoire (un envoi Bird est facture). Reglage partage
// avec le telephone : `otp_resend_cooldown_seconds`.
const lastSent = new Map();

/** Compte Firebase de cette adresse, ou null. */
const findAuthUser = async email => {
  try {
    return await admin.auth().getUserByEmail(email);
  } catch (error) {
    if (error.code === 'auth/user-not-found') return null;
    throw error;
  }
};

/** Le compte est-il complet (Firebase + profil `users`) ? */
const isRegistered = async email => {
  const authUser = await findAuthUser(email);
  if (!authUser) return false;
  const profile = await repos.users.getUserByIdSafe(authUser.uid);
  return !!profile;
};

/** Etape 1 — envoi du code a l'adresse. */
exports.requestEmailCode = async ({ email }) => {
  const mail = normalizeEmail(email);
  if (!EMAIL_RE.test(mail)) return { success: false, message: 'Adresse e-mail invalide' };

  const { resendCooldownSeconds, expiresInSeconds } = await settingsService.getOtpSettings();
  const elapsed = (Date.now() - (lastSent.get(mail) || 0)) / 1000;
  const retryAfter = Math.ceil((resendCooldownSeconds || 0) - elapsed);
  if (retryAfter > 0) {
    return {
      success: false,
      code: 'cooldown',
      message: `Veuillez patienter ${retryAfter} seconde${retryAfter > 1 ? 's' : ''} avant de demander un nouveau code`,
      data: { retryAfter },
    };
  }

  try {
    if (await isRegistered(mail)) {
      return { success: false, code: 'exists', message: 'Cette adresse e-mail est déjà utilisée. Connectez-vous.' };
    }
  } catch (error) {
    console.error(`❌ [EMAIL-AUTH] Controle du compte impossible : ${error.code} — ${error.message}`);
    return { success: false, message: "Service d'authentification indisponible. Réessayez." };
  }

  const sent = await sendPhoneOtp({ email: mail });
  if (!sent.success) return sent;
  lastSent.set(mail, Date.now());

  return {
    success: true,
    message: 'Code de vérification envoyé',
    data: { email: mail, expiresIn: expiresInSeconds },
  };
};

/** Etape 2 — validation du code, creation du compte, custom token. */
exports.verifyEmailRegister = async ({ email, code, password }) => {
  const mail = normalizeEmail(email);
  if (!EMAIL_RE.test(mail)) return { success: false, message: 'Adresse e-mail invalide' };
  if (!code) return { success: false, message: 'Le code de vérification est requis' };
  if (!password || String(password).length < 6) {
    return { success: false, message: 'Le mot de passe doit contenir au moins 6 caractères' };
  }

  const verified = await verifyPhoneOtp({ email: mail, code });
  if (!verified.success) {
    return {
      success: false,
      message: verified.message,
      data: { reason: verified.data?.reason || null, attemptsRemaining: verified.data?.attemptsRemaining ?? null },
    };
  }
  lastSent.delete(mail);

  // Compte Firebase : cree, ou repris si l'ancien flux l'a laisse sans profil.
  let authUser;
  try {
    authUser = await findAuthUser(mail);
    if (authUser) {
      if (await repos.users.getUserByIdSafe(authUser.uid)) {
        return { success: false, code: 'exists', message: 'Cette adresse e-mail est déjà utilisée. Connectez-vous.' };
      }
      authUser = await admin.auth().updateUser(authUser.uid, { password: String(password), emailVerified: true });
      console.log(`[EMAIL-AUTH] Compte Auth sans profil repris : ${authUser.uid}`);
    } else {
      authUser = await admin.auth().createUser({ email: mail, password: String(password), emailVerified: true });
      console.log(`✅ [EMAIL-AUTH] Compte Firebase Auth créé : ${authUser.uid}`);
    }
  } catch (error) {
    console.error(`❌ [EMAIL-AUTH] Création Firebase Auth échouée : ${error.code} — ${error.message}`);
    return { success: false, message: 'Échec de la création du compte' };
  }

  const uid = authUser.uid;
  const userData = {
    uid,
    id: uid,
    infos: {
      nom: mail.split('@')[0] || null,
      prenom: null,
      age: null,
      numero: 0,
      email: mail,
      password: null,
    },
    fastFoodId: null,
    statistique: 100,
    cmd: [],
    authProvider: 'email',
    emailVerified: true,
    createdAt: new Date().toISOString(),
  };

  try {
    await repos.users.createUser(userData);
  } catch (error) {
    console.error(`❌ [EMAIL-AUTH] Création du profil échouée : ${error.message}`);
    return { success: false, message: 'Échec de la création du compte' };
  }

  let customToken;
  try {
    customToken = await admin.auth().createCustomToken(uid, { authProvider: 'email' });
  } catch (error) {
    console.error(`❌ [EMAIL-AUTH] Génération du token échouée : ${error.message}`);
    return { success: false, message: 'Compte créé mais connexion impossible. Connectez-vous.' };
  }

  console.log(`✅ [EMAIL-AUTH] Nouvel utilisateur ${uid} (${mail})`);
  return {
    success: true,
    message: 'Compte créé',
    data: { customToken, isNewUser: true, user: { id: uid, uid, email: mail } },
  };
};
