// ============================================================================
// staffAccount — compte de connexion d'un employé (OTP et/ou email + mot de passe)
// ============================================================================
// Un employé se connecte TOUJOURS par OTP sur son numéro. Si `email` +
// `password` sont fournis à sa création, il peut AUSSI se connecter par email.
//
// Un seul compte par personne : l'uid est celui du parcours OTP (`ph_<numero>`),
// ainsi les deux modes de connexion ouvrent la MÊME session / le même profil.
// Le mot de passe n'est jamais stocké en base : seul Firebase Auth le détient.
// ============================================================================
const { admin } = require('../../config/firebase');
const repos = require('../../repositories');
const { phoneToNumero } = require('../../utils/validator/validatePhoneNumber');

const fail = (code, message) => Object.assign(new Error(message), { code });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6; // minimum Firebase Auth

const validateCredentials = ({ email, password }) => {
  if (email === undefined && password === undefined) return null;
  if (!email || !EMAIL_RE.test(email)) throw fail(400, 'Email invalide.');
  if (password !== undefined && (typeof password !== 'string' || password.length < MIN_PASSWORD)) {
    throw fail(400, `Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.`);
  }
  return { email: email.trim().toLowerCase(), password };
};

/** Ajoute email + mot de passe à un compte Auth qui n'a pas encore d'email. */
const attachEmailLogin = async (uid, { email, password }) => {
  const authUser = await admin.auth().getUser(uid);
  if (authUser.email) return; // on ne réécrit jamais l'email/mot de passe de quelqu'un
  if (!password) throw fail(400, 'password requis pour activer la connexion par email.');
  await admin.auth().updateUser(uid, { email, password });
  await repos.users.updateUser(uid, { infos: { ...(await repos.users.getUserById(uid))?.infos, email } });
};

/**
 * Retrouve ou crée le compte de l'employé.
 * @returns {Promise<{ user: object|null, created: boolean }>} user null = pas de
 *   compte (ni existant, ni identifiants fournis) : rattachement à la 1re connexion OTP.
 */
exports.resolveStaffAccount = async ({ phoneNumber, phoneCandidates, email, password, nom, prenom }) => {
  const creds = validateCredentials({ email, password });

  let user = await repos.users.getUserByAnyPhone(phoneCandidates);
  if (!user && creds) user = await repos.users.getUserByEmail(creds.email);

  if (user) {
    if (creds) await attachEmailLogin(user.uid || user.id, creds);
    return { user, created: false };
  }
  if (!creds) return { user: null, created: false };
  if (!creds.password) throw fail(400, 'password requis pour créer le compte par email.');

  const uid = `ph_${phoneNumber.replace('+', '')}`;
  try {
    await admin.auth().createUser({ uid, phoneNumber, email: creds.email, password: creds.password });
  } catch (error) {
    if (error.code === 'auth/email-already-exists') throw fail(409, 'Cet email est déjà utilisé par un autre compte.');
    if (error.code !== 'auth/uid-already-exists' && error.code !== 'auth/phone-number-already-exists') throw error;
    // Compte Auth orphelin (sans ligne users) : on le complète.
    await admin.auth().updateUser(uid, { email: creds.email, password: creds.password });
  }

  const userData = {
    uid,
    id: uid,
    infos: { nom: nom ?? null, prenom: prenom ?? null, age: null, numero: phoneToNumero(phoneNumber), email: creds.email, password: null },
    fastFoodId: null,
    statistique: 100,
    cmd: [],
    authProvider: 'staff',
    phoneNumber,
    createdAt: new Date().toISOString(),
  };
  await repos.users.createUser(userData);
  return { user: userData, created: true };
};
