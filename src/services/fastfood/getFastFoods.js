// ============================================================================
// getFastFoodsService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { getMenuService } = require('../menu/getMenu.services');

exports.getFastFoodsService = async () => {
  try {
    const fastfoods = await repos.fastfoods.getAll();
    if (!fastfoods || fastfoods.length === 0) return [];

    const fastfoodsWithMenus = await Promise.all(
      fastfoods.map(async (fastfood) => {
        const menus = await getMenuService(fastfood.id);
        return { ...fastfood, menus };
      })
    );

    return fastfoodsWithMenus.filter(
      (f) => Array.isArray(f.menus) && f.menus.length > 0
    );
  } catch (error) {
    console.error('Erreur dans getFastfoods:', error);
    throw new Error(error.message || 'Erreur lors de la récupération du fastfood');
  }
};
