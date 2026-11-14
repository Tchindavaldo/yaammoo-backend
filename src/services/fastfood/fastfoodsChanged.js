// ============================================================================
// fastfoodsChanged — diffusion GLOBALE des boutiques modifiées
// ============================================================================
// Règle : le socket ENVOIE la donnée modifiée, l'app l'applique telle quelle,
// sans refaire de GET.
//
// 1. Boutiques précises (fiche, zones / prix / créneaux / express, régime) :
//    `broadcastFastfoodViews(ids)` émet `fastfoodUpdated { fastFood }` par
//    boutique, avec sa VUE HOME complète (prix affichés, zones du régime
//    effectif, menus, vignettes, note). Seul `deliveryOffer` est absent quand il
//    dépend du user (bonus) ; une campagne globale, valable pour tous, est jointe.
//    Boutique devenue invisible au home (indisponible, masquée, sans plat) :
//    `fastfoodsHidden { ids }`, l'app la retire.
// 2. Réglage global (frais, marges, interrupteur plateforme, boutiques masquées) :
//    TOUTES les boutiques changent. Les envoyer toutes serait un catalogue entier
//    dans un socket : on émet `fastfoodsChanged { ids: null }` et l'app relance,
//    en silence et en arrière-plan, le même rafraîchissement que le retour au
//    premier plan (`refreshLoadedSilently`).
//
// Une modification faite directement en base ne passe pas par ici : le filet
// est le refus au paiement (422 + `fastFoodIds`, l'app recharge ces boutiques).
// ============================================================================
const { getIO } = require('../../socket');

const uniq = ids => [...new Set((ids || []).filter(Boolean).map(String))];

/** Réglage global : signal sans données, l'app rafraîchit en silence. */
function notifyFastfoodsChanged(ids, reason) {
  try {
    const list = Array.isArray(ids) ? uniq(ids) : null;
    if (list && list.length === 0) return;
    getIO().emit('fastfoodsChanged', { ids: list, reason: reason || null });
    // Panier : articles non payés recalculés aux prix actuels (en arrière-plan).
    require('../order/repriceCart.service').repriceCartsForShops(list);
  } catch (e) {
    console.error(`[fastfoodsChanged] émission impossible : ${e.message}`);
  }
}

/** Boutiques précises : envoie leur vue home complète. Ne lève jamais. */
async function broadcastFastfoodViews(ids, reason) {
  const list = uniq(ids);
  if (list.length === 0) return;
  try {
    // require paresseux : getFastFoods -> menus -> ... évite un cycle au chargement.
    const { getFastFoodsService } = require('./getFastFoods');
    const views = await getFastFoodsService(undefined, { ids: list });
    const io = getIO();
    const seen = new Set();
    for (const view of views) {
      seen.add(String(view.id));
      const { deliveryOffer, ...rest } = view;
      // Sans user, `deliveryOffer` n'est que la campagne globale (ou null) :
      // on la joint si elle existe, sinon on n'écrase pas le bonus du user.
      const fastFood = deliveryOffer ? { ...rest, deliveryOffer } : rest;
      io.emit('fastfoodUpdated', { message: 'Fastfood mis à jour', fastFood, reason: reason || null });
    }
    const hidden = list.filter(id => !seen.has(id));
    if (hidden.length) io.emit('fastfoodsHidden', { ids: hidden, reason: reason || null });
    // Panier : articles non payés de ces boutiques recalculés (en arrière-plan).
    require('../order/repriceCart.service').repriceCartsForShops(list);
  } catch (e) {
    console.error(`[fastfoodsChanged] diffusion des boutiques impossible : ${e.message}`);
  }
}

module.exports = { notifyFastfoodsChanged, broadcastFastfoodViews };
