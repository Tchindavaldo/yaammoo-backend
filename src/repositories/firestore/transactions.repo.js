// ============================================================================
// Transactions Repository — Firestore
// ============================================================================
const { db } = require('../../config/firebase');

// Note : la collection s'appelle 'transaction' (singulier) en Firestore.
const TABLE = 'transaction';

exports.create = async (data) => {
  const txData = { ...data, createdAt: data.createdAt || new Date().toISOString() };
  const docRef = await db.collection(TABLE).add(txData);
  const snap = await docRef.get();
  return { id: docRef.id, ...snap.data() };
};

exports.getById = async (id) => {
  const doc = await db.collection(TABLE).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
};

exports.getByUser = async (userId) => {
  const snap = await db
    .collection(TABLE)
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// ===== Idempotence (Webhook + Socket) =====

/**
 * Réserve le règlement d'une transaction (atomique via Firestore transaction).
 * Retourne true si cette entrée a été créée (c'est le premier chemin).
 * Retourne false si déjà présent (l'autre chemin a déjà traité).
 */
exports.reserveSettlement = async (transactionId, settledBy, status) => {
  const settlementRef = db.collection('transactionSettlements').doc(transactionId);

  return db.runTransaction(async (t) => {
    const snap = await t.get(settlementRef);
    if (snap.exists) {
      // Déjà réglée par l'autre chemin
      return false;
    }
    // Première fois → créer
    t.set(settlementRef, {
      transactionId,
      settledBy,
      status,
      settledAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    return true;
  });
};

/**
 * Récupère le statut de règlement d'une transaction.
 * Retourne { settledBy, status, settledAt } ou null si pas encore réglée.
 */
exports.getSettlement = async (transactionId) => {
  const snap = await db
    .collection('transactionSettlements')
    .doc(transactionId)
    .get();
  if (!snap.exists) return null;
  const data = snap.data();
  return {
    settledBy: data.settledBy,
    status: data.status,
    settledAt: data.settledAt,
  };
};
