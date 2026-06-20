// ============================================================================
// Repository Orchestrator — Supabase uniquement
// ============================================================================
// API unique exposée aux services métier :
//
//   const repos = require('../../repositories');
//   await repos.users.createUser(data);
//
// La BD est désormais **Supabase** exclusivement (la couche Firestore a été
// retirée). Cet orchestrateur reste le point d'entrée stable : les services ne
// connaissent toujours pas le provider concret.
//
// ⚠️ Firebase n'est PAS supprimé : il reste utilisé pour l'auth, les push
// notifications et le storage (voir config/firebase.js). Seule la couche
// DONNÉES PURES (repositories) est passée à Supabase.
// ============================================================================

const cfg = require('../config/dbProvider');

const sb = {
  users: require('./supabase/users.repo'),
  fastfoods: require('./supabase/fastfoods.repo'),
  menus: require('./supabase/menus.repo'),
  orders: require('./supabase/orders.repo'),
  transactions: require('./supabase/transactions.repo'),
  bonus: require('./supabase/bonus.repo'),
  bonusRequests: require('./supabase/bonusRequests.repo'),
  notifications: require('./supabase/notifications.repo'),
  pendingPayments: require('./supabase/pendingPayments.repo'),
  withdrawals: require('./supabase/withdrawals.repo'),
  outboxEvents: require('./supabase/outboxEvents.repo'),
};

// ===========================================================================
// USERS
// ===========================================================================
const users = {
  ...sb.users,
  // collectUserTokens est une pure fonction utilitaire (pas un accès DB)
  collectUserTokens: userData => {
    const fcm = [];
    const apns = [];
    if (Array.isArray(userData.pushTokens)) {
      userData.pushTokens.forEach(e => {
        if (!e || !e.token) return;
        if (e.platform === 'ios') apns.push(e.token);
        else if (e.platform === 'android') fcm.push(e.token);
      });
    }
    return { fcm, apns };
  },
};

module.exports = {
  config: cfg,
  users,
  fastfoods: sb.fastfoods,
  menus: sb.menus,
  orders: sb.orders,
  transactions: sb.transactions,
  bonus: sb.bonus,
  bonusRequests: sb.bonusRequests,
  notifications: sb.notifications,
  pendingPayments: sb.pendingPayments,
  withdrawals: sb.withdrawals,
  outboxEvents: sb.outboxEvents,
  supabase: sb,
};
