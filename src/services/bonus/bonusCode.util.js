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
// 8 caractères sur un alphabet de 31 → ~852 milliards de combinaisons. À 6, on
// tombait à ~887 millions : avec 1M de codes vivants, ~0,1% de collision par
// génération, soit un échec d'insert visible par le user (index unique).
const CODE_LENGTH = 8;
// Tentatives avant d'abandonner. Une collision étant déjà improbable, deux
// collisions consécutives signalent un vrai problème (alphabet, RNG).
const MAX_GENERATION_ATTEMPTS = 5;

/**
 * Génère un code de réclamation, ex. "YAM-7K3F9QW2".
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

/**
 * Génère un code garanti libre. L'index unique en base reste l'autorité finale ;
 * ce pré-contrôle évite juste qu'une collision remonte au user en erreur 500.
 *
 * @param {(code:string)=>Promise<boolean>} isTaken vrai si le code existe déjà
 * @param {number} [attempts]
 * @returns {Promise<string>}
 */
async function generateUniqueBonusCode(isTaken, attempts = MAX_GENERATION_ATTEMPTS) {
  for (let i = 0; i < attempts; i++) {
    const code = generateBonusCode();
    if (typeof isTaken !== 'function') return code;
    if (!(await isTaken(code))) return code;
    console.warn(`bonusCode: collision sur ${code}, nouvelle tentative (${i + 1}/${attempts}).`);
  }
  throw new Error("Impossible de générer un code bonus unique après plusieurs tentatives.");
}

/** Normalise un code saisi (casse/espaces) avant comparaison. */
function normalizeBonusCode(code) {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

module.exports = { generateBonusCode, generateUniqueBonusCode, normalizeBonusCode, ALPHABET, PREFIX, CODE_LENGTH };
