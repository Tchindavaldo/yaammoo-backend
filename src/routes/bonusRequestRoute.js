// src/routes/userRoutes.js
const express = require('express');
const { postBonusRequestController } = require('../controllers/bonusRequest/postBonusRequest.controller');
const { getBonusRequestStatusController } = require('../controllers/bonusRequest/getBonusRequestStatus.controller');

const route = express.Router();

route.post('/:totalBonus', postBonusRequestController);
route.get('/status/:id', getBonusRequestStatusController);

module.exports = route;
