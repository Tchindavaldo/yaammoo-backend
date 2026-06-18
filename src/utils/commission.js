// ============================================================================
// Commission helper — calcul du net reversé au marchand
// ============================================================================
// Sur chaque commande payée, deux frais sont prélevés sur le montant brut :
//   - une commission MobileWallet en pourcentage (MOBILEWALLET_COMMISSION_RATE)
//   - un frais fixe yaammoo (YAAMMOO_FLAT_FEE), en FCFA, par commande
//
// net = gross - round(gross * rate) - flatFee   (clampé à 0)
//
// ⚠️ Valeurs jamais en dur : toujours via process.env (cf. CLAUDE.md).
// ============================================================================

/** @returns {{ net:number, mwCommission:number, yaammooFee:number }} */
function computeNet(gross) {
  const amount = Number(gross) || 0;
  const rate = Number(process.env.MOBILEWALLET_COMMISSION_RATE) || 0;
  const flatFee = Number(process.env.YAAMMOO_FLAT_FEE) || 0;

  const mwCommission = Math.round(amount * rate);
  const yaammooFee = flatFee;

  let net = amount - mwCommission - yaammooFee;
  if (net < 0) {
    console.warn(`[commission] net négatif (gross=${amount}, mwCommission=${mwCommission}, yaammooFee=${yaammooFee}) → clamp à 0`);
    net = 0;
  }

  return { net, mwCommission, yaammooFee };
}

module.exports = { computeNet };
