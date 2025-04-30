const express = require('express');
const { signUpController } = require('../controllers/auth/register.controller');

const router = express.Router();

router.post('/signUp', signUpController);

module.exports = router;
