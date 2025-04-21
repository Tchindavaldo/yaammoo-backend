// src/routes/userRoutes.js
const express = require('express');
const firebaseAuth = require('../middlewares/authMiddleware');
const { createFastfood } = require('../controllers/fastfood/createFastfood');

const route = express.Router();

// Route publique pour récupérer la liste des utilisateurs
// router.get('', getUsers);

// Route protégée pour créer un utilisateur
route.post('', createFastfood);

// Route protégée pour mettre à jour un utilisateur existant
// route.put('/:id', firebaseAuth, updateUser);

module.exports = route;
