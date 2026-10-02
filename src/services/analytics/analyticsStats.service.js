// ============================================================================
// analyticsStats — Lecture des statistiques (GET /analytics/*, admin)
// ============================================================================
// Période `[from, to[` en ISO 8601 ; par défaut les DEFAULT_RANGE_DAYS
// derniers jours. Les lignes sont renvoyées en camelCase.
// ============================================================================
const repos = require('../../repositories');

const DEFAULT_RANGE_DAYS = 30;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

const camel = s => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const camelize = rows => rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [camel(k), v])));

/** Ajoute `user { name, email, phone }` à chaque ligne portant un `userId`. */
const withUsers = async rows => {
  const ids = [...new Set(rows.map(r => r.userId).filter(Boolean))];
  if (ids.length === 0) return rows;
  const identities = await repos.users.getUserIdentities(ids);
  const byId = new Map(
    identities.map(u => [
      u.id,
      { name: [u.prenom, u.nom].filter(Boolean).join(' ') || null, email: u.email || null, phone: u.numero ? String(u.numero) : null },
    ])
  );
  return rows.map(r => (r.userId ? { ...r, user: byId.get(r.userId) || null } : r));
};

const isDate = v => typeof v === 'string' && !isNaN(new Date(v).getTime());

/** Lit `from`, `to`, `limit` de la query. Retourne `{ error }` si invalide. */
exports.parseRange = query => {
  const to = query.to ?? new Date().toISOString();
  const from = query.from ?? new Date(Date.now() - DEFAULT_RANGE_DAYS * 86400000).toISOString();
  if (!isDate(from) || !isDate(to)) return { error: 'from / to doivent être des dates ISO 8601' };
  const limit = query.limit === undefined ? DEFAULT_LIMIT : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return { error: `limit doit être entre 1 et ${MAX_LIMIT}` };
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString(), limit };
};

/** Utilisateurs en ligne maintenant (connexions socket ouvertes). */
exports.getOnline = async () => {
  const rows = await repos.userConnections.listOpen();
  const byUser = new Map();
  for (const r of rows) {
    const u = byUser.get(r.user_id) || { userId: r.user_id, since: r.connected_at, devices: 0, appVersion: r.app_version, platform: r.platform };
    u.devices += 1;
    if (r.connected_at < u.since) u.since = r.connected_at;
    byUser.set(r.user_id, u);
  }
  return { count: byUser.size, users: await withUsers([...byUser.values()]) };
};

exports.listConnections = async ({ userId, from, to, limit }) => withUsers(camelize(await repos.userConnections.list({ userId, from, to, limit })));

exports.listEvents = async filters => camelize(await repos.analytics.listEvents(filters));

/** Agrégat SQL `analytics_<name>` sur la période. */
exports.aggregate = async (name, { from, to, limit }) => {
  const params = { p_from: from, p_to: to };
  if (name === 'top_searches') params.p_limit = limit;
  return withUsers(camelize(await repos.analytics.aggregate(name, params)));
};

/** Fiche d'un utilisateur : connexions, sessions, scroll du home, derniers événements. */
exports.getUserSummary = async (userId, { from, to, limit }) => {
  const [[identity], connections, sessions, scroll, events] = await Promise.all([
    withUsers([{ userId }]),
    repos.userConnections.summary(userId),
    repos.analytics.listSessions({ userId, from, to, limit }),
    repos.analytics.aggregate('home_scroll', { p_from: from, p_to: to }),
    repos.analytics.listEvents({ userId, from, to, limit }),
  ]);
  return {
    userId,
    user: identity.user || null,
    ...connections,
    sessions: camelize(sessions),
    homeScroll: camelize(scroll.filter(r => r.user_id === userId))[0] || null,
    events: camelize(events),
  };
};
