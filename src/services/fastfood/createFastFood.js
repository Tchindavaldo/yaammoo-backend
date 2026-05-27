// ============================================================================
// createFastfoodService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { validateFastfood } = require('../../utils/validator/validateFastfood');

exports.createFastfoodService = async (data) => {
  const io = getIO();
  const errors = validateFastfood(data);
  if (errors.length > 0) {
    const formattedErrors = errors.map((err) => `${err.field}: ${err.message}`).join(', ');
    const error = new Error(`Erreur de validation: ${formattedErrors}`);
    error.code = 400;
    throw error;
  }

  // Vérification d'unicité par userId
  const existing = await repos.fastfoods.getByUserId(data.userId);
  if (existing) {
    const error = new Error('Cet utilisateur possède déjà un fastfood.');
    error.code = 400;
    throw error;
  }

  const dataFinal = await repos.fastfoods.create(data);

  await repos.users.updateUser(data.userId, { fastFoodId: dataFinal.id, isMarchand: true });

  io.emit('newFastfood', { message: 'Nouveau fastfood', fastFood: dataFinal });
  return dataFinal;
};
