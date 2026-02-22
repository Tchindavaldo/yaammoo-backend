// src/routes/imageRoutes.js
const express = require('express');

const upload = require('../config/multer');
const { handleUpload } = require('../controllers/images/upladImage-controler');

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
router.post('/upload', upload.single('image'), handleUpload);

module.exports = router;
