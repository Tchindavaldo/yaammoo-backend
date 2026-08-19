// src/routes/deleteAccountPageRoutes.js
//
// Sert la page publique de demande de suppression de compte, exigee par Google
// Play (declaration Securite des donnees). Page statique :
// public/delete-account/index.html.

const path = require('path');
const express = require('express');

const router = express.Router();

const DELETE_ACCOUNT_PAGE_DIR = path.join(__dirname, '..', '..', 'public', 'delete-account');

/**
 * @swagger
 * /delete-account:
 *   get:
 *     summary: Page web de demande de suppression de compte (lien fiche Play Store)
 *     tags: [DeleteAccountPage]
 *     responses:
 *       200:
 *         description: Page HTML expliquant la procedure de suppression
 *         content:
 *           text/html: {}
 */
router.get('/', (req, res) => {
  res.sendFile(path.join(DELETE_ACCOUNT_PAGE_DIR, 'index.html'));
});

// Assets eventuels de la page (css/js/images) servis sous le meme prefixe.
router.use(express.static(DELETE_ACCOUNT_PAGE_DIR));

module.exports = router;
