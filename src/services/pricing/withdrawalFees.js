// ============================================================================
// withdrawalFees — Le coût de faire SORTIR l'argent du portefeuille opérateur
// ============================================================================
// Encaisser ne suffit pas : l'argent doit être retiré du wallet MTN ou Orange, et
// ce retrait a un prix. Il était supporté en silence par la plateforme ; il entre
// désormais dans le prix affiché, exactement comme la commission de l'agrégateur.
//
// Barème à SEUIL, par opérateur :
//
//   montant <  seuil  →  frais FIXE            (54 F)
//   montant >= seuil  →  pourcentage + fixe    (1,2 % + 4 F)
//
// ⚠️ Chaque opérateur a ses propres clés de réglage. Les valeurs sont identiques
// aujourd'hui, mais un opérateur qui change son barème ne doit pas entraîner
// l'autre — d'où deux jeux de clés plutôt qu'un seul partagé.
//
// ⚠️ Le barème n'est PAS proportionnel : sous le seuil, un petit montant paie
// autant qu'un montant juste inférieur au seuil. Découper une somme en plusieurs
// retraits coûte donc plus cher qu'un seul — on calcule toujours sur le TOTAL
// réellement retiré, jamais ligne par ligne.
// ============================================================================

const { toNumber } = require('./deliveryPricing');

// Opérateurs connus. `network` côté commande/retrait peut arriver sous des
// formes libres ('Orangemoney', 'ORANGE_MONEY', 'mtn momo') : on normalise.
const OPERATORS = ['mtn', 'orange'];
const DEFAULT_OPERATOR = 'mtn';

/**
 * Opérateur normalisé depuis un libellé libre.
 * Inconnu → `mtn` par défaut : le barème est identique, et facturer zéro frais
 * serait pire (la plateforme paierait le retrait de sa poche).
 */
function resolveOperator(network) {
  const raw = String(network ?? '')
    .trim()
    .toLowerCase();
  return OPERATORS.find(op => raw.includes(op)) || DEFAULT_OPERATOR;
}

/**
 * Frais de retrait d'un montant, pour un opérateur.
 *
 * @param {number} amount            montant à retirer (FCFA)
 * @param {Object} fees              barème résolu (cf. `getWithdrawalFeeSettings`)
 * @param {string} [network='mtn']   opérateur ou libellé libre
 * @returns {number} frais, arrondi à l'entier SUPÉRIEUR (jamais négatif)
 */
function withdrawalFee(amount, fees, network = DEFAULT_OPERATOR) {
  const base = toNumber(amount);
  if (base <= 0) return 0;

  const scale = fees?.[resolveOperator(network)];
  if (!scale) return 0;

  if (base < toNumber(scale.threshold)) return Math.max(0, Math.ceil(toNumber(scale.flat)));

  const percent = toNumber(scale.percent);
  return Math.max(0, Math.ceil((base * percent) / 100 + toNumber(scale.addend)));
}

module.exports = { withdrawalFee, resolveOperator, OPERATORS, DEFAULT_OPERATOR };
