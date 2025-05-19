// services/order/updateOrdersField.service.js
const { db } = require('../../config/firebase');
const { getIO } = require('../../socket');
const { validateOrder } = require('../../utils/validator/validateOrder');
const { getFastFoodService } = require('../fastfood/getFastFood');

/**
 * Met à jour un champ spécifique pour toutes les commandes d'un fastFood ou d'un utilisateur
 * @param {Object} params - Paramètres de mise à jour
 * @param {string} params.fastFoodId - ID du fastFood (optionnel si userId est fourni)
 * @param {string} params.userId - ID de l'utilisateur (optionnel si fastFoodId est fourni)
 * @param {string} params.fieldName - Nom du champ à mettre à jour
 * @param {any} params.fieldValue - Nouvelle valeur du champ
 * @param {string} [params.filterStatus] - Statut pour filtrer les commandes (optionnel)
 * @returns {Promise<Object>} - Résultat de l'opération
 */
exports.updateOrdersFieldService = async params => {
  const { fastFoodId, userId, fieldName, fieldValue, filterStatus } = params;

  // Vérification des paramètres
  if (!fieldName) {
    return { success: false, message: 'Le nom du champ à mettre à jour est requis' };
  }

  if (fieldValue === undefined) {
    return { success: false, message: 'La valeur du champ à mettre à jour est requise' };
  }

  if (!fastFoodId && !userId) {
    return { success: false, message: 'Vous devez fournir soit un fastFoodId, soit un userId' };
  }

  try {
    let query = db.collection('orders');

    if (fastFoodId) {
      query = query.where('fastFoodId', '==', fastFoodId);
    }

    if (userId) {
      query = query.where('userId', '==', userId);
    }

    if (filterStatus) {
      query = query.where('status', '==', filterStatus);
    }

    // Exécution de la requête
    const snapshot = await query.get();

    if (snapshot.empty) {
      return {
        success: true,
        message: 'Aucune commande trouvée correspondant aux critères',
        count: 0,
      };
    }

    // Préparation de la mise à jour
    const updateData = {};
    updateData[fieldName] = fieldValue;
    updateData.updatedAt = new Date().toISOString();

    // Validation de la mise à jour pour un seul champ
    const validationData = {};
    validationData[fieldName] = fieldValue;

    const errors = validateOrder(validationData, false, true);
    if (errors) {
      return {
        success: false,
        message: `Erreur de validation: ${errors}`,
      };
    }

    // Mise à jour des documents
    const batch = db.batch();
    const updatedOrders = [];

    snapshot.forEach(doc => {
      const orderRef = db.collection('orders').doc(doc.id);
      batch.update(orderRef, updateData);
      updatedOrders.push({ ...doc.data(), ...updateData, id: doc.id });
    });

    await batch.commit();

    // Notifications via socket.io
    const io = getIO();

    // Regroupement par fastFood pour les notifications
    const groupedByFastFood = {};
    const groupedByUser = {};

    updatedOrders.forEach(order => {
      // Grouper par fastFood
      if (!groupedByFastFood[order.fastFoodId]) {
        groupedByFastFood[order.fastFoodId] = [];
      }
      groupedByFastFood[order.fastFoodId].push(order);

      // Grouper par utilisateur
      if (!groupedByUser[order.userId]) {
        groupedByUser[order.userId] = [];
      }
      groupedByUser[order.userId].push(order);
    });

    // Envoyer des notifications aux fastFoods
    for (const ffId in groupedByFastFood) {
      try {
        const fastFood = await getFastFoodService(ffId);
        if (fastFood && fastFood.userId) {
          io.to(fastFood.userId).emit('fastFoodOrdersUpdated', {
            message: `Mise à jour du champ ${fieldName} pour ${groupedByFastFood[ffId].length} commandes`,
            field: fieldName,
            orders: groupedByFastFood[ffId],
          });
        }
      } catch (err) {
        console.warn(`Erreur lors de l'émission pour fastFoodId ${ffId}: ${err.message}`);
      }
    }

    // Envoyer des notifications aux utilisateurs
    for (const uid in groupedByUser) {
      io.to(uid).emit('userOrdersUpdated', {
        message: `Mise à jour du champ ${fieldName} pour ${groupedByUser[uid].length} commandes`,
        field: fieldName,
        orders: groupedByUser[uid],
      });
    }

    return {
      success: true,
      message: `${updatedOrders.length} commandes mises à jour avec succès`,
      count: updatedOrders.length,
      data: updatedOrders,
    };
  } catch (error) {
    console.error('Erreur dans updateOrdersFieldService:', error);
    return {
      success: false,
      message: error.message || 'Erreur lors de la mise à jour des commandes',
    };
  }
};
