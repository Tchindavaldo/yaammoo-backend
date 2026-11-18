// ============================================================================
// settings.controller — Lecture publique restreinte + administration
// ============================================================================
// La marge plateforme n'est JAMAIS exposée publiquement : elle est fondue dans
// les prix affichés, et la révéler reviendrait à afficher au client ce qu'on
// prend sur chaque commande.
// ============================================================================
const repos = require('../../repositories');
const { getPricingSettings, getAppVersionGate } = require('../../services/settings/settings.service');
const { paymentFeePercentOf } = require('../../services/pricing/paymentFees');
const { patchSetting } = require('../../services/settings/patchSetting.service');

async function requireAdmin(req, res) {
  const viewer = await repos.users.getUserByIdSafe(req.user?.uid);
  if (!viewer) {
    res.status(404).json({ success: false, message: 'Utilisateur non trouvé.' });
    return null;
  }
  if (!viewer.isAdmin) {
    res.status(403).json({ success: false, message: 'Réservé aux administrateurs.' });
    return null;
  }
  return viewer;
}

/** GET /settings/pricing — public. Sans la marge. */
exports.getPublicPricingController = async (req, res) => {
  try {
    const pricing = await getPricingSettings();
    // Taux EFFECTIF de l'agrégateur actif (réseau le plus cher) : même champ,
    // même sens qu'avant, qu'il s'agisse de DigiKUNTZ ou de pawaPay.
    const paymentFeePercent = paymentFeePercentOf(pricing);
    return res.status(200).json({ success: true, message: 'Réglages tarifaires.', data: { paymentFeePercent, deliveryFreeMode: pricing.deliveryFreeMode } });
  } catch (error) {
    console.error('Erreur lecture réglages :', error);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};

/** GET /settings/app-version — public. État de version pour le client courant. */
exports.getAppVersionGateController = async (req, res) => {
  try {
    const data = await getAppVersionGate(req);
    return res.status(200).json({ success: true, message: 'État de version.', data });
  } catch (error) {
    console.error('Erreur lecture version app :', error);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};

/** GET /settings — admin. Liste complète avec descriptions. */
exports.getSettingsController = async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const data = await repos.settings.listDetailed();
    return res.status(200).json({ success: true, message: 'Réglages récupérés.', data });
  } catch (error) {
    console.error('Erreur lecture réglages :', error);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};

/** PATCH /settings/:key — admin. Bascule à chaud, sans redéploiement (services/settings/patchSetting.service.js). */
exports.patchSettingController = async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    if (!req.body || req.body.value === undefined) {
      return res.status(400).json({ success: false, message: 'Champ `value` requis.' });
    }
    const r = await patchSetting(req.params.key, req.body.value);
    return res.status(r.status).json(r.status === 200 ? { success: true, message: r.message, data: r.data } : { success: false, message: r.message });
  } catch (error) {
    console.error('Erreur mise à jour réglage :', error);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};
