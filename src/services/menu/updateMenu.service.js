// ============================================================================
// updateMenuService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { validateMenu } = require('../../utils/validator/validatMenu');
const { getFastFoodService } = require('../fastfood/getFastFood');
const { reliableEmit } = require('../../utils/reliableEmit');
const { enrichMenuForClient } = require('./enrichMenuForClient');
const { validateMenuPrices } = require('../pricing/menuPriceGuard');
const { getPricingSettings } = require('../settings/settings.service');

exports.updateMenuService = async (menuId, updateData) => {
  if (!menuId) return { success: false, message: 'ID du menu est requis' };
  if (!updateData || typeof updateData !== 'object' || Array.isArray(updateData)) {
    return { success: false, message: 'Format de données invalide pour la mise à jour' };
  }

  const errors = validateMenu(updateData, false, true);
  if (errors) return { success: false, message: `Erreur de validation lors de la mise à jour du menu: ${errors}` };

  try {
    const existing = await repos.menus.getById(menuId);
    if (!existing) return { success: false, message: 'Menu non trouvé' };

    // Contrôle des prix AVANT écriture. `updateData` peut ne porter aucun prix :
    // `validateMenuPrices` ne regarde alors rien, l'édition passe telle quelle.
    const fastFoodForPrices = await getFastFoodService(existing.fastFoodId);
    const priceErrors = validateMenuPrices(updateData, fastFoodForPrices, await getPricingSettings());
    if (priceErrors.length > 0) {
      return { success: false, message: priceErrors.map(e => e.message).join(' ') };
    }

    // Statut passé à 'unavailable' → stock forcé à 0 (le plat n'est plus vendable).
    if (updateData.status === 'unavailable') {
      updateData.stock = 0;
    }

    const updatedMenu = await repos.menus.update(menuId, updateData);

    const fastFood = await getFastFoodService(existing.fastFoodId);
    const userId = fastFood.userId;

    const io = getIO();
    // Broadcast catalogue public (CLIENT) : prix AFFICHÉ (livraison + marge + frais).
    const clientMenu = await enrichMenuForClient(updatedMenu);
    io.emit('globalMenuUpdated', { message: 'Menu mis à jour', menuId, menu: clientMenu });
    // Ciblé marchand propriétaire : prix BRUT (il gère son catalogue). Fiable.
    if (userId) {
      await reliableEmit(io, userId, 'fastFoodMenuUpdated', { message: 'Menu mis à jour', menuId, menu: updatedMenu });
    }

    return { success: true, message: 'Menu mis à jour avec succès', data: updatedMenu };
  } catch (error) {
    return { success: false, message: error.message || 'Erreur lors de la mise à jour du menu' };
  }
};
