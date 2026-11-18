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
  fastfoodDeletion: require('./supabase/fastfoodDeletion.repo'),
  menus: require('./supabase/menus.repo'),
  orders: require('./supabase/orders.repo'),
  transactions: require('./supabase/transactions.repo'),
  bonus: require('./supabase/bonus.repo'),
  bonusRequests: require('./supabase/bonusRequests.repo'),
  bonusFlyerDownloads: require('./supabase/bonusFlyerDownloads.repo'),
  notifications: require('./supabase/notifications.repo'),
  pendingPayments: require('./supabase/pendingPayments.repo'),
  withdrawals: require('./supabase/withdrawals.repo'),
  outboxEvents: require('./supabase/outboxEvents.repo'),
  driverApplications: require('./supabase/driverApplications.repo'),
  ratings: require('./supabase/ratings.repo'),
  settings: require('./supabase/settings.repo'),
  orderDeliveries: require('./supabase/orderDeliveries.repo'),
  orderSettlements: require('./supabase/orderSettlements.repo'),
  orderRefunds: require('./supabase/orderRefunds.repo'),
  legal: require('./supabase/legal.repo'),
  cities: require('./supabase/cities.repo'),
  payoutNumbers: require('./supabase/payoutNumbers.repo'),
  verifiedNumbers: require('./supabase/payoutNumbers.repo'),
  accountArchives: require('./supabase/accountArchives.repo'),
  platformTransfers: require('./supabase/platformTransfers.repo'),
  platformShare: require('./supabase/platformShare.repo'),
  appErrors: require('./supabase/appErrors.repo'),
  waOrderReminders: require('./supabase/waOrderReminders.repo'),
  waConversations: require('./supabase/waConversations.repo'),
  waAiPendingActions: require('./supabase/waAiPendingActions.repo'),
  waDailyMenuSends: require('./supabase/waDailyMenuSends.repo'),
  waAdminAlerts: require('./supabase/waAdminAlerts.repo'),
  waAdminActions: require('./supabase/waAdminActions.repo'),
  waAgentModes: require('./supabase/waAgentModes.repo'),
  supportThreads: require('./supabase/supportThreads.repo'),
  banners: require('./supabase/banners.repo'),
  phoneOtp: require('./supabase/phoneOtp.repo'),
  birdCosts: require('./supabase/birdCosts.repo'),
  staff: require('./supabase/staff.repo'),
  fastfoodBroadcasts: require('./supabase/fastfoodBroadcasts.repo'),
  userLocations: require('./supabase/userLocations.repo'),
  driverPositions: require('./supabase/driverPositions.repo'),
  analytics: require('./supabase/analytics.repo'),
  userConnections: require('./supabase/userConnections.repo'),
  imageTrash: require('./supabase/imageTrash.repo'),
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
  fastfoodDeletion: sb.fastfoodDeletion,
  menus: sb.menus,
  orders: sb.orders,
  transactions: sb.transactions,
  bonus: sb.bonus,
  bonusRequests: sb.bonusRequests,
  bonusFlyerDownloads: sb.bonusFlyerDownloads,
  notifications: sb.notifications,
  pendingPayments: sb.pendingPayments,
  withdrawals: sb.withdrawals,
  outboxEvents: sb.outboxEvents,
  driverApplications: sb.driverApplications,
  ratings: sb.ratings,
  settings: sb.settings,
  orderDeliveries: sb.orderDeliveries,
  orderSettlements: sb.orderSettlements,
  orderRefunds: sb.orderRefunds,
  legal: sb.legal,
  cities: sb.cities,
  payoutNumbers: sb.payoutNumbers,
  verifiedNumbers: sb.verifiedNumbers,
  accountArchives: sb.accountArchives,
  platformTransfers: sb.platformTransfers,
  platformShare: sb.platformShare,
  appErrors: sb.appErrors,
  waOrderReminders: sb.waOrderReminders,
  waConversations: sb.waConversations,
  waAiPendingActions: sb.waAiPendingActions,
  waDailyMenuSends: sb.waDailyMenuSends,
  waAdminAlerts: sb.waAdminAlerts,
  waAdminActions: sb.waAdminActions,
  waAgentModes: sb.waAgentModes,
  supportThreads: sb.supportThreads,
  banners: sb.banners,
  phoneOtp: sb.phoneOtp,
  birdCosts: sb.birdCosts,
  staff: sb.staff,
  fastfoodBroadcasts: sb.fastfoodBroadcasts,
  userLocations: sb.userLocations,
  imageTrash: sb.imageTrash,
  driverPositions: sb.driverPositions,
  analytics: sb.analytics,
  userConnections: sb.userConnections,
  supabase: sb,
};
