// Journal de la conversation WhatsApp avec chaque boutique (table wa_conversation_messages,
// migration 090) : tout message reçu du numéro d'une boutique WhatsApp et tout message que
// Yaammoo lui envoie (merchantChannel.send). L'agent IA relit ce journal à chaque réponse
// (services/whatsapp/ai/). Ne lève jamais : un échec d'écriture est journalisé.
// Doc : architecture/whatsapp-ai.md.
const repos = require('../../repositories');

// Libellés lisibles des templates envoyés au marchand (le texte exact vit chez Meta).
const TEMPLATE_LABEL = {
  yam_nouvelle_commande: 'Nouvelle commande (n°, plats, livraison, montant ; boutons Accepter / Refuser)',
  yam_rappel_commande: 'Rappel : commande sans réponse (n°, plats, minutes ; boutons Accepter / Refuser)',
  yam_commande_livree: 'Commande livrée depuis l’app (n°, plats)',
  yam_statut_commande: 'Demande du statut (n°, plats ; boutons En attente / En cours / Terminée / Livraison en cours / Livrée)',
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

/** Texte lisible d'un message reçu (événement du module). */
const inboundText = event => {
  if (event.button?.id) return `[Clic bouton « ${event.button.title || ''} »] (${event.button.id})`;
  if (event.type === 'text') return event.text || '';
  const caption = event.media?.caption ? ` ${event.media.caption}` : '';
  return `[${event.type}]${caption}`;
};

const add = async row => {
  try {
    await repos.waConversations.add(row);
  } catch (e) {
    console.error(`❌ [WHATSAPP] journal de conversation (${row.phone}) : ${e.message}`);
  }
};

/** Message envoyé à une boutique. `author` : 'system' (flux automatiques) ou 'ai'. */
exports.logOutbound = (body, { author = 'system', messageId = null } = {}) =>
  add({ phone: body.to, direction: 'out', author, kind: body.type, body: outboundText(body), messageId });

/** Message reçu : journalisé seulement s'il vient du numéro d'une boutique WhatsApp. */
exports.logInbound = async event => {
  try {
    // Chargé ici : merchantChannel charge ce fichier.
    const { shopsOfPhone } = require('./merchantChannel');
    if (!(await shopsOfPhone(event.from)).length) return;
  } catch (e) {
    return console.error(`❌ [WHATSAPP] journal de conversation (${event.from}) : ${e.message}`);
  }
  await add({ phone: event.from, direction: 'in', author: 'merchant', kind: event.button?.id ? 'button' : event.type, body: inboundText(event), messageId: event.messageId });
};
