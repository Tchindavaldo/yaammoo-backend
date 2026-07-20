const { rewardCredentialsBonusService } = require('../../services/bonus/rewardCredentialsBonus.service');

exports.rewardCredentialsBonusController = async (req, res) => {
  try {
    const result = await rewardCredentialsBonusService(req.params.id, req.body?.rewardCredentials, req.user?.uid);
    const { status = result.success ? 200 : 400, ...body } = result;
    return res.status(status).json(body);
  } catch (error) {
    console.error('Erreur livraison bonus :', error);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur lors de la livraison du bonus.' });
  }
};
