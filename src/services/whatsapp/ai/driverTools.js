// Outils (function calling) de l'agent IA du LIVREUR WhatsApp. Le livreur agit tout de
// suite (décision du 16/11/2026) : départ en livraison sans boutons de confirmation. Les
// coordonnées du client ne passent jamais par le modèle : send_order_details envoie la
// fiche directement. `ctx` = { phone, user, uid, shops, orders, views, payoutReady, flags }.
// Doc : architecture/whatsapp-ai.md (« Livreurs »).
const { resolveRefs } = require('./agentOrders');
const { fn, runTool } = require('./agentLoop');
const { shopPhone, sendText } = require('../merchantChannel');
const deliveries = require('../driver/driverDeliveries.service');
const accounts = require('../driver/driverAccounts.service');
const msg = require('../merchantMessages');
const text = require('../driver/driverMessages');
const dir = require('../driver/driverDirectory');

const refs = { type: 'array', items: { type: 'string' }, description: 'Numéros de commande (6 caractères, ex. A1B2C3) ou ids complets' };
const ACTIVE = ['pending', 'processing', 'finished', 'delivering'];

exports.definitions = [
  fn('list_my_orders', 'Commandes confiées au livreur (30 derniers jours). Par défaut : celles en cours.', {
    statuts: { type: 'array', items: { type: 'string', enum: ['pending', 'processing', 'finished', 'delivering', 'delivered', 'cancelByFastFood', 'cancelByUser'] } },
  }),
  fn('send_order_details', 'Envoie au livreur la fiche complète des commandes : adresse (lien carte), nom et téléphone du client, note, part de la boutique.', { refs }, ['refs']),
  fn('start_delivery', 'Le livreur part avec ces commandes : elles passent en « livraison en cours » tout de suite, et la boutique est prévenue.', { refs }, ['refs']),
  fn(
    'message_shop',
    'Envoie un message du livreur à la boutique (commande pas prête, client injoignable, retard, question).',
    { texte: { type: 'string' }, boutique: { type: 'string', description: 'Nom de la boutique (seulement s’il en sert plusieurs)' } },
    ['texte']
  ),
  fn(
    'register_payout_number',
    "Enregistre le numéro Orange Money / MTN MoMo du livreur. Sans numéro : celui d'où il écrit, validé tout de suite. Avec un autre numéro : Yaammoo envoie un code par SMS à ce numéro, que le livreur renvoie ici (verify_payout_number).",
    {
      telephone: { type: 'string', description: "Numéro OM / MoMo s'il est différent de son numéro WhatsApp" },
    }
  ),
  fn('verify_payout_number', 'Vérifie le code SMS que le livreur a reçu sur son numéro Orange Money / MTN MoMo, et valide ce numéro.', { telephone: { type: 'string' }, code: { type: 'string' } }, ['telephone', 'code']),
];

// Frais du code SMS : à la boutique du livreur (la plus récente s'il en sert plusieurs).
const billUserOf = ctx => ctx.shops[0]?.userId || null;

const pick = (ctx, list) => {
  const { found, missing } = resolveRefs(list, ctx.orders);
  if (missing.length) return { error: `Commandes introuvables parmi celles qui vous sont confiées : ${missing.join(', ')}` };
  return found.length ? { found } : { error: 'Aucune commande désignée.' };
};

const handlers = {
  list_my_orders: async (ctx, { statuts }) => {
    const wanted = statuts?.length ? statuts : ACTIVE;
    return { commandes: ctx.views.filter(v => wanted.includes(v.statut)) };
  },

  send_order_details: async (ctx, { refs: list }) => {
    const { found, error } = pick(ctx, list);
    if (error) return { error };
    for (const o of found) await deliveries.sendCard(ctx.phone, o, ctx.shops.find(s => s.id === o.fastFoodId) || { name: 'Yaammoo' }, 'ai');
    ctx.flags.replied = true;
    return { ok: true, info: 'Fiches envoyées au livreur.' };
  },

  start_delivery: async (ctx, { refs: list }) => {
    if (!ctx.payoutReady) return { error: 'Numéro Orange Money / MTN MoMo pas encore validé : il ne peut pas partir en livraison avant (register_payout_number).' };
    const { found, error } = pick(ctx, list);
    if (error) return { error };
    const { started, lines } = await deliveries.startDelivery(ctx.user, found);
    const out = [...lines, ...(started.length ? [`Commande n°${started.map(msg.ref).join(', n°')} : livraison en cours. ${text.QR_LINE}`] : [])];
    if (out.length) await sendText(ctx.phone, out.join('\n\n'));
    ctx.flags.replied = true;
    await ctx.reload();
    return started.length ? { ok: true, enLivraison: started.length, problemes: lines } : { error: 'Aucune commande passée en livraison.', details: lines };
  },

  message_shop: async (ctx, { texte, boutique }) => {
    const shop = ctx.shops.length === 1 || !boutique ? ctx.shops[0] : ctx.shops.find(s => String(s.name).toLowerCase().includes(String(boutique).toLowerCase()));
    if (!shop) return { error: `Boutique « ${boutique} » introuvable parmi celles que vous servez.` };
    const to = await shopPhone(shop);
    if (!to) return { error: "La boutique n'a pas de numéro WhatsApp." };
    const r = await deliveries.relay(to, ctx.phone, `Message du livreur ${dir.nameOf(ctx.user)} : ${String(texte).slice(0, 900)}`);
    return r.ok ? { ok: true, info: `Message envoyé à ${shop.name}.` } : { error: "L'envoi a échoué." };
  },

  register_payout_number: async (ctx, { telephone }) => {
    const r = await accounts.registerPayoutNumber({ driverUser: ctx.user, fromPhone: ctx.phone, phone: telephone, billUserId: billUserOf(ctx) });
    if (!r.ok) return { error: r.message };
    await sendText(ctx.phone, r.message);
    if (r.verified) ctx.payoutReady = true;
    ctx.flags.replied = true;
    return { ok: true, valide: !!r.verified, codeEnvoye: !!r.codeSent, info: r.message };
  },

  verify_payout_number: async (ctx, { telephone, code }) => {
    const r = await accounts.verifyPayoutCode({ driverUser: ctx.user, fromPhone: ctx.phone, phone: telephone, code, billUserId: billUserOf(ctx) });
    if (!r.ok) return { error: r.message };
    await sendText(ctx.phone, r.message);
    ctx.payoutReady = true;
    ctx.flags.replied = true;
    return { ok: true, valide: true, info: r.message };
  },
};

/** Exécute un appel d'outil du modèle. Renvoie toujours un objet (erreur comprise). */
exports.run = (ctx, name, rawArgs) => runTool(handlers, ctx, name, rawArgs);
