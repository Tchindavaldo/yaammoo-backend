// ============================================================================
// postMenuService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { validateMenu } = require('../../utils/validator/validatMenu');
const { getFastFoodService } = require('../fastfood/getFastFood');
const { reliableEmit } = require('../../utils/reliableEmit');
const { enrichMenuForClient } = require('./enrichMenuForClient');

exports.postMenuService = async data => {
  try {
    const io = getIO();
    const errors = validateMenu(data, true, true);
    if (errors) {
      return {
        success: false,
        message: `Erreur de validation lors de la création du menu: ${errors}`,
        data: null,
      };
    }

    const menuAdded = await repos.menus.create(data);

    const fastFood = await getFastFoodService(menuAdded.fastFoodId);
    const userId = fastFood.userId;

    // Broadcast catalogue public (CLIENT) : prix AFFICHÉ (livraison + marge + frais).
    const clientMenu = await enrichMenuForClient(menuAdded);
    io.emit('newGlobalMenu', { message: 'Nouveau menu', menu: clientMenu });
    // Ciblé marchand propriétaire : prix BRUT (il gère son catalogue). Fiable.
    if (userId) {
      await reliableEmit(io, userId, 'newFastFoodMenu', { message: 'Nouveau menu', menu: menuAdded });
    }

    return { success: true, message: 'Menu ajouté avec succès', data: menuAdded };
  } catch (error) {
    return {
      success: false,
      message: error.message || 'Erreur lors de la création du menu',
      data: null,
    };
  }
};
