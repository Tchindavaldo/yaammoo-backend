// Routes des villes de livraison (table cities, migration 095).
const express = require('express');
const router = express.Router();
const firebaseAuth = require('../middlewares/authMiddleware');
const adminGuard = require('../middlewares/adminMiddleware');
const { listCities, updateCity } = require('../controllers/cities/cities.controller');

/**
 * @swagger
 * /cities:
 *   get:
 *     summary: Villes de livraison actives (communes du Cameroun), triees par nom
 *     tags: [Cities]
 *     responses:
 *       200: { description: "data: [{ id, name, region, active }]" }
 */
router.get('/', listCities);

/**
 * @swagger
 * /cities/{id}:
 *   patch:
 *     summary: (admin) Renommer (repercute dans les boutiques), changer la region ou retirer (active=false) une ville
 *     tags: [Cities]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               region: { type: string }
 *               active: { type: boolean }
 *     responses:
 *       200: { description: "data: ville, renamedShops: nombre de boutiques mises a jour" }
 */
router.patch('/:id', firebaseAuth, adminGuard, updateCity);

module.exports = router;
