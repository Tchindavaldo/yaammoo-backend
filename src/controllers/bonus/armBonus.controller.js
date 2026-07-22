const { armBonusService } = require('../../services/bonus/armBonus.service');

/** POST /bonus/:id/arm — arme le bonus pour la prochaine commande éligible. */
exports.armBonusController = async (req, res) => {
  return handle(req, res, true);
};

/** DELETE /bonus/:id/arm — désarme le bonus. */
exports.disarmBonusController = async (req, res) => {
  return handle(req, res, false);
};

async function handle(req, res, armed) {
  try {
    const result = await armBonusService(req.user?.uid, req.params.id, armed);
    const { status = result.success ? 200 : 400, ...body } = result;
    return res.status(status).json(body);
  } catch (error) {
    console.error('Erreur armement bonus :', error);
    return res.status(500).json({ success: false, message: error.message || "Erreur serveur lors de l'armement." });
  }
}
