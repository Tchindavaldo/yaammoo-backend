const express = require('express');
const router = express.Router();

const firebaseAuth = require('../middlewares/authMiddleware');
const { getBalanceController, getHistoryController, getStatsController, withdrawController, getWithdrawQuoteController, predictOperatorController } = require('../controllers/wallet/wallet.controller');

/**
 * @swagger
 * /wallet/balance:
 *   get:
 *     summary: Solde du portefeuille (calculé depuis les transactions, par réseau)
 *     description: >-
 *       Deux soldes, MTN et Orange : chaque crédit est rattaché au réseau qui a
 *       encaissé le paiement. Seuls les montants retirables sont comptés.
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Solde du marchand
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     balance:
 *                       type: number
 *                       description: Total retirable (= mtn + orange)
 *                     mtn:
 *                       type: number
 *                       description: Solde MTN
 *                     orange:
 *                       type: number
 *                       description: Solde Orange
 *                     totalEarned:
 *                       type: number
 *                     totalWithdrawn:
 *                       type: number
 *                       description: Total débité (montants reçus + frais interréseau)
 *       401:
 *         description: Non authentifié
 */
router.get('/balance', firebaseAuth, getBalanceController);

/**
 * @swagger
 * /wallet/history:
 *   get:
 *     summary: Historique portefeuille marchand (payin = gains, payout = retraits)
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: direction
 *         schema: { type: string, enum: [payin, payout] }
 *         description: Filtre par sens (sinon les deux)
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [today, week, month, all] }
 *         description: Raccourci de période (ignoré si from/to fournis)
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Liste triée DESC, chaque entrée porte un champ `direction`
 *       401:
 *         description: Non authentifié
 */
router.get('/history', firebaseAuth, getHistoryController);

/**
 * @swagger
 * /wallet/stats:
 *   get:
 *     summary: Totaux payin/payout/net agrégés par période
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: groupBy
 *         schema: { type: string, enum: [day, week, month], default: day }
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [today, week, month, all] }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: "{ groupBy, balance, balances:{mtn,orange}, totals:{payin,payout,net}, series:[{period,payin,payout,net,count}] }"
 *       401:
 *         description: Non authentifié
 */
router.get('/stats', firebaseAuth, getStatsController);

/**
 * @swagger
 * /wallet/withdraw:
 *   post:
 *     summary: Demande de retrait du portefeuille marchand
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - phone
 *               - network
 *               - sourceNetwork
 *             properties:
 *               amount:
 *                 type: integer
 *                 description: Montant REÇU en XAF. Montant + frais interréseau doit être <= solde source.
 *               phone:
 *                 type: string
 *                 description: "Numéro de réception — backend normalise automatiquement vers 237XXXXXXXXX (accepte : 677001122, +237677001122, 00237677001122)"
 *               network:
 *                 type: string
 *                 enum: [MTN, ORANGEMONEY]
 *                 description: "Réseau du numéro de réception (cf. POST /wallet/operator/predict). Valeur exacte : MTN ou ORANGEMONEY"
 *               sourceNetwork:
 *                 type: string
 *                 enum: [MTN, ORANGEMONEY]
 *                 description: "Solde débité, choisi par l'utilisateur (aucun repli automatique). Même réseau que `network` : 0 F de frais ; sinon frais interréseau (cf. GET /wallet/withdraw/quote)"
 *               receiverName:
 *                 type: string
 *                 description: Nom du bénéficiaire (optionnel — défaut nom marchand ou boutique)
 *               narration:
 *                 type: string
 *                 description: Libellé du virement (optionnel — défaut "Retrait yaammoo")
 *     responses:
 *       200:
 *         description: Demande de retrait enregistrée (verdict final via socket wallet.withdrawal)
 *       400:
 *         description: "Montant invalide, solde source insuffisant (insufficient_balance, `data` = devis) ou champs manquants"
 *       401:
 *         description: Non authentifié
 *       409:
 *         description: Un retrait est déjà en cours (withdrawal_in_progress)
 *       422:
 *         description: Refus MobileWallet propagé tel quel (le front affiche `message`)
 *       429:
 *         description: Cooldown entre deux retraits non écoulé (cooldown)
 *       502:
 *         description: MobileWallet injoignable
 *       503:
 *         description: Opérateur indisponible
 */
router.post('/withdraw', firebaseAuth, withdrawController);

/**
 * @swagger
 * /wallet/withdraw/quote:
 *   get:
 *     summary: Frais d'un retrait avant confirmation
 *     description: >-
 *       Même réseau (solde source = réseau de réception) : 0 F, frais prépayés au
 *       paiement. Interréseau : frais du réseau de réception, débités en plus
 *       sur le solde source. Rien n'est débité.
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: amount
 *         required: true
 *         schema: { type: integer }
 *         description: Montant reçu (XAF)
 *       - in: query
 *         name: network
 *         required: true
 *         schema: { type: string, enum: [MTN, ORANGEMONEY] }
 *         description: Réseau du numéro de réception
 *       - in: query
 *         name: sourceNetwork
 *         required: true
 *         schema: { type: string, enum: [MTN, ORANGEMONEY] }
 *         description: Solde débité
 *     responses:
 *       200:
 *         description: Devis
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     amount: { type: integer, description: Montant reçu }
 *                     fee: { type: integer, description: Frais interréseau (0 même réseau) }
 *                     totalDebited: { type: integer, description: amount + fee }
 *                     sourceBalance: { type: number, description: Solde source actuel }
 *                     sufficient: { type: boolean }
 *                     maxAmount: { type: integer, description: Plus gros montant recevable depuis ce solde, frais compris (estimation) }
 *                     sameNetwork: { type: boolean }
 *       400:
 *         description: Paramètres invalides
 *       401:
 *         description: Non authentifié
 *       502:
 *         description: MobileWallet injoignable
 */
router.get('/withdraw/quote', firebaseAuth, getWithdrawQuoteController);

/**
 * @swagger
 * /wallet/operator/predict:
 *   post:
 *     summary: Réseau d'un numéro de réception (détection en temps réel)
 *     description: Relais MobileWallet, la clé API reste côté serveur.
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone:
 *                 type: string
 *                 description: Numéro saisi librement (espaces, +237, 0…)
 *     responses:
 *       200:
 *         description: Réseau détecté
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     phone: { type: string, description: Format international }
 *                     network: { type: string, enum: [MTN, ORANGEMONEY] }
 *       400:
 *         description: Numéro incomplet
 *       401:
 *         description: Non authentifié
 *       422:
 *         description: Opérateur non reconnu (unknown_operator)
 *       502:
 *         description: MobileWallet injoignable
 */
router.post('/operator/predict', firebaseAuth, predictOperatorController);

module.exports = router;
