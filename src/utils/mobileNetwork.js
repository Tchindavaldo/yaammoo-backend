// ============================================================================
// mobileNetwork — Réseaux Mobile Money : une seule normalisation
// ============================================================================
// Le même réseau arrive sous plusieurs formes selon l'endroit :
//   - /pay MobileWallet          : 'MTN' | 'Orangemoney'
//   - /payout MobileWallet       : 'MTN' | 'ORANGEMONEY' (STRICT, majuscules)
//   - /operators/predict         : 'MTN' | 'Orangemoney'
//   - historique / front         : 'ORANGE_MONEY', 'orange', 'mtn momo'…
//
// Forme CANONIQUE en base (transactions.network, withdrawals.source_network) :
// celle du payout, 'MTN' | 'ORANGEMONEY' — c'est elle que MobileWallet exige
// pour `source_network` / `account_bank_code`.
//
// ⚠️ Contrairement à `withdrawalFees.resolveOperator`, un libellé inconnu
// renvoie `null` : ici on débite un solde précis, jamais un réseau deviné.
// ============================================================================

const NETWORKS = Object.freeze({ MTN: 'MTN', ORANGE: 'ORANGEMONEY' });

// Clé du solde dans la réponse `GET /wallet/balance`.
const BALANCE_KEY = Object.freeze({ [NETWORKS.MTN]: 'mtn', [NETWORKS.ORANGE]: 'orange' });

/** 'MTN' | 'ORANGEMONEY' | null depuis un libellé libre. */
function toCanonicalNetwork(raw) {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!v) return null;
  if (v.includes('mtn')) return NETWORKS.MTN;
  if (v.includes('orange')) return NETWORKS.ORANGE;
  return null;
}

/** Forme attendue par MobileWallet `/pay` : 'MTN' | 'Orangemoney'. */
function toPayNetwork(raw) {
  const n = toCanonicalNetwork(raw);
  if (n === NETWORKS.MTN) return 'MTN';
  if (n === NETWORKS.ORANGE) return 'Orangemoney';
  return null;
}

/** 'mtn' | 'orange' | null — clé de barème et de solde. */
const toBalanceKey = raw => BALANCE_KEY[toCanonicalNetwork(raw)] ?? null;

module.exports = { NETWORKS, BALANCE_KEY, toCanonicalNetwork, toPayNetwork, toBalanceKey };
