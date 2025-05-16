// src/routes/userRoutes.js
const express = require('express');
const { getBonusController } = require('../controllers/bonus/getBonus.controller');
const { postBonusController } = require('../controllers/bonus/postBonus.controller');

const route = express.Router();

route.post('', postBonusController);
route.get('/all', getBonusController);

module.exports = route;
