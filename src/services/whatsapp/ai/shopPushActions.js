// Notification push d'une boutique WhatsApp à ses clients (migration 098) : l'agent IA du
// marchand la propose (outil propose_push), le marchand confirme par le bouton, puis
// l'envoi passe par le service des notifications boutique, avec le PLAN et le QUOTA de la
// boutique (forfait gratuit aujourd'hui : notifications-broadcast.md). Exécuté par
// pendingActions.execute. Doc : architecture/whatsapp-ai.md.
const { sendText } = require('../merchantChannel');

/** Envoie la notification confirmée. Renvoie le compte rendu (aussi envoyé au marchand). */
exports.apply = async (pending, fastFood, to) => {
  const { sendBroadcast } = require('../../notification/broadcast/broadcast.service');
  const p = pending.payload || {};
  const r = await sendBroadcast({
    fastFoodId: fastFood.id,
    senderUid: fastFood.userId,
    payload: { title: p.title, ...(p.body ? { body: p.body } : {}), audience: p.audience, ...(p.city ? { city: p.city } : {}) },
  });
  const report = r.status === 201 ? `Notification envoyée ${p.audience === 'city' ? `aux utilisateurs de ${p.city}` : 'à vos clients'}.` : `Notification non envoyée : ${r.message}`;
  await sendText(to, report, 'ai');
  return report;
};
