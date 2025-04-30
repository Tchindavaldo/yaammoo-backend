// src/controllers/userController.js

const { createFastfoodService } = require('../../services/fastfood/createFastFood');

exports.createFastfoodController = async (req, res) => {
  try {
    const data = await createFastfoodService(req.body);
    res.status(201).json({
      data,
      message: 'fastfood créé avec succès.',
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
};
