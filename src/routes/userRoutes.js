// src/routes/userRoutes.js
const express = require('express');
const { getUsers, createUser, updateUser } = require('../controllers/userController');
const firebaseAuth = require('../middlewares/authMiddleware');

const router = express.Router();

// Route publique pour récupérer la liste des utilisateurs
router.get('/users', getUsers);

// Route protégée pour créer un utilisateur
router.post('/users', firebaseAuth, createUser);

// Route protégée pour mettre à jour un utilisateur existant
router.put('/users/:id', firebaseAuth, updateUser);

module.exports = router;
