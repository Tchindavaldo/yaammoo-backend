// src/routes/userRoutes.js
const express = require('express');

const upload = require('../config/multer');
const { handleUpload } = require('../controllers/images/upladImage-controler');

const router = express.Router();

router.post('/upload', upload.single('image'), handleUpload);

module.exports = router;
