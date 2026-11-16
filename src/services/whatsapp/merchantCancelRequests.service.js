// Demande d'annulation du client sur une boutique WhatsApp (services/order/cancelRequest.service) :
// message au marchand avec les boutons Accepter / Refuser l'annulation (payloads
// `<orderId>:cancel_ok` / `<orderId>:cancel_no`). Message libre si la fenêtre de 24 h est
// ouverte ; refusé par Meta (131047) -> template `yam_demande_annulation` (n°, plats ; mêmes
// payloads). Enregistré par merchantOrders.registerMerchantOrderButtons. Doc : architecture/whatsapp.md.
const repos = require('../../repositories');
const { onButton, onSendFailed } = require('./webhookEvents.service');
const msg = require('./merchantMessages');
const { shopPhone, send, sendText, replyRecap } = require('./merchantChannel');
const { acceptCancelRequest, refuseCancelRequest } = require('../order/cancelRequest.service');

const OUT_OF_WINDOW = 131047;
const REF = 'cancelreq_';
const buttonsOf = order => [
  { id: `${order.id}:cancel_ok`, title: 'Accepter annulation' },
  { id: `${order.id}:cancel_no`, title: 'Refuser annulation' },
];

/** Demande d'annulation envoyée au marchand (message libre ; template si la fenêtre est close). */
exports.notifyCancelRequest = async (order, fastFood) => {
  const to = await shopPhone(fastFood);
  if (!to) return;
  const body = [
    `${Number(order.cancelRequest?.sentCount) > 1 ? 'Relance : le' : 'Le'} client demande l'annulation de la commande n°${msg.ref(order)}.`,
    `Plats : ${msg.plats(order)}`,
    `Livraison : ${msg.livraison(order)}`,
    '',
    "Accepter : la commande est annulée et le client remboursé. Refuser : la commande est maintenue. Si vous l'acceptez entre-temps, l'annulation n'est plus possible.",
  ].join('\n');
  await send({ to, type: 'interactive', reference: `${REF}${order.id}`, interactive: { kind: 'buttons', body, buttons: buttonsOf(order) } }, `Demande d'annulation ${order.id}`);
};

/** Message libre refusé hors fenêtre de 24 h : même demande par template. */
const onFailed = async event => {
  if (Number(event.error?.code) !== OUT_OF_WINDOW || !event.reference?.startsWith(REF)) return false;
  const order = await repos.orders.getById(event.reference.slice(REF.length));
  if (!order || order.status !== 'pending' || order.cancelRequest?.status !== 'pending') return true;
  const to = await shopPhone(await repos.fastfoods.getById(order.fastFoodId));
  if (!to) return true;
  await send(
    {
      to,
      type: 'template',
      reference: `${REF}tpl_${order.id}`,
      template: { name: 'yam_demande_annulation', language: 'fr', bodyParams: [msg.ref(order), msg.plats(order)], buttons: buttonsOf(order).map(b => ({ payload: b.id })) },
    },
    `Demande d'annulation (template) ${order.id}`
  );
  return true;
};

/** Bouton du marchand : seul le numéro de la boutique décide. */
const handle = decide => async ({ ref, event }) => {
  const order = await repos.orders.getById(ref);
  if (!order) return console.warn(`⚠️ [WHATSAPP] Demande d'annulation : commande ${ref} introuvable`);
  const to = await shopPhone(await repos.fastfoods.getById(order.fastFoodId));
  if (!to || to !== event.from) return console.warn(`⚠️ [WHATSAPP] Demande d'annulation ${ref} depuis ${event.from} : pas le numéro de la boutique`);
  await decide(order, to);
};

/** Le marchand accepte l'annulation (bouton ou agent IA). Renvoie le compte rendu. */
exports.acceptFromMerchant = async (order, to) => {
  const r = await acceptCancelRequest(order.id);
  const text = r.ok ? `Commande n°${msg.ref(order)} annulée à la demande du client. Le client est remboursé.` : `Commande n°${msg.ref(order)} : ${r.message}`;
  await sendText(to, text);
  return { ok: r.ok, message: text };
};

/** Le marchand refuse l'annulation : commande maintenue, récapitulatif + Accepter / Refuser. */
exports.refuseFromMerchant = async (order, to) => {
  const r = await refuseCancelRequest(order.id);
  if (!r.ok) {
    const text = `Commande n°${msg.ref(order)} : ${r.message}`;
    await sendText(to, text);
    return { ok: false, message: text };
  }
  await sendText(to, `Annulation refusée : la commande n°${msg.ref(order)} est maintenue. Le client est prévenu.`);
  await replyRecap(to, [r.order]);
  return { ok: true, message: `Annulation refusée, commande n°${msg.ref(order)} maintenue.` };
};

exports.registerCancelRequestFlows = () => {
  onButton('cancel_ok', handle(exports.acceptFromMerchant));
  onButton('cancel_no', handle(exports.refuseFromMerchant));
  onSendFailed(onFailed);
};
