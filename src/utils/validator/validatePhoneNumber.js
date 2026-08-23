// Normalisation des numéros de téléphone au format E.164 attendu par Bird.
//
// L'indicatif par défaut est PASSÉ EN PARAMÈTRE et non lu ici : il vit dans la
// table `settings` (`otp_default_country_code`, migration 046), dont la lecture
// est asynchrone. Ces fonctions restent donc pures et synchrones — les services
// résolvent le réglage puis le transmettent.

/** Repli utilisé quand l'appelant ne transmet pas d'indicatif. */
const FALLBACK_COUNTRY_CODE = '237';

/**
 * Normalise un numéro de téléphone au format E.164 (+237698087460).
 * Accepte les formats courants : "+237 6 98 08 74 60", "00237698087460", "698087460".
 *
 * @param {string|number} phoneNumber
 * @param {string} [countryCode] indicatif ajouté si le numéro est local
 * @returns {string|null} le numéro normalisé, ou null si invalide
 */
exports.normalizePhoneNumber = (phoneNumber, countryCode) => {
  if (phoneNumber === null || phoneNumber === undefined) return null;

  const raw = String(phoneNumber);
  if (!raw.trim()) return null;

  const prefix = String(countryCode || FALLBACK_COUNTRY_CODE).replace(/\D/g, '') || FALLBACK_COUNTRY_CODE;

  // On ne garde que les chiffres et un éventuel '+' initial
  let cleaned = raw.trim().replace(/[\s\-().]/g, '');

  if (cleaned.startsWith('00')) {
    cleaned = `+${cleaned.slice(2)}`;
  } else if (!cleaned.startsWith('+')) {
    // Numéro local : on préfixe avec l'indicatif
    cleaned = `+${prefix}${cleaned}`;
  }

  if (!/^\+[1-9]\d{7,14}$/.test(cleaned)) return null;

  return cleaned;
};

/**
 * Convertit un numéro E.164 en entier, pour la colonne `users.numero` (BIGINT).
 * Le '+' n'est pas conservé : "+237698087460" -> 237698087460.
 *
 * @param {string} e164
 * @returns {number|null}
 */
exports.phoneToNumero = e164 => {
  if (!e164) return null;
  const digits = String(e164).replace(/\D/g, '');
  if (!digits) return null;
  const numero = Number(digits);
  return Number.isSafeInteger(numero) ? numero : null;
};

/**
 * Formes sous lesquelles un même numéro peut déjà exister dans `users.numero`.
 *
 * La colonne est un BIGINT sans '+' : les comptes créés par le parcours
 * e-mail portent le numéro LOCAL saisi (698087460), tandis que l'auth par
 * téléphone normalise en E.164 (237698087460). Chercher une seule forme
 * créerait un doublon de compte pour un utilisateur déjà inscrit.
 *
 * @param {string} e164
 * @param {string} [countryCode]
 * @returns {number[]}
 */
exports.phoneVariants = (e164, countryCode) => {
  if (!e164) return [];

  const prefix = String(countryCode || FALLBACK_COUNTRY_CODE).replace(/\D/g, '') || FALLBACK_COUNTRY_CODE;
  const digits = String(e164).replace(/\D/g, '');

  const variants = [Number(digits)];

  if (digits.startsWith(prefix)) {
    variants.push(Number(digits.slice(prefix.length)));
  }

  return [...new Set(variants)].filter(Number.isSafeInteger).filter(Boolean);
};

exports.FALLBACK_COUNTRY_CODE = FALLBACK_COUNTRY_CODE;
