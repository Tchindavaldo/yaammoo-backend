// src/controllers/userController.js

const createFastfood = require("../../services/fastfood/createFastFood");



exports.createFastfood = async (req, res) => {
    try {


        const data = await createFastfood(req.body);
        res.status(201).json({ data, message: 'fastfood créé avec succès.' });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

