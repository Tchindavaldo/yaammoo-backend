const express = require('express');
const router = express.Router();

const firebaseAuth = require('../middlewares/authMiddleware');
const { getBalanceController, getHistoryController, getStatsController, withdrawController } = require('../controllers/wallet/wallet.controller');

/**
 * @swagger
 * /wallet/balance:
 *   get:
 *     summary: Solde du portefeuille marchand (calculé depuis les transactions)
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
 *                     totalEarned:
 *                       type: number
 *                     totalWithdrawn:
 *                       type: number
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
 *         description: "{ groupBy, totals:{payin,payout,net}, series:[{period,payin,payout,net,count}] }"
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
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Montant en XAF (doit être <= solde disponible)
 *               phone:
 *                 type: string
 *                 description: "Numéro bénéficiaire — backend normalise automatiquement vers 237XXXXXXXXX (accepte : 677001122, +237677001122, 00237677001122)"
 *               network:
 *                 type: string
 *                 enum: [MTN, ORANGEMONEY]
 *                 description: "Valeur exacte MobileWallet /payout : MTN ou ORANGEMONEY (pas Orangemoney, pas OM)"
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
 *         description: "Montant invalide, solde insuffisant (insufficient_balance) ou champs manquants"
 *       401:
 *         description: Non authentifié
 *       409:
 *         description: Un retrait est déjà en cours (withdrawal_in_progress)
 *       429:
 *         description: Cooldown entre deux retraits non écoulé (cooldown)
 *       502:
 *         description: Échec initiation MobileWallet /payout
 */
router.post('/withdraw', firebaseAuth, withdrawController);

module.exports = router;
