const { registerService } = require('../../services/auth/register.service');

exports.signUpController = async (req, res) => {
  if (!req.body.email || !req.body.password) {
    return res.status(400).json({ message: 'Email et mot de passe sont requis.' });
  }

  try {
    const userCreate = await registerService(req.body);
    return res.status(201).json({ message: 'Utilisateur créé avec succès.', data: userCreate });
  } catch (error) {
    console.error('Erreur signup:', error);
    return res.status(500).json({ message: "Erreur lors de la création de l'utilisateur.", error: error.message });
  }
};

// module.exports = new AuthController();
