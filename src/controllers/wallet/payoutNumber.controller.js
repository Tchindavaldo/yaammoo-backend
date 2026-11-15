// Numéro de retrait (OM / MoMo) : envoi du code par SMS seul, validation,
// liste des numéros vérifiés. Réponses calquées sur /auth/phone/* (429 + Retry-After,
// 401 code refusé) pour que l'app réutilise la même étape OTP.
const repos = require('../../repositories');
const svc = require('../../services/wallet/payoutNumber.service');

const flatten = r => ({ success: r.success, message: r.message, code: r.code, ...(r.data || {}) });

const requestCtrl = send => async (req, res) => {
  try {
    const phoneNumber = req.body?.phoneNumber || req.body?.phone;
    if (!phoneNumber) return res.status(400).json({ success: false, message: 'Paramètre phoneNumber manquant' });
    const r = await send({ userId: req.user.uid, phoneNumber, network: req.body?.network });
    if (r.code === 'cooldown') {
      res.set('Retry-After', String(r.data?.retryAfter ?? 60));
      return res.status(429).json(flatten(r));
    }
    return res.status(r.success ? 200 : 400).json(flatten(r));
  } catch (error) {
    console.error('[payout-number] request', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.', error: error.message });
  }
};

const verifyCtrl = check => async (req, res) => {
  try {
    const phoneNumber = req.body?.phoneNumber || req.body?.phone;
    const code = req.body?.code || req.body?.otp;
    if (!phoneNumber || !code) return res.status(400).json({ success: false, message: 'phoneNumber et code requis' });
    const r = await check({ userId: req.user.uid, phoneNumber, code });
    return res.status(r.success ? 200 : 401).json(flatten(r));
  } catch (error) {
    console.error('[payout-number] verify', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.', error: error.message });
  }
};

exports.listPayoutNumbersController = async (req, res) => {
  try {
    return res.status(200).json({ success: true, data: await repos.payoutNumbers.listByUser(req.user.uid) });
  } catch (error) {
    console.error('[payout-number] list', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.', error: error.message });
  }
};

exports.requestPayoutNumberCodeController = requestCtrl(svc.requestPayoutNumberCode);
exports.verifyPayoutNumberCodeController = verifyCtrl(svc.verifyPayoutNumberCode);
exports.requestWhatsappNumberCodeController = requestCtrl(svc.requestWhatsappNumberCode);
exports.verifyWhatsappNumberCodeController = verifyCtrl(svc.verifyWhatsappNumberCode);
exports.listWhatsappNumbersController = async (req, res) => {
  try {
    return res.status(200).json({ success: true, data: await repos.verifiedNumbers.listWhatsappByUser(req.user.uid) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Erreur serveur.', error: error.message });
  }
};

exports.payoutNumberFeeController = async (req, res) => {
  try {
    return res.status(200).json({ success: true, data: await svc.estimatePayoutNumberFee() });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Erreur serveur.', error: error.message });
  }
};
