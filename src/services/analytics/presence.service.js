// ============================================================================
// presence — Connexions socket des utilisateurs (migration 061)
// ============================================================================
// Appelé par socket.js : `join_user` ouvre une ligne `analytics_connections`, la
// déconnexion du socket la ferme. Une ligne ouverte = utilisateur en ligne.
// `serverId` identifie la machine : au démarrage, ses lignes restées ouvertes
// (crash, redéploiement) sont fermées.
// ============================================================================
const os = require('os');
const repos = require('../../repositories');
const { generateId } = require('../../repositories/idGen');

const SERVER_ID = process.env.FLY_MACHINE_ID || os.hostname();
const warn = (what, e) => console.warn(`[presence] ${what}:`, e.message);

exports.closeOrphanConnections = () => repos.userConnections.closeOrphans(SERVER_ID).catch(e => warn('closeOrphans', e));

/**
 * À appeler sur `join_user`. Une connexion par (socket, userId).
 * L'app passe `appVersion` / `platform` dans la query du handshake.
 */
exports.onJoinUser = async (socket, userId) => {
  socket.data.connections = socket.data.connections || {};
  if (socket.data.connections[userId]) return;

  const id = generateId();
  socket.data.connections[userId] = id;
  const { appVersion, platform } = socket.handshake?.query || {};
  try {
    const opened = await repos.userConnections.open({
      id,
      userId,
      socketId: socket.id,
      serverId: SERVER_ID,
      appVersion: typeof appVersion === 'string' ? appVersion.slice(0, 20) : null,
      platform: typeof platform === 'string' ? platform.slice(0, 20) : null,
    });
    // Pas un utilisateur (room de boutique rejointe par le même event).
    if (!opened) delete socket.data.connections[userId];
  } catch (e) {
    delete socket.data.connections[userId];
    warn('open', e);
  }
};

/** À appeler sur `disconnect` : ferme toutes les connexions du socket. */
exports.onDisconnect = socket => {
  const ids = Object.values(socket.data.connections || {});
  return Promise.all(ids.map(id => repos.userConnections.close(id).catch(e => warn('close', e))));
};
