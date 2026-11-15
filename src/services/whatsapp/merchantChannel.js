// Envoi WhatsApp commun aux flux marchands (boutique WhatsApp) : numéro de la boutique, envoi
// au module, étape suivante par bouton, récapitulatif après un changement de statut.
// Utilisé par merchantOrders.service.js et merchantTemplates.service.js. Doc : architecture/whatsapp.md.
const repos = require('../../repositories');
const wa = require('./whatsappModule.client');
const { getOtpSettings } = require('../settings/settings.service');
const { normalizePhoneNumber } = require('../../utils/validator/validatePhoneNumber');
const msg = require('./merchantMessages');

// Étape suivante proposée après chaque statut, une seule (la machine à états avance d'un cran).
// « Livrée » ne passe pas par un bouton : c'est le scan du QR code du client qui la valide.
const NEXT = {
  processing: { action: 'finished', title: 'Terminée' },
  finished: { action: 'delivering', title: 'En livraison' },
};

const QR_HINT = "\n\nÀ la remise, scannez avec l'appareil photo le QR code affiché dans l'app du client, puis envoyez le message qui s'ouvre : la livraison sera validée.";

/** Numéro WhatsApp E.164 de la boutique (null si absent ou invalide). */
const shopNumber = async fastFood => {
  if (!fastFood?.whatsappNumber) return null;
  const { defaultCountryCode } = await getOtpSettings();
  return normalizePhoneNumber(fastFood.whatsappNumber, defaultCountryCode);
};
/** Idem, seulement si la boutique est en mode WhatsApp. */
const shopPhone = async fastFood => (fastFood?.whatsappOrders ? shopNumber(fastFood) : null);

const send = async (body, what) => {
  const r = await wa.sendMessage(body);
  if (!r.ok) console.error(`❌ [WHATSAPP] ${what} vers ${body.to} : ${r.data?.message || `HTTP ${r.status}`}`);
  return r;
};
const sendText = (to, body) => send({ to, type: 'text', text: { body } }, 'Message');

/** Message libre + bouton(s) de la suite : Accepter / Refuser (pending) ou l'étape suivante. */
const sendStep = (to, body, order) => {
  const buttons =
    order.status === 'pending'
      ? [{ id: `${order.id}:accept`, title: 'Accepter' }, { id: `${order.id}:refuse`, title: 'Refuser' }]
      : NEXT[order.status] && [{ id: `${order.id}:${NEXT[order.status].action}`, title: NEXT[order.status].title }];
  if (!buttons) return sendText(to, body);
  return send({ to, type: 'interactive', reference: `order_${order.id}`, interactive: { kind: 'buttons', body, buttons } }, `Suivi ${order.id}`);
};

/** Un panier (`groupId`) = un seul message : clé `g:<groupId>:<fastFoodId>`, sinon l'id de la commande. */
const batchesOf = orders => {
  const groups = new Map();
  for (const o of orders) {
    const k = o.groupId ? `g:${o.groupId}:${o.fastFoodId}` : o.id;
    groups.set(k, [...(groups.get(k) || []), o]);
  }
  return new Map([...groups].map(([k, list]) => [list.length > 1 ? k : list[0].id, list]));
};

/** Récapitulatif (vue marchand) + statut + bouton de la suite, relu en base, par commande. */
const replyRecap = async (to, orders) => {
  const { toMerchantView } = require('../order/toMerchantView');
  const fresh = await toMerchantView(await Promise.all(orders.map(o => repos.orders.getById(o.id))));
  for (const o of fresh) {
    const body = `${msg.recap(o, o.total)}\nStatut : ${msg.statusLabel(o.status)}${o.status === 'delivering' ? QR_HINT : ''}`;
    await sendStep(to, body, o);
  }
};

module.exports = { NEXT, QR_HINT, shopNumber, shopPhone, send, sendText, sendStep, batchesOf, replyRecap };
