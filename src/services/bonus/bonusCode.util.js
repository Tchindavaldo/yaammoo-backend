// ============================================================================
// bonusCode.util — Génération du code de réclamation d'un bonus
// ============================================================================
// Code court, lisible et dictable à l'oral : le user le présente/saisit au
// moment de la commande pour consommer une utilisation du bonus.
// Alphabet volontairement SANS caractères ambigus (0/O, 1/I/L) pour éviter les
// erreurs de saisie.
// ============================================================================
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PREFIX = 'YAM';
const CODE_LENGTH = 6;

/**
 * Génère un code de réclamation, ex. "YAM-7K3F9Q".
 * @param {number} [length]
 * @returns {string}
 */
function generateBonusCode(length = CODE_LENGTH) {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `${PREFIX}-${code}`;
}

/** Normalise un code saisi (casse/espaces) avant comparaison. */
function normalizeBonusCode(code) {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

module.exports = { generateBonusCode, normalizeBonusCode, ALPHABET, PREFIX };
