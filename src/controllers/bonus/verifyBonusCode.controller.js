const { verifyBonusCodeService } = require('../../services/bonus/verifyBonusCode.service');

/** POST /bonus/verify — vérifie un code bonus. Lecture seule, aucune consommation. */
exports.verifyBonusCodeController = async (req, res) => {
  try {
    // `order` est FACULTATIF : sans lui, le code est vérifié hors contexte.
    // Fourni, il permet d'annoncer qu'un bonus plateforme n'est pas finançable
    // par cette commande (« ajoutez N plats ») avant que le user ne paie.
    const { code, fastFoodId, order } = req.body || {};
    const result = await verifyBonusCodeService(code, fastFoodId, order);
    const { status = result.success ? 200 : 400, ...body } = result;
    return res.status(status).json(body);
  } catch (error) {
    console.error('Erreur vérification code bonus :', error);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur lors de la vérification.' });
  }
};
