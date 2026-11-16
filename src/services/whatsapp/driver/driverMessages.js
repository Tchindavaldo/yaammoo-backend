// Textes WhatsApp envoyés aux livreurs des boutiques WhatsApp (fiche de course, consignes).
// Le livreur reçoit, lui, les coordonnées du client (nom, téléphone, lien carte, note) :
// le marchand et le modèle IA ne les voient pas (whatsapp-ai.md, « Livreurs »).
const msg = require('../merchantMessages');

const oneLine = s =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/** Lien Google Maps depuis `delivery.location` (« lat, lng ») ; null si illisible. */
const mapLink = location => {
  const m = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/.exec(String(location || ''));
  return m ? `https://maps.google.com/?q=${m[1]},${m[2]}` : null;
};

/** Téléphone du client à appeler : contact de la commande, sinon celui du compte. */
const clientPhone = order => {
  const p = order.delivery?.phone || order.userData?.phoneNumber;
  return p && String(p) !== '0' ? String(p) : null;
};

const clientName = order => oneLine([order.userData?.firstName, order.userData?.lastName].filter(Boolean).join(' ')) || null;

const QR_LINE = "À la remise, scannez avec l'appareil photo le QR code affiché dans l'app du client, puis envoyez le message qui s'ouvre : la livraison est validée et la part de la boutique arrive sur votre numéro Orange Money / MTN MoMo.";

/**
 * Fiche d'une commande pour le livreur. `amount` = part de la boutique (vue marchand),
 * qu'il reçoit au scan du QR du client.
 */
exports.card = (order, shopName, amount) => {
  const d = order.delivery || {};
  const lines = [`Commande n°${msg.ref(order)} — ${oneLine(shopName)}`, `Plats : ${msg.plats(order)}`, `Livraison : ${msg.livraison(order)}`];
  const link = mapLink(d.location);
  if (link) lines.push(`Adresse : ${link}`);
  if (d.note) lines.push(`Note du client : ${oneLine(d.note)}`);
  if (/^https:\/\//.test(d.voiceNoteUri || '')) lines.push(`Note vocale : ${d.voiceNoteUri}`);
  const name = clientName(order);
  const phone = clientPhone(order);
  if (name || phone) lines.push(`Client : ${[name, phone].filter(Boolean).join(', ')}`);
  lines.push(`Part de la boutique : ${msg.montant(amount)} FCFA`);
  lines.push(`Statut : ${msg.statusLabel(order.status)}`);
  return lines.join('\n');
};

exports.QR_LINE = QR_LINE;

/** Message de bienvenue d'un livreur ajouté par la boutique. */
exports.welcome = (shopName, payoutReady) =>
  [
    `Bonjour, la boutique ${oneLine(shopName)} vous a ajouté comme livreur sur Yaammoo.`,
    "Vous recevrez ici les commandes à livrer. Répondez à ce numéro pour toute question sur vos livraisons : l'assistant Yaammoo vous répond.",
    payoutReady
      ? ''
      : "Avant votre première livraison, envoyez votre numéro Orange Money ou MTN MoMo : c'est là qu'arrive la part de la boutique au scan du QR code du client. Si c'est ce numéro WhatsApp, répondez simplement « mon numéro de paiement est celui-ci » ; sinon, envoyez le numéro et renvoyez ici le code reçu par SMS.",
  ]
    .filter(Boolean)
    .join('\n\n');
