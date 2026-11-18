// ============================================================================
// patchSetting — modifie un réglage à chaud (type vérifié PAR CLÉ), sans redéploiement.
// Utilisé par PATCH /settings/:key (controllers/settings/settings.controller.js) et par
// l'agent IA admin WhatsApp (services/whatsapp/admin/adminActions.service.js).
// ============================================================================
const { setSetting, KEYS } = require('./settings.service');
const { categoryOf } = require('./settings.keys');
const { notifyFastfoodsChanged } = require('../fastfood/fastfoodsChanged');

/** Clés modifiables. Toute autre clé est refusée. */
const EDITABLE_KEYS = new Set(Object.values(KEYS));

// ---------------------------------------------------------------------------
// Type attendu, PAR CLÉ
// ---------------------------------------------------------------------------
// 'number'  : nombre fini >= 0 (montants, pourcentages, seuils, durées)
// 'boolean' : booléen strict
// 'version' : chaîne "x.y.z"
// 'versions': tableau de chaînes "x.y.z", vide autorisé
// 'ids'     : tableau de chaînes non vides (uid, modèles, numéros), vide autorisé
// 'text'    : chaîne libre, vide autorisée (une version en review qu'on efface)
// 'digits'  : chaîne de chiffres non vide (indicatif téléphonique)
// 'hour'    : entier de -1 (coupé) à 23
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
  // Tableau de versions de test (migration 056) : [] = aucune.
  [KEYS.TEST_APP_VERSION]: 'versions',
  // Tableau d'uid de test (migration 057) : [] = aucun.
  [KEYS.TEST_USER_IDS]: 'ids',
  // Versions tolérées sans jeton (migration 058) : [] = aucune.
  [KEYS.TEST_NO_AUTH_VERSIONS]: 'versions',
  // Chaîne vide = images réelles gardées par le mode volume.
  [KEYS.TEST_VOLUME_IMAGE_URL]: 'text',
  [KEYS.OTP_DEFAULT_COUNTRY_CODE]: 'digits',
  // Interrupteur global « tout livré par la plateforme » (migration 074).
  [KEYS.PLATFORM_DELIVERY_ALL]: 'boolean',
  // Boutiques masquées (tableau d'ID) : [] = aucune.
  [KEYS.HIDDEN_FASTFOOD_IDS]: 'ids',
  // Agent IA WhatsApp (migrations 090, 097, 098). Avant, ai_models / ai_enabled
  // tombaient en 'number' : la doc annonçait un PATCH que l'API refusait.
  [KEYS.AI_MODELS]: 'ids',
  [KEYS.AI_ENABLED]: 'boolean',
  [KEYS.AI_DAILY_MENU_HOUR]: 'hour',
  [KEYS.AI_DEFAULT_MENU_IMAGE_URL]: 'text',
  [KEYS.AI_ADMIN_PHONES]: 'ids',
  [KEYS.WA_RESERVED_PHONES]: 'ids',
  [KEYS.WA_PIN_ADMIN_PHONES]: 'boolean',
  [KEYS.WA_ENV_NAME]: 'string',
  [KEYS.WA_SIBLING_KEY_NAME]: 'string',
  // Migration 099 ; ai_audio_max_seconds reste un nombre positif (0 = non écoutées).
  [KEYS.AI_AUDIO_MODELS]: 'ids',
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

    case 'versions':
      return Array.isArray(value) && value.every(v => typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v)) ? null : '`value` doit être un tableau de versions "x.y.z" (vide autorisé).';

    case 'ids':
      return Array.isArray(value) && value.every(v => typeof v === 'string' && v.trim() !== '') ? null : "`value` doit être un tableau d'ID (chaînes non vides, vide autorisé).";

    case 'text':
      return typeof value === 'string' ? null : '`value` doit être une chaîne.';

    case 'digits':
      return typeof value === 'string' && /^\d+$/.test(value) ? null : '`value` doit être une chaîne de chiffres (ex. "237").';

    case 'hour':
      return Number.isInteger(value) && value >= -1 && value <= 23 ? null : '`value` doit être une heure de 0 à 23, ou -1 pour couper.';

    default:
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? null : '`value` doit être un nombre positif.';
  }
}

/**
 * Modifie le réglage `key`. Les apps rechargent les boutiques quand le réglage change
 * les prix ou les zones affichés (frais, marges, course, interrupteur global, masquées).
 * @returns {Promise<{ status: number, message: string, data?: object }>}
 */
exports.patchSetting = async (key, value) => {
  if (!EDITABLE_KEYS.has(key)) return { status: 400, message: `Réglage inconnu ou non modifiable : ${key}.` };
  if (value === undefined) return { status: 400, message: 'Champ `value` requis.' };
  // Typage explicite : une valeur mal typée fausserait silencieusement les calculs
  // de prix (ex. "100" concaténé au lieu d'être additionné).
  const typeError = validateSettingValue(key, value);
  if (typeError) return { status: 400, message: typeError };

  const data = await setSetting(key, value);
  if (['pricing', 'delivery', 'withdrawal'].includes(categoryOf(key)) || key === KEYS.PLATFORM_DELIVERY_ALL || key === KEYS.HIDDEN_FASTFOOD_IDS) {
    notifyFastfoodsChanged(null, `setting:${key}`);
  }
  return { status: 200, message: 'Réglage mis à jour.', data };
};

exports.EDITABLE_KEYS = EDITABLE_KEYS;
exports.validateSettingValue = validateSettingValue;
