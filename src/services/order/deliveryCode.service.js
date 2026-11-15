// Code secret de livraison d'une commande : montré au client (QR code de l'app), saisi ou scanné par
// le marchand / livreur pour prouver la remise. Calculé (HMAC de l'id), jamais stocké : il ne fuit
// pas dans les vues marchand. Utilisé par services/order/confirmDelivery.service.js et le controller
// GET /order/:orderId/delivery-code. Secret : DELIVERY_CODE_SECRET (config/deliveryCode.js).
const crypto = require('crypto');
const { deliveryCodeSecret } = require('../../config/deliveryCode');

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans 0/O, 1/I/L : se lit sans erreur
const LENGTH = 6;

/** Code de 6 caractères propre à la commande. Lève si le secret manque (config). */
exports.deliveryCodeOf = orderId => {
  const secret = deliveryCodeSecret();
  if (!secret) throw Object.assign(new Error('DELIVERY_CODE_SECRET manquant'), { code: 500 });
  const digest = crypto.createHmac('sha256', secret).update(String(orderId)).digest();
  let out = '';
  for (let i = 0; i < LENGTH; i++) out += ALPHABET[digest[i] % ALPHABET.length];
  return out;
};

/** true si `code` (casse et espaces ignorés) est celui de la commande. */
exports.checkDeliveryCode = (orderId, code) => {
  if (typeof code !== 'string') return false;
  const given = Buffer.from(code.replace(/\s+/g, '').toUpperCase());
  const expected = Buffer.from(exports.deliveryCodeOf(orderId));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
};
