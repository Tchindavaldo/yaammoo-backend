const express = require('express');
const { signUpController } = require('../controllers/auth/register.controller');
const { requestPhoneAuthController, verifyPhoneAuthController, getOtpCostSummaryController, getVerificationDetailsController } = require('../controllers/auth/phoneAuth.controller');

const router = express.Router();

/**
 * @swagger
 * /auth/signUp:
 *   post:
 *     summary: Register a new user
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - firstName
 *               - lastName
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               phone:
 *                 type: string
 *               address:
 *                 type: string
 *     responses:
 *       201:
 *         description: User successfully registered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid input or user already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/signUp', signUpController);

/**
 * @swagger
 * /auth/phone/request:
 *   post:
 *     summary: Demander un code de connexion par téléphone
 *     description: >
 *       Première étape de l'authentification par numéro. Envoie un code à
 *       6 chiffres via Bird (WhatsApp en priorité, repli SMS automatique selon
 *       le pays) et journalise le coût. La réponse est identique que le numéro
 *       soit déjà inscrit ou non, afin de ne pas permettre l'énumération des
 *       comptes. Un renvoi trop rapproché est refusé en 429 (chaque envoi est
 *       facturé par Bird).
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phoneNumber]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 description: "Numéro local ou E.164. L'indicatif DEFAULT_COUNTRY_CODE est ajouté si absent."
 *                 example: '698087460'
 *     responses:
 *       200:
 *         description: Code envoyé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: 'boolean', example: true }
 *                 message: { type: 'string', example: 'Code de vérification envoyé' }
 *                 verificationId: { type: 'string' }
 *                 phoneNumber: { type: 'string', example: '+237698087460' }
 *                 expiresIn: { type: 'integer', example: 600 }
 *       400:
 *         description: Numéro invalide ou échec de l'envoi
 *       429:
 *         description: Renvoi trop rapproché (en-tête Retry-After en secondes)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: 'boolean', example: false }
 *                 code: { type: 'string', example: 'cooldown' }
 *                 retryAfter: { type: 'integer', example: 42 }
 */
router.post('/phone/request', requestPhoneAuthController);

/**
 * @swagger
 * /auth/phone/verify:
 *   post:
 *     summary: Valider le code et se connecter (ou s'inscrire)
 *     description: >
 *       Seconde étape. Bird valide le code, le coût réel est enregistré, puis
 *       l'utilisateur est connecté s'il existe ou créé sinon.
 *       Renvoie un **custom token Firebase** à usage unique : le frontend doit
 *       appeler `signInWithCustomToken(customToken)`. Firebase délivre alors un
 *       refresh token persistant — la session dure bien au-delà de six mois sans
 *       nouvelle saisie de code. Les champs de profil ne sont utilisés qu'à
 *       l'inscription.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phoneNumber, code]
 *             properties:
 *               phoneNumber: { type: 'string', example: '698087460' }
 *               code: { type: 'string', example: '123456' }
 *               nom: { type: 'string', description: "Optionnel, utilisé à l'inscription" }
 *               prenom: { type: 'string', description: "Optionnel, utilisé à l'inscription" }
 *               age: { type: 'integer', description: "Optionnel, utilisé à l'inscription" }
 *               email: { type: 'string', description: "Optionnel, utilisé à l'inscription" }
 *     responses:
 *       200:
 *         description: Connexion ou inscription réussie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: 'boolean', example: true }
 *                 message: { type: 'string', example: 'Connexion réussie' }
 *                 customToken:
 *                   type: 'string'
 *                   description: >
 *                     ⚠️ Token à usage unique, valable 1 h. Ce n'est PAS un token
 *                     d'accès : il ne fonctionne pas dans un en-tête Authorization.
 *                     L'échanger via signInWithCustomToken(), puis utiliser
 *                     getIdToken() pour appeler les routes protégées.
 *                 isNewUser: { type: 'boolean' }
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: 'string' }
 *                     uid: { type: 'string' }
 *                     phoneNumber: { type: 'string' }
 *                     nom: { type: 'string', nullable: true }
 *                     prenom: { type: 'string', nullable: true }
 *                     email: { type: 'string', nullable: true }
 *                     fastFoodId: { type: 'string', nullable: true }
 *                     isMarchand: { type: 'boolean' }
 *                 cost:
 *                   type: object
 *                   properties:
 *                     totalCost: { type: 'number', example: 0.009 }
 *                     currencyCode: { type: 'string', example: 'USD' }
 *       400:
 *         description: Paramètre manquant
 *       401:
 *         description: Code incorrect, expiré ou trop de tentatives
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: 'boolean', example: false }
 *                 message: { type: 'string', example: 'Code OTP incorrect' }
 *                 reason: { type: 'string', example: 'incorrect_code' }
 *                 attemptsRemaining: { type: 'integer', example: 3 }
 */
router.post('/phone/verify', verifyPhoneAuthController);

/**
 * @swagger
 * /auth/phone/costs/summary:
 *   get:
 *     summary: Récapitulatif des coûts Bird (OTP)
 *     description: >
 *       Agrège les coûts enregistrés localement. Bird n'expose aucune vue
 *       agrégée par API : ce récapitulatif s'appuie sur la table `bird_costs`,
 *       alimentée à chaque envoi puis complétée à la vérification. Les demandes
 *       dont le coût n'était pas encore résolu sont relues auprès de Bird au
 *       passage (lectures gratuites, aucun envoi).
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: 'string', format: 'date-time' }
 *         description: Date ISO de début (incluse)
 *       - in: query
 *         name: to
 *         schema: { type: 'string', format: 'date-time' }
 *         description: Date ISO de fin (exclue)
 *     responses:
 *       200:
 *         description: Récapitulatif
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: 'boolean', example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     count: { type: 'integer' }
 *                     verified: { type: 'integer' }
 *                     abandoned: { type: 'integer', description: 'Envoyés et facturés, code jamais saisi' }
 *                     pending: { type: 'integer', description: 'Encore valides, code saisissable' }
 *                     totalCost: { type: 'number' }
 *                     currencyCode: { type: 'string' }
 *                     byChannel: { type: 'object', description: 'Coût et volume par canal' }
 */
router.get('/phone/costs/summary', getOtpCostSummaryController);

/**
 * @swagger
 * /auth/phone/verification/{id}:
 *   get:
 *     summary: Diagnostiquer une vérification OTP
 *     description: >
 *       Retourne le détail complet d'une vérification : une entrée par canal
 *       tenté (WhatsApp puis SMS en repli), statut de livraison, erreur
 *       éventuelle et coûts. **C'est l'appel à utiliser quand un code OTP
 *       n'arrive pas** — il révèle la cause exacte : solde insuffisant, pays non
 *       couvert, numéro invalide.
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: 'string' }
 *         description: "Identifiant de vérification retourné par /auth/phone/request"
 *     responses:
 *       200:
 *         description: Détail de la vérification
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: 'boolean', example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     verificationId: { type: 'string' }
 *                     status: { type: 'string' }
 *                     destinationCountry: { type: 'string', example: 'CM' }
 *                     expiresAt: { type: 'string', format: 'date-time' }
 *                     failedAttempts: { type: 'integer', nullable: true }
 *                     attempts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           channel: { type: 'string', example: 'whatsapp' }
 *                           deliveryStatus: { type: 'string', example: 'undelivered' }
 *                           error: { type: 'string', nullable: true }
 *                           cost: { type: 'object' }
 *                     totalCost: { type: 'object' }
 *       400:
 *         description: Identifiant de vérification inconnu
 */
router.get('/phone/verification/:id', getVerificationDetailsController);

module.exports = router;
