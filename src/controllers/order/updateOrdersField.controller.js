// controllers/order/updateOrdersField.controller.js
const { updateOrdersFieldService } = require('../../services/order/updateOrdersField.service');

/**
 * Contrôleur pour mettre à jour un champ spécifique pour toutes les commandes d'un fastFood ou d'un utilisateur
 * @param {Object} req - Requête HTTP
 * @param {Object} req.body - Corps de la requête
 * @param {string} req.body.fastFoodId - ID du fastFood (optionnel si userId est fourni)
 * @param {string} req.body.userId - ID de l'utilisateur (optionnel si fastFoodId est fourni)
 * @param {string} req.body.fieldName - Nom du champ à mettre à jour
 * @param {any} req.body.fieldValue - Nouvelle valeur du champ
 * @param {string} [req.body.filterStatus] - Statut pour filtrer les commandes (optionnel)
 * @param {Object} res - Réponse HTTP
 */
exports.updateOrdersField = async (req, res) => {
  try {
    const { fastFoodId, userId, fieldName, fieldValue, filterStatus } = req.body;

    // Vérification des paramètres obligatoires
    if (!fieldName) {
      return res.status(400).json({
        success: false,
        message: 'Le nom du champ à mettre à jour est requis'
      });
    }

    if (fieldValue === undefined) {
      return res.status(400).json({
        success: false,
        message: 'La valeur du champ à mettre à jour est requise'
      });
    }

    if (!fastFoodId && !userId) {
      return res.status(400).json({
        success: false,
        message: 'Vous devez fournir soit un fastFoodId, soit un userId'
      });
    }

    const result = await updateOrdersFieldService({
      fastFoodId,
      userId,
      fieldName,
      fieldValue,
      filterStatus
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Erreur lors de la mise à jour des commandes:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Erreur serveur lors de la mise à jour des commandes'
    });
  }
};
