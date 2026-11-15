// Textes des messages WhatsApp envoyés aux marchands « boutique WhatsApp » (variables de template,
// messages libres). Utilisé par services/whatsapp/merchantOrders.service.js. Aucune variable ne
// contient de retour à la ligne (règle Meta).

const STATUS_LABEL = {
  pending: 'en attente',
  processing: 'en cours',
  finished: 'terminée',
  delivering: 'livraison en cours',
  delivered: 'livrée',
  cancelByFastFood: 'refusée',
  cancelByUser: 'annulée par le client',
};

const oneLine = s => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Référence courte montrée au marchand (fin de l'id, en majuscules). */
exports.ref = order => String(order.id || '').slice(-6).toUpperCase();

/** « 2 Poulet DG, frites, 1 jus de bissap » : plat, extras cochés, boissons cochées. */
exports.plats = order => {
  const parts = [`${order.quantity || 1} ${oneLine(order.menu?.name || order.menu?.titre || 'plat')}`];
  for (const e of order.extra || []) if (e?.status) parts.push(oneLine(e.name));
  for (const d of order.drink || []) if (d?.status) parts.push(`${d.quantite || 1} ${oneLine(d.name)}`);
  return parts.join(', ');
};

/** « Bastos, 16/11 à 14:30 », « Bastos, express », « Retrait à 12:00 ». */
exports.livraison = order => {
  const d = order.delivery || {};
  if (d.status !== true) return d.time ? `Retrait à ${d.time}` : 'Retrait sur place';
  const day = /^\d{4}-\d{2}-\d{2}$/.test(d.date || '') ? `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}` : d.date;
  const when = d.type === 'express' ? 'express' : [day, d.time && `à ${d.time}`].filter(Boolean).join(' ');
  return oneLine([d.zone || d.location, when].filter(Boolean).join(', ')) || 'Livraison';
};

/** Montant en FCFA avec espaces : 6500 -> « 6 500 ». */
exports.montant = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

exports.statusLabel = s => STATUS_LABEL[s] || s;

/** Récapitulatif d'une commande acceptée (message libre). */
exports.recap = (order, amount) =>
  [`Commande n°${exports.ref(order)}`, `Plats : ${exports.plats(order)}`, `Livraison : ${exports.livraison(order)}`, `Montant : ${exports.montant(amount)} FCFA`].join('\n');
