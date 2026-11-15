// POST /whatsapp/webhook : événements relayés par le module WhatsApp de rauval-backend.
// Corps BRUT (express.raw) : la signature se calcule sur les octets reçus, avant tout parsing.
const svc = require('../../services/whatsapp/webhookEvents.service');
const validateWhatsappEvent = require('../../utils/validator/validateWhatsappEvent');

exports.receiveWhatsappEvent = async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!svc.verifySignature(raw, req.get('X-Rauval-Timestamp'), req.get('X-Rauval-Signature'))) {
    console.warn('⚠️ [WHATSAPP] Événement refusé : signature absente, invalide ou expirée');
    return res.status(401).json({ success: false, message: 'Signature invalide' });
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ success: false, message: 'JSON invalide' });
  }
  const errors = validateWhatsappEvent(event);
  if (errors.length) {
    console.warn(`⚠️ [WHATSAPP] Événement invalide : ${errors.map(e => e.message).join(' ; ')}`);
    return res.status(400).json({ success: false, message: 'Événement invalide', errors });
  }

  try {
    const { handled } = await svc.handleEvent(event);
    return res.status(200).json({ success: true, handled });
  } catch (e) {
    console.error(`❌ [WHATSAPP] Traitement de l'événement ${event.event} ${event.wamid} :`, e);
    return res.status(500).json({ success: false, message: e.message });
  }
};
