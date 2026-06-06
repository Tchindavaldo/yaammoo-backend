const crypto = require('crypto');
const { webhookMobilewalletService } = require('../../services/transaction/webhookMobilewallet.service');

/**
 * Webhook entrant d'ai_browser2 pour confirmer le verdict du paiement.
 * Signature HMAC-SHA256 : X-MobileWallet-Signature: t=<ts>,v1=<hex>
 */
exports.webhookMobilewalletController = async (req, res) => {
  try {
    const signature = req.get('X-MobileWallet-Signature');
    if (!signature) {
      return res.status(400).json({ success: false, message: 'Signature manquante' });
    }

    const webhookSecret = process.env.MOBILEWALLET_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('⚠️ MOBILEWALLET_WEBHOOK_SECRET non configurée');
      return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }

    // Parse signature : t=<timestamp>,v1=<hex>
    const sigParts = signature.split(',').reduce((acc, part) => {
      const [key, val] = part.split('=');
      acc[key.trim()] = val.trim();
      return acc;
    }, {});

    const ts = sigParts.t;
    const v1 = sigParts.v1;

    if (!ts || !v1) {
      return res.status(400).json({ success: false, message: 'Signature invalide' });
    }

    // Récupérer le raw body (string, pas JSON parsé)
    const rawBody = req.rawBody || Buffer.from(req.body).toString();

    // Recalculer HMAC
    const mac = crypto
      .createHmac('sha256', webhookSecret)
      .update(`${ts}.${rawBody}`)
      .digest('hex');

    if (mac !== v1) {
      console.warn('⚠️ Webhook signature invalide. Rejeté.');
      return res.status(401).json({ success: false, message: 'Signature invalide' });
    }

    // Signature OK → parser le body
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    // Traiter le webhook
    await webhookMobilewalletService(payload);

    // Répondre 200 immédiatement (évite retries inutiles)
    return res.status(200).json({ success: true, message: 'Webhook reçu' });
  } catch (error) {
    console.error('Erreur traitement webhook mobilewallet:', error);
    // Retourner 200 même en cas d'erreur (évite boucles infinies de retry)
    return res.status(200).json({ success: false, message: error.message });
  }
};
