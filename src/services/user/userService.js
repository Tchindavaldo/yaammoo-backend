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
// Supprime : compte Firebase Auth + document users + données liées
// ============================================================================
const { db, admin } = require('../../config/firebase');

exports.deleteUserAccount = async (uid) => {
  if (!uid) throw new Error('UID requis pour la suppression');

  console.log(`🗑️  [DELETE-ACCOUNT] Début suppression pour UID: ${uid}`);

  // Collections liées à supprimer (best-effort)
  const collectionsLiees = [
    { name: 'orders', field: 'userId' },
    { name: 'orders', field: 'fastFoodId' },
    { name: 'transaction', field: 'userId' },
    { name: 'notification', field: 'userId' },
    { name: 'bonus', field: 'userId' },
    { name: 'bonusRequest', field: 'userId' },
    { name: 'menus', field: 'userId' },
    { name: 'fastfoods', field: 'userId' },
  ];

  for (const { name, field } of collectionsLiees) {
    try {
      const snapshot = await db.collection(name).where(field, '==', uid).get();
      if (snapshot.empty) continue;

      const batch = db.batch();
      snapshot.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      console.log(`✅ [DELETE-ACCOUNT] ${snapshot.size} doc(s) supprimé(s) dans ${name} (${field})`);
    } catch (err) {
      console.warn(`⚠️  [DELETE-ACCOUNT] Erreur sur ${name}: ${err.message}`);
    }
  }

  // Supprimer le document utilisateur (par ID doc OU par champ uid)
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists) {
      await db.collection('users').doc(uid).delete();
      console.log(`✅ [DELETE-ACCOUNT] Document users/${uid} supprimé`);
    } else {
      const snap = await db.collection('users').where('uid', '==', uid).get();
      const batch = db.batch();
      snap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      console.log(`✅ [DELETE-ACCOUNT] ${snap.size} doc(s) users supprimé(s) via champ uid`);
    }
  } catch (err) {
    console.warn(`⚠️  [DELETE-ACCOUNT] Erreur suppression users: ${err.message}`);
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
