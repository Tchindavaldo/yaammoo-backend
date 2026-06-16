// ============================================================================
// User Service — Façade vers l'orchestrateur de repositories
// ============================================================================
// Ce fichier est volontairement minimal : il délègue toutes les opérations DB
// à `src/repositories/index.js` qui route vers Firestore et/ou Supabase
// selon DB_PROVIDER (voir config/dbProvider.js).
//
// Les contrôleurs et les autres services consomment cette interface stable —
// la migration de Firestore vers Supabase ne nécessite AUCUN changement
// dans ces appelants. On change juste la variable d'environnement.
// ============================================================================

const repos = require('../../repositories');

exports.getAllUsers = () => repos.users.getAllUsers();

exports.getUserById = (id) => repos.users.getUserById(id);

exports.createUser = (data) => repos.users.createUser(data);

exports.saveUser = (id, data) => repos.users.saveUser(id, data);

exports.updateUser = (id, data) => repos.users.updateUser(id, data);

exports.addPushToken = (userId, payload) => repos.users.addPushToken(userId, payload);

exports.removePushToken = (userId, payload) => repos.users.removePushToken(userId, payload);

exports.collectUserTokens = (userData) => repos.users.collectUserTokens(userData);

exports.getUserByEmail = (email) => repos.users.getUserByEmail(email);

exports.getUserByPhone = (phone) => repos.users.getUserByPhone(phone);

// ============================================================================
// Suppression complète du compte (RGPD / Apple Guideline 5.1.1(v))
// Supprime : données liées + ligne users (Supabase) + compte Firebase Auth.
// ⚠️ Firebase Auth reste géré ici (admin.auth) — c'est de l'auth, pas de la BD.
// ============================================================================
const { admin } = require('../../config/firebase');

exports.deleteUserAccount = async (uid) => {
  if (!uid) throw new Error('UID requis pour la suppression');

  console.log(`🗑️  [DELETE-ACCOUNT] Début suppression pour UID: ${uid}`);

  // Données BD (Supabase) via le repository — cascade géré côté repo
  try {
    await repos.users.deleteCascade(uid);
    console.log(`✅ [DELETE-ACCOUNT] Données Supabase supprimées pour ${uid}`);
  } catch (err) {
    console.warn(`⚠️  [DELETE-ACCOUNT] Erreur suppression données Supabase: ${err.message}`);
  }

  // Supprimer le compte Firebase Auth
  try {
    await admin.auth().deleteUser(uid);
    console.log(`✅ [DELETE-ACCOUNT] Compte Firebase Auth supprimé: ${uid}`);
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      console.warn(`ℹ️  [DELETE-ACCOUNT] Firebase Auth déjà absent pour ${uid}`);
    } else {
      throw new Error(`Échec suppression Firebase Auth: ${err.message}`);
    }
  }

  console.log(`🎉 [DELETE-ACCOUNT] Suppression complète terminée pour ${uid}`);
  return { uid, deletedAt: new Date().toISOString() };
};
