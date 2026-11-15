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

/** « 2X Poulet DG, frites, 1X jus de bissap » : plat, extras cochés, boissons cochées. */
exports.plats = order => {
  const parts = [`${order.quantity || 1}X ${oneLine(order.menu?.name || order.menu?.titre || 'plat')}`];
  for (const e of order.extra || []) if (e?.status) parts.push(oneLine(e.name));
  for (const d of order.drink || []) if (d?.status) parts.push(`${d.quantite || 1}X ${oneLine(d.name)}`);
  return parts.join(', ');
};

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const TZ = 'Africa/Douala';
const isoDay = date => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date); // AAAA-MM-JJ

/** « aujourd'hui », « demain », sinon « 16 novembre » (heure du Cameroun). */
const dayLabel = date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return date || '';
  const now = new Date();
  if (date === isoDay(now)) return "aujourd'hui";
  if (date === isoDay(new Date(now.getTime() + 864e5))) return 'demain';
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
};
const when = d => [dayLabel(d.date), d.time && `à ${d.time}`].filter(Boolean).join(' ');

/** « Bastos, aujourd'hui à 14:30 », « Bastos, express », « Retrait demain à 12:00 ». */
exports.livraison = order => {
  const d = order.delivery || {};
  if (d.status !== true) return oneLine(`Retrait ${when(d)}`) === 'Retrait' ? 'Retrait sur place' : oneLine(`Retrait ${when(d)}`);
  const slot = d.type === 'express' ? 'express' : when(d);
  return oneLine([d.zone || d.location, slot].filter(Boolean).join(', ')) || 'Livraison';
};

/** Montant en FCFA avec espaces : 6500 -> « 6 500 ». */
exports.montant = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

exports.statusLabel = s => STATUS_LABEL[s] || s;

/** Récapitulatif d'une commande acceptée (message libre). */
exports.recap = (order, amount) =>
  [`Commande n°${exports.ref(order)}`, `Plats : ${exports.plats(order)}`, `Livraison : ${exports.livraison(order)}`, `Montant : ${exports.montant(amount)} FCFA`].join('\n');
