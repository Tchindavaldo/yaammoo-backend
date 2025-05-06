const express = require('express');
const { postMenuController } = require('../controllers/menu/postMenu.controller');
const { getMenuController } = require('../controllers/menu/getMenu.controller');

const router = express.Router();

router.post('', postMenuController);
router.get('/:fastFoodId', getMenuController);

module.exports = router;
