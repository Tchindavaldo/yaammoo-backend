// Journal de la conversation WhatsApp avec chaque boutique et chaque livreur (table
// wa_conversation_messages, migration 090) : tout message reçu du numéro d'une boutique
// WhatsApp ou d'un de ses livreurs, et tout message que Yaammoo envoie (merchantChannel.send).
// Les agents IA relisent ce journal à chaque réponse (services/whatsapp/ai/). Ne lève jamais :
// un échec d'écriture est journalisé.
// Doc : architecture/whatsapp-ai.md.
const repos = require('../../repositories');

// Libellés lisibles des templates envoyés au marchand (le texte exact vit chez Meta).
const TEMPLATE_LABEL = {
  yam_nouvelle_commande: 'Nouvelle commande (n°, plats, livraison, montant ; boutons Accepter / Refuser)',
  yam_rappel_commande: 'Rappel : commande sans réponse (n°, plats, minutes ; boutons Accepter / Refuser)',
  yam_commande_livree: 'Commande livrée depuis l’app (n°, plats)',
  yam_statut_commande: 'Demande du statut (n°, plats ; boutons En attente / En cours / Terminée / Livraison en cours / Livrée)',
  yam_demande_annulation: "Demande d'annulation du client (n°, plats ; boutons Accepter / Refuser l'annulation)",
  yam_livraison_livreur: 'Course confiée au livreur (boutique, n°, plats, livraison ; bouton Je pars en livraison)',
  yam_livreur_ajoute: 'Livreur ajouté par la boutique (boutique)',
  yam_menu_du_jour: 'Menu du jour à confirmer (boutique ; bouton Voir mon menu)',
};

/** Texte lisible d'un message envoyé (corps du module WhatsApp). */
const outboundText = body => {
  if (body.type === 'text') return body.text?.body || '';
  if (body.type === 'interactive') {
    const buttons = (body.interactive?.buttons || []).map(b => b.title).join(' / ');
    return `${body.interactive?.body || ''}${buttons ? `\n[Boutons : ${buttons}]` : ''}`;
  }
  if (body.type === 'template') {
    const t = body.template || {};
    return `[Modèle ${TEMPLATE_LABEL[t.name] || t.name}] ${(t.bodyParams || []).join(' | ')}`;
  }
  return `[${body.type}]`;
};

/** Texte lisible d'un message reçu (événement du module). `quoted` : texte du message cité. */
const inboundText = (event, quoted = null) => {
  if (event.button?.id) return `[Clic bouton « ${event.button.title || ''} »] (${event.button.id})`;
  // Réponse à un message précis (ex. le nom d'un plat en réponse à sa photo).
  const reply = quoted ? `(en réponse à : ${quoted.slice(0, 300)}) ` : '';
  if (event.type === 'text') return `${reply}${event.text || ''}`;
  const caption = event.media?.caption ? ` ${event.media.caption}` : '';
  return `${reply}[${event.type}]${caption}`;
};

/** Texte du message cité par `event.replyTo` (journal), null sinon. */
const quotedText = async event => {
  if (!event.replyTo?.messageId) return null;
  try {
    return (await repos.waConversations.getByMessageId(event.replyTo.messageId))?.body || null;
  } catch {
    return null;
  }
};

const add = async row => {
  try {
    await repos.waConversations.add(row);
  } catch (e) {
    console.error(`❌ [WHATSAPP] journal de conversation (${row.phone}) : ${e.message}`);
  }
};

/** Message envoyé à une boutique. `author` : 'system' (flux automatiques) ou 'ai'. */
exports.logOutbound = (body, { author = 'system', messageId = null } = {}) => add({ phone: body.to, direction: 'out', author, kind: body.type, body: outboundText(body), messageId });

/** Message reçu : journalisé seulement s'il vient du numéro d'une boutique WhatsApp ou d'un de ses livreurs. */
exports.logInbound = async event => {
  let author = null;
  try {
    // Chargés ici : merchantChannel charge ce fichier.
    const { shopsOfPhone } = require('./merchantChannel');
    const { driverOfPhone } = require('./driver/driverDirectory');
    if ((await shopsOfPhone(event.from)).length) author = 'merchant';
    else if (await driverOfPhone(event.from)) author = 'driver';
  } catch (e) {
    return console.error(`❌ [WHATSAPP] journal de conversation (${event.from}) : ${e.message}`);
  }
  if (!author) return;
  await add({ phone: event.from, direction: 'in', author, kind: event.button?.id ? 'button' : event.type, body: inboundText(event, await quotedText(event)), messageId: event.messageId });
};
