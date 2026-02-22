const express = require('express');
const { postMenuController } = require('../controllers/menu/postMenu.controller');
const { getMenuController } = require('../controllers/menu/getMenu.controller');
const { deleteMenuController } = require('../controllers/menu/deleteMenu.controller');
const { updateMenuController } = require('../controllers/menu/updateMenu.controller');

const router = express.Router();

/**
 * @swagger
 * /menu:
 *   post:
 *     summary: Create a new menu item
 *     tags:
 *       - Menus
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fastFoodId
 *               - name
 *               - price
 *               - extra
 *               - drink
 *             properties:
 *               fastFoodId:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               image:
 *                 type: string
 *               coverImage:
 *                 type: string
 *               extra:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     status:
 *                       type: boolean
 *               drink:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     status:
 *                       type: boolean
 *     responses:
 *       201:
 *         description: Menu item successfully created
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
 *                   $ref: '#/components/schemas/Menu'
 *       400:
 *         description: Invalid input
 */
router.post('', postMenuController);

/**
 * @swagger
 * /menu/{fastFoodId}:
 *   get:
 *     summary: Get all menus for a fastfood
 *     tags:
 *       - Menus
 *     parameters:
 *       - in: path
 *         name: fastFoodId
 *         required: true
 *         schema:
 *           type: string
 *         description: FastFood ID
 *     responses:
 *       200:
 *         description: List of menus
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
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Menu'
 *       404:
 *         description: FastFood not found
 */
router.get('/:fastFoodId', getMenuController);

/**
 * @swagger
 * /menu/{menuId}:
 *   delete:
 *     summary: Delete a menu item
 *     tags:
 *       - Menus
 *     parameters:
 *       - in: path
 *         name: menuId
 *         required: true
 *         schema:
 *           type: string
 *         description: Menu ID
 *     responses:
 *       200:
 *         description: Menu item successfully deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Menu item not found
 */
router.delete('/:menuId', deleteMenuController);

/**
 * @swagger
 * /menu/{menuId}:
 *   put:
 *     summary: Update a menu item
 *     tags:
 *       - Menus
 *     parameters:
 *       - in: path
 *         name: menuId
 *         required: true
 *         schema:
 *           type: string
 *         description: Menu ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               image:
 *                 type: string
 *               coverImage:
 *                 type: string
 *               extra:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     status:
 *                       type: boolean
 *               drink:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     status:
 *                       type: boolean
 *     responses:
 *       200:
 *         description: Menu item successfully updated
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
 *                   $ref: '#/components/schemas/Menu'
 *       404:
 *         description: Menu item not found
 *       400:
 *         description: Invalid input
 */
router.put('/:menuId', updateMenuController);

module.exports = router;
