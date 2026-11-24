// controllers/auth/emailAuth.controller.js
// POST /auth/email/request et /auth/email/verify (inscription e-mail avec code).
const { requestEmailCode, verifyEmailRegister } = require('../../services/auth/emailAuth.service');

// Reponses A PLAT, comme /auth/phone/* : { success, message, ...champs }.
const flatten = ({ data, ...rest }) => ({ ...rest, ...(data || {}) });

exports.requestEmailCodeController = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ success: false, message: 'Paramètre email manquant' });

    const response = await requestEmailCode({ email });
    if (response.code === 'cooldown') {
      res.set('Retry-After', String(response.data.retryAfter));
      return res.status(429).json(flatten(response));
    }
    if (response.code === 'exists') return res.status(409).json(flatten(response));
    return res.status(response.success ? 200 : 400).json(flatten(response));
  } catch (error) {
    console.error('❌ Erreur Controller demande code e-mail:', error);
    return res.status(500).json({ success: false, message: "Erreur serveur lors de l'envoi du code." });
  }
};

exports.verifyEmailRegisterController = async (req, res) => {
  try {
    const { email, code, password } = req.body || {};
    if (!email) return res.status(400).json({ success: false, message: 'Paramètre email manquant' });
    if (!code) return res.status(400).json({ success: false, message: 'Paramètre code manquant' });
    if (!password) return res.status(400).json({ success: false, message: 'Paramètre password manquant' });

    const response = await verifyEmailRegister({ email, code, password });
    if (response.code === 'exists') return res.status(409).json(flatten(response));
    return res.status(response.success ? 200 : 401).json(flatten(response));
  } catch (error) {
    console.error('❌ Erreur Controller vérification code e-mail:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur lors de la vérification.' });
  }
};
