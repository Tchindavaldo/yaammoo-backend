// src/routes/userRoutes.js
const express = require('express');
const { createFastfoodController } = require('../controllers/fastfood/createFastfood');
const { getfastfoodController } = require('../controllers/fastfood/getFastFoods');

const route = express.Router();

route.post('', createFastfoodController);
route.get('/all', getfastfoodController);

module.exports = route;
