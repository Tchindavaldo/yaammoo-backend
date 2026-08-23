// ============================================================================
// settings.controller — Lecture publique restreinte + administration
// ============================================================================
// La marge plateforme n'est JAMAIS exposée publiquement : elle est fondue dans
// les prix affichés, et la révéler reviendrait à afficher au client ce qu'on
// prend sur chaque commande.
// ============================================================================
const repos = require('../../repositories');
const { getPricingSettings, getAppVersionGate, setSetting, KEYS } = require('../../services/settings/settings.service');

/** Clés modifiables via l'API. Toute autre clé est refusée. */
const EDITABLE_KEYS = new Set(Object.values(KEYS));

// ---------------------------------------------------------------------------
// Type attendu, PAR CLÉ
// ---------------------------------------------------------------------------
// 'number'  : nombre fini >= 0 (montants, pourcentages, seuils, durées)
// 'boolean' : booléen strict
// 'version' : chaîne "x.y.z"
// 'text'    : chaîne libre, vide autorisée (une version en review qu'on efface)
// 'digits'  : chaîne de chiffres non vide (indicatif téléphonique)
//
// Toute clé absente de cette table est traitée en 'number' : c'est le cas de la
// grande majorité des réglages (prix, frais, seuils).
const VALUE_TYPES = {
  [KEYS.DELIVERY_FREE_MODE]: 'boolean',
  [KEYS.APPLE_REVIEW_MODE]: 'boolean',
  [KEYS.MIN_APP_VERSION]: 'version',
  [KEYS.LATEST_APP_VERSION]: 'version',
  // Chaîne vide = aucune version en review : c'est la façon de désactiver le
  // bypass, elle doit rester acceptée.
  [KEYS.APPLE_VERSION_REVIEW_MODE]: 'text',
  [KEYS.OTP_DEFAULT_COUNTRY_CODE]: 'digits',
};

/**
 * Valide la valeur soumise pour une clé.
 * @returns {string|null} le message d'erreur, ou null si la valeur est bonne
 */
function validateSettingValue(key, value) {
  switch (VALUE_TYPES[key] || 'number') {
    case 'boolean':
      return typeof value === 'boolean' ? null : '`value` doit être un booléen.';

    case 'version':
      return typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value) ? null : '`value` doit être une version au format "x.y.z".';

    case 'text':
      return typeof value === 'string' ? null : '`value` doit être une chaîne.';

    case 'digits':
      return typeof value === 'string' && /^\d+$/.test(value) ? null : '`value` doit être une chaîne de chiffres (ex. "237").';

    default:
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? null : '`value` doit être un nombre positif.';
  }
}

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
    //
    // Le type est déclaré PAR CLÉ. Un défaut « nombre positif » ne convient pas :
    // plusieurs réglages sont des booléens, des versions ou du texte libre, et
    // les traiter en nombres les rendrait impossibles à modifier.
    const typeError = validateSettingValue(key, value);
    if (typeError) {
      return res.status(400).json({ success: false, message: typeError });
    }

    const data = await setSetting(key, value);
    return res.status(200).json({ success: true, message: 'Réglage mis à jour.', data });
  } catch (error) {
    console.error('Erreur mise à jour réglage :', error);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};
