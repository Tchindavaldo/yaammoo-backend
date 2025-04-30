// src/controllers/userController.js
const userService = require('../../services/user/userService');

exports.getUsers = async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
};

exports.createUser = async (req, res) => {
  try {
    const id = await userService.createUser(req.body);
    res.status(201).json({
      id,
      message: 'Utilisateur créé avec succès.',
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
};

exports.updateUser = async (req, res) => {
  try {
    await userService.updateUser(req.params.id, req.body);
    res.status(200).json({
      message: 'Utilisateur mis à jour avec succès.',
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
};

exports.getOneUserByIdController = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await userService.getUserById(id);
    res.status(200).json({ message: 'Utilisateur recuperer avec succès.', data: user });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
};
