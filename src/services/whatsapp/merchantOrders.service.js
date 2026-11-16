// Flux marchands « boutique WhatsApp » (marchand sans l'app) : nouvelle commande payée
// (template yam_nouvelle_commande), Accepter / Refuser, suivi des statuts par boutons,
// validation « LIVRÉ » et message du versement. Envoi commun : merchantChannel.js.
// notifyNewOrders : appelé par services/order/{createOrder,updateOrders.service}.js ;
// registerMerchantOrderButtons : appelé au démarrage (src/app.js). Doc : architecture/whatsapp.md.
const repos = require('../../repositories');
const { onButton, onText } = require('./webhookEvents.service');
const msg = require('./merchantMessages');
const { shopNumber, shopPhone, send, sendText, batchesOf, replyRecap } = require('./merchantChannel');
const { registerMerchantTemplateFlows } = require('./merchantTemplates.service');

// Statut attendu avant chaque action : un double clic ne fait pas avancer deux fois.
const EXPECTED = { accept: 'pending', refuse: 'pending', finished: 'processing', delivering: 'finished' };
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
    for (const [key, orders] of batchesOf(merchantOrders)) {
      const first = orders[0];
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
  const payload = todo.map(o => ({ id: o.id, fastFoodId: o.fastFoodId, ...(action === 'refuse' ? { status: 'cancelByFastFood' } : {}) }));
  const r = await updateOrders(payload, fastFood.userId);
  if (!r?.success) return sendText(to, `Commande n°${todo.map(msg.ref).join(', ')} : ${r?.message || 'mise à jour impossible'}.`);

  if (action === 'refuse') return sendText(to, `Commande n°${todo.map(msg.ref).join(', ')} refusée. Le client sera remboursé.`);

  await replyRecap(to, todo);
};

// Message prérempli par le QR code du client : « LIVRÉ <orderId> <code> ».
const DELIVERED_RE = /^\s*LIVR[ÉE]E?\s+(\S+)\s+(\S+)/i;

/** Validation de livraison envoyée depuis le numéro WhatsApp de la boutique. true si c'était ce message. */
const onDeliveredText = async event => {
  const match = DELIVERED_RE.exec(event.text || '');
  if (!match) return false;
  const [, orderId, code] = match;
  const order = await repos.orders.getById(orderId);
  const fastFood = order ? await repos.fastfoods.getById(order.fastFoodId) : null;
  if (!order || (await shopNumber(fastFood)) !== event.from) {
    console.warn(`⚠️ [WHATSAPP] « LIVRÉ ${orderId} » de ${event.from} : commande inconnue ou pas le numéro de la boutique`);
    await sendText(event.from, 'Validation refusée : ce code doit être envoyé depuis le numéro WhatsApp de la boutique qui livre la commande.');
    return true;
  }
  // Chargé ici : confirmDelivery charge updateOrders, qui charge ce fichier.
  const { confirmDelivery } = require('../order/confirmDelivery.service');
  const r = await confirmDelivery({ orderId, code, channel: 'whatsapp' });
  await sendText(event.from, r.success ? `Commande n°${msg.ref(order)} : livraison validée.${payoutLine(r.payout)}` : `Commande n°${msg.ref(order)} : ${r.message}.`);
  return true;
};

/** Ligne « versement » de la réponse à « LIVRÉ » (orderPayout.service). */
const payoutLine = p => {
  if (p?.status === 'pending') return `\nVersement de ${p.sentAmount} FCFA en cours vers le ${p.phone}.`;
  if (p?.status === 'failed') return "\nLe versement n'a pas pu partir : l'équipe Yaammoo s'en occupe.";
  return '';
};

/**
 * Verdict du versement d'une commande (webhookPayout.service, kind 'order') : message au
 * marchand sur WhatsApp. Best-effort : hors fenêtre de 24 h, Meta refuse et c'est logué.
 */
exports.notifyOrderPayout = async (withdrawal, ok) => {
  const shop = withdrawal.fastFoodId ? await repos.fastfoods.getById(withdrawal.fastFoodId) : null;
  const to = await shopPhone(shop);
  if (!to) return;
  const ref = msg.ref({ id: withdrawal.orderId || '' });
  await sendText(to, ok ? `Versement reçu : ${withdrawal.amount} FCFA envoyés sur le ${withdrawal.phone} (commande n°${ref}).` : `Le versement de ${withdrawal.amount} FCFA pour la commande n°${ref} a échoué. L'équipe Yaammoo le relance.`);
};

/** Abonne les boutons des messages marchands (payload `<ref>:<action>`), la validation « LIVRÉ »,
 * les flux par template (rappel, statut hors fenêtre : merchantTemplates.service), puis l'agent IA
 * (ai/merchantAgent.service : journal, boutons Confirmer / Annuler, texte libre — en DERNIER). */
exports.registerMerchantOrderButtons = () => {
  for (const action of Object.keys(EXPECTED)) onButton(action, handle(action));
  onText(onDeliveredText);
  registerMerchantTemplateFlows();
  require('./ai/merchantAgent.service').registerMerchantAgent();
};
