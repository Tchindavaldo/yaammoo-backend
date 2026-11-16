// Validation des payloads /shop-messages (messages boutique WhatsApp -> client, agent IA).
const { validateFieldRules } = require('./validateFieldRules');
const { shopMessageAnswerFields, shopMessageQueryFields } = require('../../interface/shopMessageFields');

/** POST /shop-messages/:id/answer : `answer` non vide, 1000 caractères max. */
exports.validateShopMessageAnswer = data => {
  const errors = validateFieldRules(shopMessageAnswerFields, data || {});
  if (!errors.length && !String(data.answer).trim()) errors.push({ field: 'answer', message: 'Réponse vide' });
  return errors;
};

/** GET /shop-messages : query. */
exports.validateShopMessageQuery = query => validateFieldRules(shopMessageQueryFields, query || {});
