// interface/shopMessageFields.js
// Messages d'une boutique WhatsApp au client (posés par l'agent IA), migration 090.
// Doc : architecture/whatsapp-ai.md.

/** POST /shop-messages/:id/answer — réponse du client à une question de la boutique. */
exports.shopMessageAnswerFields = {
  answer: { type: 'string', required: true, maxLength: 1000 }, // texte libre, relayé au marchand sur WhatsApp
};

/** GET /shop-messages — query. */
exports.shopMessageQueryFields = {
  orderId: { type: 'string', required: false }, // limite aux messages d'une commande
};
