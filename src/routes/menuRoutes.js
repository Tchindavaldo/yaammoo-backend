const express = require('express');
const { postMenuController } = require('../controllers/menu/postMenu.controller');

const router = express.Router();

router.post('', postMenuController);

module.exports = router;
