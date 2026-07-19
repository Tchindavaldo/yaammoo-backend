// ============================================================================
// postBonusService — Création d'un bonus (définition uniquement)
// ============================================================================
// Seule la DÉFINITION est persistée. Les champs dépendant du user (bonusStats,
// compteurs, requestStatus…) sont recalculés au GET et rejetés ici par le
// validateur. Cf. architecture/bonus.md.
// ============================================================================
const repos = require('../../repositories');
const { validateBonus } = require('../../utils/validator/validateBonus');

/**
 * @param {Object} data définition du bonus
 * @returns {Promise<{success:boolean, status?:number, message?:string, errors?:Array, data?:Object}>}
 */
exports.postBonusService = async data => {
  const errors = validateBonus(data);
  if (errors.length > 0) {
    return { success: false, status: 400, message: 'Définition de bonus invalide.', errors };
  }

  // Valeurs par défaut : un bonus est actif sauf mention contraire.
  const created = await repos.bonus.create({
    ...data,
    active: data.active ?? true,
  });

  return { success: true, status: 201, message: 'Bonus créé avec succès.', data: created };
};
