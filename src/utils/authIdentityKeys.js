// Identites de connexion d'un compte Firebase (email, telephone, sub de chaque
// fournisseur). Sert a retrouver un compte supprime puis recree (nouvel uid).
const { admin } = require('../config/firebase');

exports.identityKeys = async uid => {
  const rec = await admin.auth().getUser(uid).catch(() => null);
  if (!rec) return [];
  const keys = new Set();
  if (rec.email) keys.add(`email:${rec.email.toLowerCase()}`);
  if (rec.phoneNumber) keys.add(`phone:${rec.phoneNumber}`);
  for (const p of rec.providerData || []) {
    if (p.email) keys.add(`email:${p.email.toLowerCase()}`);
    if (p.phoneNumber) keys.add(`phone:${p.phoneNumber}`);
    if (p.providerId && p.uid && p.providerId !== 'password' && p.providerId !== 'phone') keys.add(`${p.providerId}:${p.uid}`);
  }
  return [...keys];
};
