// ============================================================================
// settings.controller — Lecture publique restreinte + administration
// ============================================================================
// La marge plateforme n'est JAMAIS exposée publiquement : elle est fondue dans
// les prix affichés, et la révéler reviendrait à afficher au client ce qu'on
// prend sur chaque commande.
// ============================================================================
const repos = require('../../repositories');
const { getPricingSettings, setSetting, KEYS } = require('../../services/settings/settings.service');

/** Clés modifiables via l'API. Toute autre clé est refusée. */
const EDITABLE_KEYS = new Set(Object.values(KEYS));

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
    const { paymentFeePercent, deliveryFreeMode } = await getPricingSettings();
    return res.status(200).json({ success: true, message: 'Réglages tarifaires.', data: { paymentFeePercent, deliveryFreeMode } });
  } catch (error) {
    console.error('Erreur lecture réglages :', error);
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

/** PATCH /settings/:key — admin. Bascule à chaud, sans redéploiement. */
exports.patchSettingController = async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { key } = req.params;
    if (!EDITABLE_KEYS.has(key)) {
      return res.status(400).json({ success: false, message: `Réglage inconnu ou non modifiable : ${key}.` });
    }
    if (!req.body || req.body.value === undefined) {
      return res.status(400).json({ success: false, message: 'Champ `value` requis.' });
    }

    const { value } = req.body;
    // Typage explicite : une valeur mal typée fausserait silencieusement les
    // calculs de prix (ex. "100" concaténé au lieu d'être additionné).
    if (key === KEYS.DELIVERY_FREE_MODE && typeof value !== 'boolean') {
      return res.status(400).json({ success: false, message: '`value` doit être un booléen.' });
    }
    if (key !== KEYS.DELIVERY_FREE_MODE && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
      return res.status(400).json({ success: false, message: '`value` doit être un nombre positif.' });
    }

    const data = await setSetting(key, value);
    return res.status(200).json({ success: true, message: 'Réglage mis à jour.', data });
  } catch (error) {
    console.error('Erreur mise à jour réglage :', error);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};
