// ============================================================================
// fastfoodsChanged — signal socket GLOBAL « ces boutiques ont changé »
// ============================================================================
// Émis à toute l'app (`io.emit`) dès qu'un changement modifie ce que le home et
// le checkout affichent d'une boutique : fiche boutique, zones / prix /
// créneaux / express, régime de livraison, interrupteur global, réglages de prix.
//
// Charge utile légère : `{ ids: string[] | null, reason }`. `ids: null` = toutes
// les boutiques (réglage global). L'app recharge alors ces boutiques via
// `GET /fastfood/all?ids=…` (ou la première page du home pour `null`), avec SON
// jeton : chaque appareil récupère son `deliveryOffer` et le régime effectif.
// On n'envoie PAS la boutique elle-même : l'offre de livraison dépend du user.
//
// Une modification faite directement en base ne passe pas par ici : le filet
// est le refus `delivery_price_mismatch` au paiement (l'app recharge alors).
// ============================================================================
const { getIO } = require('../../socket');

function notifyFastfoodsChanged(ids, reason) {
  try {
    const list = Array.isArray(ids) ? [...new Set(ids.filter(Boolean).map(String))] : null;
    if (list && list.length === 0) return;
    getIO().emit('fastfoodsChanged', { ids: list, reason: reason || null });
  } catch (e) {
    console.error(`[fastfoodsChanged] émission impossible : ${e.message}`);
  }
}

module.exports = { notifyFastfoodsChanged };
