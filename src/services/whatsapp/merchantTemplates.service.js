// Flux marchands par template (boutique WhatsApp), hors réponse immédiate à un clic :
//  - rappel d'une nouvelle commande sans réponse (yam_rappel_commande, utils/whatsappReminderJob.js) ;
//  - livraison validée depuis l'app (yam_commande_livree, confirmDelivery.service) ;
//  - message de suivi refusé par Meta, fenêtre de 24 h fermée (yam_statut_commande) : le
//    marchand redonne le statut par bouton, le backend avance la commande jusque-là.
// Enregistré par merchantOrders.service (registerMerchantOrderButtons). Doc : architecture/whatsapp.md.
const repos = require('../../repositories');
const { onButton, onSendFailed } = require('./webhookEvents.service');
const msg = require('./merchantMessages');
const { shopPhone, send, sendText, batchesOf, replyRecap } = require('./merchantChannel');

// Erreur Meta « message hors fenêtre de 24 h » (re-engagement) : seul un template passe.
const OUT_OF_WINDOW = 131047;

/**
 * Rappel UNIQUE des commandes payées encore `pending` (une ligne wa_order_reminders par
 * commande, prise avant l'envoi). Boutons Accepter / Refuser = ceux de yam_nouvelle_commande.
 */
exports.remindPendingOrders = async orders => {
  const byShop = new Map();
  for (const o of orders) byShop.set(o.fastFoodId, [...(byShop.get(o.fastFoodId) || []), o]);
  for (const [fastFoodId, list] of byShop) {
    const to = await shopPhone(await repos.fastfoods.getById(fastFoodId));
    if (!to) continue;
    const claimed = new Set(await repos.waOrderReminders.claim(list.map(o => o.id)));
    const todo = list.filter(o => claimed.has(o.id));
    for (const [key, batch] of batchesOf(todo)) {
      const since = Math.min(...batch.map(o => new Date(o.updatedAt || o.createdAt).getTime()));
      const minutes = Math.max(1, Math.round((Date.now() - since) / 60000));
      await send(
        {
          to,
          type: 'template',
          reference: `order_${batch[0].id}`,
          template: {
            name: 'yam_rappel_commande',
            language: 'fr',
            bodyParams: [batch.map(msg.ref).join(', '), batch.map(msg.plats).join(' ; '), String(minutes)],
            buttons: [{ payload: `${key}:accept` }, { payload: `${key}:refuse` }],
          },
        },
        `Rappel ${key}`
      );
    }
  }
};

/** Livraison validée depuis l'app (scan du QR) : trace sur le WhatsApp de la boutique. */
exports.notifyDelivered = async order => {
  const to = await shopPhone(await repos.fastfoods.getById(order.fastFoodId));
  if (!to) return;
  await send({ to, type: 'template', reference: `order_${order.id}`, template: { name: 'yam_commande_livree', language: 'fr', bodyParams: [msg.ref(order), msg.plats(order)] } }, `Livrée ${order.id}`);
};

// Boutons de yam_statut_commande, dans l'ordre du template : statut que le marchand déclare.
const STATUS_BUTTONS = [
  ['st_pending', 'pending'],
  ['st_processing', 'processing'],
  ['st_finished', 'finished'],
  ['st_delivering', 'delivering'],
  ['st_delivered', 'delivering'], // « Livrée » se valide par le QR du client : on va jusqu'à « en livraison »
];
const RANK = { pending: 0, processing: 1, finished: 2, delivering: 3 };

/** Suivi d'une commande refusé hors fenêtre : on redemande le statut par template. */
const onFailed = async event => {
  if (Number(event.error?.code) !== OUT_OF_WINDOW || !event.reference?.startsWith('order_')) return false;
  const order = await repos.orders.getById(event.reference.slice('order_'.length));
  if (!order || !(order.status in RANK)) return false;
  const to = await shopPhone(await repos.fastfoods.getById(order.fastFoodId));
  if (!to) return false;
  await send(
    {
      to,
      type: 'template',
      reference: `status_${order.id}`,
      template: { name: 'yam_statut_commande', language: 'fr', bodyParams: [msg.ref(order), msg.plats(order)], buttons: STATUS_BUTTONS.map(([action]) => ({ payload: `${order.id}:${action}` })) },
    },
    `Statut ${order.id}`
  );
  return true;
};

/** Le marchand déclare un statut : la commande avance pas à pas (updateOrders) jusqu'à lui. */
const handleStatus = (action, target) => async ({ ref, event }) => {
  const order = await repos.orders.getById(ref);
  if (!order) return console.warn(`⚠️ [WHATSAPP] Bouton ${action} : commande ${ref} introuvable`);
  const fastFood = await repos.fastfoods.getById(order.fastFoodId);
  const to = await shopPhone(fastFood);
  if (!to || to !== event.from) return console.warn(`⚠️ [WHATSAPP] Bouton ${action} sur ${ref} depuis ${event.from} : pas le numéro de la boutique`);
  if (!(order.status in RANK)) return sendText(to, `Commande n°${msg.ref(order)} : déjà ${msg.statusLabel(order.status)}.`);

  // Chargé ici : updateOrders appelle notifyNewOrders (dépendance circulaire sinon).
  const { updateOrders } = require('../order/updateOrders.service');
  for (let step = RANK[order.status]; step < RANK[target]; step += 1) {
    const r = await updateOrders([{ id: order.id, fastFoodId: order.fastFoodId }], fastFood.userId);
    if (!r?.success) return sendText(to, `Commande n°${msg.ref(order)} : ${r?.message || 'mise à jour impossible'}.`);
  }
  // En livraison : le récapitulatif rappelle de scanner le QR du client (« Livrée »).
  await replyRecap(to, [order]);
};

exports.registerMerchantTemplateFlows = () => {
  for (const [action, target] of STATUS_BUTTONS) onButton(action, handleStatus(action, target));
  onSendFailed(onFailed);
};
