const express = require('express');
const router = express.Router();
const firebaseAuth = require('../middlewares/authMiddleware');
const { listRestorableShops, restoreOwnShop } = require('../services/fastfood/restoreOwnShop.service');

/**
 * @swagger
 * /shop-restore:
 *   get:
 *     summary: Boutiques supprimées avec le compte, restaurables par leur propriétaire
 *     tags: [Fastfood]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "[{ id, name, image, deletedAt }]" }
 * /shop-restore/{id}:
 *   post:
 *     summary: Restaure la boutique et la rattache au compte
 *     tags: [Fastfood]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: "{ fastFoodId }" }
 *       404: { description: Non restaurable }
 *       409: { description: Boutique déjà active ou restauration impossible }
 */
router.get('/', firebaseAuth, async (req, res) => {
  try {
    return res.status(200).json({ success: true, data: await listRestorableShops(req.user.uid) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Erreur serveur.', error: error.message });
  }
});

router.post('/:id', firebaseAuth, async (req, res) => {
  try {
    const r = await restoreOwnShop(req.user.uid, req.params.id);
    return res.status(r.success ? 200 : r.httpStatus || 400).json(r);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Erreur serveur.', error: error.message });
  }
});

module.exports = router;
