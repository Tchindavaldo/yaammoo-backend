// Flux marchands « boutique WhatsApp » (marchand sans l'app) : nouvelle commande payée
// (template yam_nouvelle_commande), Accepter / Refuser, puis suivi des statuts par boutons.
// notifyNewOrders : appelé par services/order/{createOrder,updateOrders.service}.js ;
// registerMerchantOrderButtons : appelé au démarrage (src/app.js). Doc : architecture/whatsapp.md.
const repos = require('../../repositories');
const wa = require('./whatsappModule.client');
const { onButton } = require('./webhookEvents.service');
const { getOtpSettings } = require('../settings/settings.service');
const { normalizePhoneNumber } = require('../../utils/validator/validatePhoneNumber');
const msg = require('./merchantMessages');

// Statut attendu avant chaque action : un double clic ne fait pas avancer deux fois.
const EXPECTED = { accept: 'pending', refuse: 'pending', finished: 'processing', delivering: 'finished' };
// Étape suivante proposée après chaque statut, une seule (la machine à états avance d'un cran).
// « Livrée » ne passe pas par un bouton : c'est le scan du QR code du client qui la valide.
const NEXT = {
  processing: { action: 'finished', title: 'Terminée' },
  finished: { action: 'delivering', title: 'En livraison' },
};

/** Numéro E.164 de la boutique si elle est en mode WhatsApp, sinon null. */
const shopPhone = async fastFood => {
  if (!fastFood?.whatsappOrders || !fastFood.whatsappNumber) return null;
  const { defaultCountryCode } = await getOtpSettings();
  return normalizePhoneNumber(fastFood.whatsappNumber, defaultCountryCode);
};

const send = async (body, what) => {
  const r = await wa.sendMessage(body);
  if (!r.ok) console.error(`❌ [WHATSAPP] ${what} vers ${body.to} : ${r.data?.message || `HTTP ${r.status}`}`);
  return r;
};
const sendText = (to, body) => send({ to, type: 'text', text: { body } }, 'Message');
const sendStep = (to, body, order) => {
  const next = NEXT[order.status];
  if (!next) return sendText(to, body);
  return send({ to, type: 'interactive', reference: `order_${order.id}`, interactive: { kind: 'buttons', body, buttons: [{ id: `${order.id}:${next.action}`, title: next.title }] } }, `Suivi ${order.id}`);
};

/**
 * Nouvelles commandes payées d'une boutique, vue marchand (`total` = ce qu'il encaisse).
 * Un panier (`groupId`) = un seul message ; sinon un message par commande. Ne lève jamais.
 */
exports.notifyNewOrders = async (fastFoodId, merchantOrders) => {
  try {
    if (!fastFoodId || !merchantOrders?.length) return;
    const fastFood = await repos.fastfoods.getById(fastFoodId);
    const to = await shopPhone(fastFood);
    if (!to || !merchantOrders?.length) return;
    const batches = new Map();
    for (const o of merchantOrders) {
      const k = o.groupId ? `g:${o.groupId}:${o.fastFoodId}` : o.id;
      batches.set(k, [...(batches.get(k) || []), o]);
    }
    for (const [k, orders] of batches) {
      const first = orders[0];
      const key = orders.length > 1 ? k : first.id;
      const image = first.menu?.images?.[0] || fastFood.image;
      const amount = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
      await send(
        {
          to,
          type: 'template',
          reference: `order_${first.id}`,
          template: {
            name: 'yam_nouvelle_commande',
            language: 'fr',
            ...(image ? { headerMedia: { type: 'image', link: image } } : {}),
            bodyParams: [orders.map(msg.ref).join(', '), orders.map(msg.plats).join(' ; '), msg.livraison(first), msg.montant(amount)],
            buttons: [{ payload: `${key}:accept` }, { payload: `${key}:refuse` }],
          },
        },
        `Nouvelle commande ${key}`
      );
    }
  } catch (e) {
    console.error('❌ [WHATSAPP] notifyNewOrders', e);
  }
};

/** Commandes visées par un bouton : une commande (`<id>`) ou un panier (`g:<groupId>:<fastFoodId>`). */
const ordersOf = async ref => {
  if (ref.startsWith('g:')) {
    const [, groupId, fastFoodId] = ref.split(':');
    return groupId && fastFoodId ? repos.orders.getByGroup(groupId, fastFoodId) : [];
  }
  const order = await repos.orders.getById(ref);
  return order ? [order] : [];
};

const handle = action => async ({ ref, event }) => {
  const orders = await ordersOf(ref);
  if (!orders.length) return console.warn(`⚠️ [WHATSAPP] Bouton ${action} : commande ${ref} introuvable`);
  const fastFood = await repos.fastfoods.getById(orders[0].fastFoodId);
  const to = await shopPhone(fastFood);
  // Seul le numéro WhatsApp de la boutique pilote ses commandes.
  if (!to || to !== event.from) return console.warn(`⚠️ [WHATSAPP] Bouton ${action} sur ${ref} depuis ${event.from} : pas le numéro de la boutique`);

  const todo = orders.filter(o => o.status === EXPECTED[action]);
  if (!todo.length) return sendText(to, orders.map(o => `Commande n°${msg.ref(o)} : déjà ${msg.statusLabel(o.status)}.`).join('\n'));

  // Chargé ici : updateOrders appelle notifyNewOrders (dépendance circulaire sinon).
  const { updateOrders } = require('../order/updateOrders.service');
  const { toMerchantView } = require('../order/toMerchantView');
  const payload = todo.map(o => ({ id: o.id, fastFoodId: o.fastFoodId, ...(action === 'refuse' ? { status: 'cancelByFastFood' } : {}) }));
  const r = await updateOrders(payload, fastFood.userId);
  if (!r?.success) return sendText(to, `Commande n°${todo.map(msg.ref).join(', ')} : ${r?.message || 'mise à jour impossible'}.`);

  if (action === 'refuse') return sendText(to, `Commande n°${todo.map(msg.ref).join(', ')} refusée. Le client sera remboursé.`);

  const fresh = await toMerchantView(await Promise.all(todo.map(o => repos.orders.getById(o.id))));
  for (const o of fresh) {
    let body = `${msg.recap(o, o.total)}\nStatut : ${msg.statusLabel(o.status)}`;
    if (o.status === 'delivering') body += "\n\nÀ la remise, scannez le QR code affiché dans l'app du client pour valider la livraison.";
    await sendStep(to, body, o);
  }
};

/** Abonne les boutons des messages marchands (payload `<ref>:<action>`). */
exports.registerMerchantOrderButtons = () => {
  for (const action of Object.keys(EXPECTED)) onButton(action, handle(action));
};
