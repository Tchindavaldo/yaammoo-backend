const { postBonusService } = require('../../services/bonus/postBonus.service');

exports.postBonusController = async (req, res) => {
  try {
    const data = await postBonusService(req.body);
    res.status(201).json({ message: 'bonus créé avec succès.', data });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
};
