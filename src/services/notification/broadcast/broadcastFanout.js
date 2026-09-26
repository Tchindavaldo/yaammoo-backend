// ============================================================================
// broadcastFanout — Diffusion d'un envoi de boutique à son audience
// ============================================================================
// Appelée APRÈS la réponse HTTP (asynchrone) : une audience peut compter des
// milliers de personnes. Pour chaque destinataire :
//   1. la notification entre dans son fil (`notifications`) ;
//   2. push FCM (Android) / APNs (iOS), par lots, tokens stales nettoyés ;
//   3. socket `newNotification`, que l'app injecte sans refetch.
// Le bilan (destinataires, push aboutis) est écrit sur l'envoi à la fin.
//
// Audience `all` : UN groupe `target='all'` au nom de la boutique, que
// `getNotificationsService` sert déjà à tout le monde — pas une écriture par
// utilisateur. Les autres audiences écrivent dans le fil personnel de chacun.
// ============================================================================
const repos = require('../../../repositories');
const { getIO } = require('../../../socket');
const sendPushNotification = require('../FCM/sendPushNotification.service');

const FEED_CONCURRENCY = 8;
const TOKEN_LOOKUP_CHUNK = 200;
const PUSH_CHUNK = 100;

const chunk = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

const forEachLimit = async (list, limit, fn) => {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) await fn(list[next++]);
  });
  await Promise.all(workers);
};

/** Lit toutes les pages d'une source paginée (`pageFn(from)` → tableau). */
const readAllPages = async pageFn => {
  const all = [];
  const size = repos.fastfoodBroadcasts.PAGE_SIZE;
  for (let from = 0; ; from += size) {
    const page = await pageFn(from, size);
    all.push(...page);
    if (page.length < size) return all;
  }
};

/** Deep-link : le home ouvre sa recherche sur le nom de la boutique. */
const shopRoute = name => `/(tabs)?shop=${encodeURIComponent(name)}`;

/**
 * Notification du fil. `shopId` et non `fastFoodId` : ce dernier désigne, sur
 * un groupe, la boutique DESTINATAIRE — `flattenNotifications` l'écraserait.
 */
const buildNotif = (item, fastFood) => ({
  id: item.id,
  title: item.title,
  body: item.body || '',
  type: 'boutique_broadcast',
  ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
  shopId: fastFood.id,
  shopName: fastFood.name,
  route: shopRoute(fastFood.name),
  isRead: [],
  createdAt: item.sentAt,
});

/** Données du push : FCM n'accepte que des chaînes. */
const pushDataOf = notif => ({
  id: notif.id,
  type: notif.type,
  route: notif.route,
  shopId: notif.shopId,
  imageUrl: notif.imageUrl || '',
});

const emit = (room, notification) => {
  try {
    const io = getIO();
    (room ? io.to(room) : io).emit('newNotification', { notification });
  } catch (e) {
    console.error('[broadcast] socket:', e.message);
  }
};

/** Supprime les tokens rejetés, rattachés à leur user. */
const cleanStale = async (rows, staleTokens) => {
  if (!staleTokens || staleTokens.length === 0) return;
  const byUser = {};
  for (const r of rows) {
    if (staleTokens.includes(r.token)) (byUser[r.user_id] = byUser[r.user_id] || []).push(r.token);
  }
  await Promise.all(
    Object.entries(byUser).map(([uid, tokens]) =>
      repos.users.cleanStaleTokens(uid, tokens).catch(e => console.warn('[broadcast] cleanStaleTokens:', e.message))
    )
  );
};

/** Pousse vers des lignes `{ user_id, token, platform }`. Retourne les push aboutis. */
const pushRows = async (rows, message) => {
  let pushed = 0;
  for (const part of chunk(rows, PUSH_CHUNK)) {
    const fcm = part.filter(r => r.platform === 'android').map(r => r.token);
    const apns = part.filter(r => r.platform === 'ios').map(r => r.token);
    if (fcm.length === 0 && apns.length === 0) continue;

    const res = await sendPushNotification({ tokens: fcm, apnsTokens: apns, ...message });
    pushed += (res.fcm?.details || []).filter(d => d.success).length + (res.apns?.sent || 0);
    await cleanStale(part, res.tokensToDelete);
  }
  return pushed;
};

const fanOutToAll = async (notif, fastFood, exclude, message) => {
  const group = await repos.notifications.appendNotification({
    userId: null,
    fastFoodId: fastFood.id,
    target: 'all',
    notif,
  });
  emit(null, { target: 'all', fastFoodId: fastFood.id, idGroup: group.id, ...notif });

  const recipientsCount = Math.max(0, (await repos.users.countUsers()) - exclude.size);
  const rows = (await readAllPages((from, size) => repos.users.pagePushTokens(from, size))).filter(
    r => !exclude.has(r.user_id)
  );
  return { recipientsCount, pushedCount: await pushRows(rows, message) };
};

const fanOutToUsers = async (userIds, notif, message) => {
  await forEachLimit(userIds, FEED_CONCURRENCY, async uid => {
    try {
      const group = await repos.notifications.appendNotification({ userId: uid, fastFoodId: null, target: null, notif });
      emit(uid, { userId: uid, idGroup: group.id, ...notif });
    } catch (e) {
      console.warn(`[broadcast] fil de ${uid}:`, e.message);
    }
  });

  let pushedCount = 0;
  for (const part of chunk(userIds, TOKEN_LOOKUP_CHUNK)) {
    const rows = await repos.users.getPushTokensForUsers(part);
    pushedCount += await pushRows(rows, message);
  }
  return { recipientsCount: userIds.length, pushedCount };
};

/**
 * Diffuse un envoi déjà enregistré. Ne lève jamais : l'envoi est accepté, un
 * incident de diffusion se lit dans les logs et dans `pushed_count`.
 */
exports.fanOutBroadcast = async ({ item, fastFood }) => {
  try {
    // L'expéditeur et le propriétaire ne reçoivent pas leur propre annonce.
    const exclude = new Set([item.senderUid, fastFood.ownerUid].filter(Boolean));
    const notif = buildNotif(item, fastFood);
    const message = { title: item.title, body: item.body || '', imageUrl: item.imageUrl, data: pushDataOf(notif) };

    let result;
    if (item.audience === 'all') {
      result = await fanOutToAll(notif, fastFood, exclude, message);
    } else {
      const ids = await readAllPages(from =>
        item.audience === 'city'
          ? repos.fastfoodBroadcasts.pageCityUserIds(item.city, from)
          : repos.fastfoodBroadcasts.pageCustomerIds(fastFood.id, from)
      );
      result = await fanOutToUsers(
        ids.filter(id => id && !exclude.has(id)),
        notif,
        message
      );
    }

    await repos.fastfoodBroadcasts.setCounts(item.id, result);
    console.log(
      `[broadcast] ${item.id} (${item.audience}) : ${result.recipientsCount} destinataires, ${result.pushedCount} push aboutis`
    );
  } catch (error) {
    console.error(`[broadcast] diffusion ${item.id} :`, error);
  }
};
