const { requestPhoneAuth, verifyPhoneAuth } = require('../../services/auth/phoneAuth.service');
const { getCostSummary } = require('../../services/notification/bird/birdCost.service');
const { getVerificationDetails } = require('../../services/notification/bird/getVerification.service');

exports.requestPhoneAuthController = async (req, res) => {
  try {
    const { phoneNumber, phone } = req.body;
    const target = phoneNumber || phone;

    if (!target) {
      return res.status(400).json({ success: false, message: 'Paramètre phoneNumber manquant' });
    }

    const response = await requestPhoneAuth({ phoneNumber: target });

    // 429 sur un renvoi trop rapproché : le frontend peut ainsi afficher un
    // compte à rebours au lieu d'un message d'erreur générique.
    if (response.code === 'cooldown') {
      res.set('Retry-After', String(response.data.retryAfter));
      return res.status(429).json(response);
    }

    return res.status(response.success ? 200 : 400).json(response);
  } catch (error) {
    console.error('❌ Erreur Controller demande auth téléphone:', error);
    return res.status(500).json({
      success: false,
      message: error.message || "Erreur serveur lors de l'envoi du code.",
    });
  }
};

exports.verifyPhoneAuthController = async (req, res) => {
  try {
    const { phoneNumber, phone, code, otp, nom, prenom, age, email } = req.body;
    const target = phoneNumber || phone;
    const submittedCode = code || otp;

    if (!target) {
      return res.status(400).json({ success: false, message: 'Paramètre phoneNumber manquant' });
    }
    if (!submittedCode) {
      return res.status(400).json({ success: false, message: 'Paramètre code manquant' });
    }

    const response = await verifyPhoneAuth({
      phoneNumber: target,
      code: submittedCode,
      profile: { nom, prenom, age, email },
    });

    // 401 sur un code refusé : c'est un échec d'authentification, pas une
    // requête malformée.
    return res.status(response.success ? 200 : 401).json(response);
  } catch (error) {
    console.error('❌ Erreur Controller vérification auth téléphone:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Erreur serveur lors de la vérification.',
    });
  }
};

exports.getOtpCostSummaryController = async (req, res) => {
  try {
    const { from, to } = req.query;
    const summary = await getCostSummary({ from, to });
    return res.status(200).json({ success: true, message: 'Récapitulatif des coûts', data: summary });
  } catch (error) {
    console.error('❌ Erreur Controller récapitulatif coûts OTP:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Erreur serveur lors du calcul des coûts.',
    });
  }
};

/**
 * Détail d'une vérification OTP : tentatives par canal, statut de livraison,
 * erreur éventuelle. C'est l'appel à faire quand un code n'arrive pas.
 */
exports.getVerificationDetailsController = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await getVerificationDetails({ verificationId: id });
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('❌ Erreur Controller détail vérification:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Erreur serveur lors de la lecture de la vérification.',
    });
  }
};
