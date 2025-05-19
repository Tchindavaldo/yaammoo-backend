const express = require('express');
const { postMenuController } = require('../controllers/menu/postMenu.controller');
const { getMenuController } = require('../controllers/menu/getMenu.controller');
const { deleteMenuController } = require('../controllers/menu/deleteMenu.controller');
const { updateMenuController } = require('../controllers/menu/updateMenu.controller');

const router = express.Router();

router.post('', postMenuController);
router.get('/:fastFoodId', getMenuController);
router.delete('/:menuId', deleteMenuController);
router.put('/:menuId', updateMenuController);

module.exports = router;
