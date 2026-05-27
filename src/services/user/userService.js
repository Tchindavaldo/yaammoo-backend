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

exports.removeFcmToken = (id, token) => repos.users.removeFcmToken(id, token);

exports.addPushToken = (userId, payload) => repos.users.addPushToken(userId, payload);

exports.removePushToken = (userId, payload) => repos.users.removePushToken(userId, payload);

exports.collectUserTokens = (userData) => repos.users.collectUserTokens(userData);

exports.getUserByEmail = (email) => repos.users.getUserByEmail(email);

exports.getUserByPhone = (phone) => repos.users.getUserByPhone(phone);
