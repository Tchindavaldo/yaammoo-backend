// ============================================================================
// Commission helper — calcul du net reversé au marchand
// ============================================================================
// 1. MW prend sa commission sur le brut  → after_mw = gross - mwCommission
// 2. Yaammoo prend ses frais sur after_mw :
//      YAAMMOO_FEE_TYPE=flat    → YAAMMOO_FLAT_FEE (FCFA fixe, défaut)
//      YAAMMOO_FEE_TYPE=percent → round(after_mw × YAAMMOO_PERCENT_RATE)
// 3. net = after_mw - yaammooFee  (clampé ≥ 0)
// ============================================================================

/** @returns {{ net:number, mwCommission:number, afterMw:number, yaammooFee:number }} */
function computeNet(gross) {
  const amount = Number(gross) || 0;
  const mwRate = Number(process.env.DIGIKUNTZ_FEE) || 0;

  const mwCommission = Math.ceil(amount * mwRate);
  const afterMw = amount - mwCommission;

  const feeType = process.env.YAAMMOO_FEE_TYPE || 'flat';
  let yaammooFee;
  if (feeType === 'percent') {
    const percentRate = Number(process.env.YAAMMOO_PERCENT_RATE) || 0;
    yaammooFee = Math.ceil(afterMw * percentRate);
  } else {
    yaammooFee = Number(process.env.YAAMMOO_FLAT_FEE) || 0;
  }

  let net = afterMw - yaammooFee;
  if (net < 0) {
    console.warn(`[commission] net négatif (gross=${amount}, mwCommission=${mwCommission}, yaammooFee=${yaammooFee}) → clamp à 0`);
    net = 0;
  }

  return { net, mwCommission, afterMw, yaammooFee };
}

module.exports = { computeNet };
