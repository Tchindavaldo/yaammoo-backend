// ============================================================================
// Notifications Repository — Firestore
// ============================================================================
const { db } = require('../../config/firebase');

const TABLE = 'notification';

exports.getGroupForUser = async (userId) => {
  const snap = await db.collection(TABLE).where('userId', '==', userId).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
};

exports.getGroupForFastFood = async (fastFoodId) => {
  const snap = await db.collection(TABLE).where('fastFoodId', '==', fastFoodId).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
};

exports.getById = async (id) => {
  const doc = await db.collection(TABLE).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
};

exports.getAllForTarget = async (target = 'all') => {
  const snap = await db
    .collection(TABLE)
    .where('target', '==', target)
    .orderBy('updatedAt', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

exports.getAllForUser = async (userId) => {
  const snap = await db
    .collection(TABLE)
    .where('userId', '==', userId)
    .orderBy('updatedAt', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/**
 * Append d'une notification à l'array allNotif d'un groupe (user ou fastfood).
 * Crée le groupe s'il n'existe pas.
 */
exports.appendNotification = async ({ userId, fastFoodId, target, notif }) => {
  let existing;
  if (userId) existing = await exports.getGroupForUser(userId);
  else if (fastFoodId) existing = await exports.getGroupForFastFood(fastFoodId);

  if (!existing) {
    const groupData = {
      updatedAt: new Date().toISOString(),
      allNotif: [notif],
    };
    if (userId) groupData.userId = userId;
    if (fastFoodId) {
      groupData.fastFoodId = fastFoodId;
      groupData.target = target || 'all';
    } else if (target) {
      groupData.target = target;
    }
    const docRef = await db.collection(TABLE).add(groupData);
    return { id: docRef.id, ...groupData };
  }

  const updatedAllNotif = [notif, ...(existing.allNotif || [])];
  await db
    .collection(TABLE)
    .doc(existing.id)
    .update({ allNotif: updatedAllNotif, updatedAt: new Date().toISOString() });
  return { ...existing, allNotif: updatedAllNotif };
};

exports.markAsRead = async ({ groupId, notifId, userId }) => {
  const ref = db.collection(TABLE).doc(groupId);
  const doc = await ref.get();
  if (!doc.exists) return null;
  const data = doc.data();
  const newAllNotif = (data.allNotif || []).map((n) => {
    if (n.id !== notifId) return n;
    const isRead = Array.isArray(n.isRead) ? n.isRead : [];
    if (isRead.includes(userId)) return n;
    return { ...n, isRead: [...isRead, userId] };
  });
  await ref.update({ allNotif: newAllNotif, updatedAt: new Date().toISOString() });
  return { id: doc.id, ...data, allNotif: newAllNotif };
};

exports.generateNotifId = () => db.collection(TABLE).doc().id;
