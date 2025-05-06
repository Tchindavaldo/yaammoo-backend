// src/routes/userRoutes.js
const express = require('express');
const { getUsers, getOneUserByIdController, createUser, updateUser } = require('../controllers/user/userController');
const firebaseAuth = require('../middlewares/authMiddleware');

const router = express.Router();

// Route publique pour récupérer la liste des utilisateurs
router.get('', getUsers);
router.get('/:id', getOneUserByIdController);

// Route protégée pour créer un utilisateur
router.post('', firebaseAuth, createUser);

// Route protégée pour mettre à jour un utilisateur existant
router.put('/:id', updateUser);

module.exports = router;
