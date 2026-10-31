// ============================================================================
// paymentAggregator — Agrégateurs de paiement connus (choix actif en BASE)
// ============================================================================
// MobileWallet route chaque /pay et /payout vers l'agrégateur qu'on lui nomme
// (`aggregator`). Sans ce champ, il retombe sur DigiKUNTZ. L'agrégateur actif
// décide aussi du barème de frais qui compose le prix affiché
// (`pricing/paymentFees.js`).
//
// Le choix actif vit en base : `settings_deployment.payment_aggregator`
// (migration 065), lu par `settings.service.getPaymentAggregator()`.
// Valeurs connues : `pawapay`, `digikuntz`. Valeur absente ou inconnue :
// erreur journalisée et retour au fonctionnement HISTORIQUE (`digikuntz`,
// le défaut de MobileWallet lui-même) — jamais un agrégateur deviné.
// ============================================================================

const AGGREGATORS = Object.freeze({ PAWAPAY: 'pawapay', DIGIKUNTZ: 'digikuntz' });
const KNOWN = Object.values(AGGREGATORS);

// Seuls les montants de ces agrégateurs sont affichés et retirables dans le
// portefeuille. L'historique DigiKUNTZ reste en base, jamais montré.
const WALLET_AGGREGATORS = Object.freeze([AGGREGATORS.PAWAPAY]);

let warned = false;

/** Normalise la valeur stockée en base ; inconnue → digikuntz (historique). */
function normalizeAggregator(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (KNOWN.includes(raw)) return raw;
  if (!warned) {
    console.error(`[paymentAggregator] ⚠️ payment_aggregator absent ou inconnu ("${raw}") → fonctionnement historique (${AGGREGATORS.DIGIKUNTZ})`);
    warned = true;
  }
  return AGGREGATORS.DIGIKUNTZ;
}

/** Vrai si les montants de cet agrégateur comptent dans le portefeuille. */
const countsInWallet = aggregator => WALLET_AGGREGATORS.includes(String(aggregator || '').toLowerCase());

module.exports = { AGGREGATORS, WALLET_AGGREGATORS, normalizeAggregator, countsInWallet };
