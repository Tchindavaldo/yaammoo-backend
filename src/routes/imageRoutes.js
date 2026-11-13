// src/routes/imageRoutes.js
const express = require('express');

const upload = require('../config/multer');
const firebaseAuth = require('../middlewares/authMiddleware');
const { handleUpload, handleDelete } = require('../controllers/images/uploadImage-controler');
const { listImageTrashController, restoreImageController } = require('../controllers/images/imageTrash.controller');
const adminGuard = require('../middlewares/adminMiddleware');

const router = express.Router();

/**
 * @swagger
 * /image/upload:
 *   post:
 *     summary: Upload an image
 *     tags:
 *       - Images
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Image successfully uploaded
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
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *       400:
 *         description: Invalid image or upload error
 */
// Jeton AVANT multer : un inconnu ne fait même pas téléverser son fichier.
router.post('/upload', firebaseAuth, upload.single('image'), handleUpload);

router.delete('/', firebaseAuth, handleDelete);

/**
 * @swagger
 * /image/admin/trash:
 *   get:
 *     summary: Corbeille d'images en attente d'effacement (admin)
 *     description: Images remplacées ou supprimées, effacées du storage après `image_trash_retention_days` jours (60 par défaut). Chaque item porte `purgeAt`.
 *     tags: [Images]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ success, data: { retentionDays, items: [{ id, url, entity, entityId, field, trashedAt, purgeAt }] } }" }
 *       403: { description: Réservé aux administrateurs }
 * /image/admin/trash/{id}/restore:
 *   post:
 *     summary: Restaure une image de la corbeille (admin)
 *     description: Remet l'image dans son champ d'origine si la ligne existe encore (`reattached`), sinon conserve seulement le fichier.
 *     tags: [Images]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: "{ success, data: { ...item, reattached } }" }
 *       404: { description: Image introuvable }
 *       409: { description: Déjà restaurée ou déjà effacée }
 */
router.get('/admin/trash', firebaseAuth, adminGuard, listImageTrashController);
router.post('/admin/trash/:id/restore', firebaseAuth, adminGuard, restoreImageController);

module.exports = router;
