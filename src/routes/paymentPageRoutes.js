// src/routes/paymentPageRoutes.js
//
// Sert la page web de paiement (overlays récap + capsule) chargée par la WebView
// du frontend au clic sur "Buy". Page statique : public/payment/index.html.

const path = require('path');
const express = require('express');

const router = express.Router();

const PAYMENT_PAGE_DIR = path.join(__dirname, '..', '..', 'public', 'payment');

/**
 * @swagger
 * /payment-page:
 *   get:
 *     summary: Page web de paiement (chargée dans une WebView par l'app)
 *     tags: [PaymentPage]
 *     responses:
 *       200:
 *         description: Page HTML des overlays de paiement
 *         content:
 *           text/html: {}
 */
// Delai artificiel (ms) avant de servir la page — sert a voir le squelette
// cote app. Piloté par PAYMENT_PAGE_DELAY_MS ; absent ou 0 = aucun delai.
const PAGE_DELAY_MS = Number(process.env.PAYMENT_PAGE_DELAY_MS) || 0;

router.get('/', (req, res) => {
  const send = () => res.sendFile(path.join(PAYMENT_PAGE_DIR, 'index.html'));
  if (PAGE_DELAY_MS > 0) return setTimeout(send, PAGE_DELAY_MS);
  return send();
});

// Assets éventuels de la page (css/js/images) servis sous le même préfixe.
router.use(express.static(PAYMENT_PAGE_DIR));

module.exports = router;
