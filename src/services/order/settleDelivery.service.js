// ============================================================================
// settleDeliveryService — Règlement des livraisons au passage en `pending`
// ============================================================================
// **Déclenché quand la commande devient RÉELLE (payée), jamais à la mise au
// panier** : un panier peut encore être vidé, on ne facture rien tant qu'il
// n'est pas payé.
//
// Deux appelants, parce que le workflow a deux chemins :
//   • panier       → updateOrders (transition pendingToBuy → pending). Le lot
//                    arrive en UN SEUL appel : c'est lui, le panier.
//   • achat direct → createOrderService, uniquement si status === 'pending'.
//
// Ce que fait ce module :
//   1. UNE seule course par DÉPART. Une commande = un plat, donc un panier de
//      3 plats fait 3 commandes — mais le livreur ne se déplace qu'une fois par
//      départ. Les autres lignes gardent leur `realPrice` (traçabilité) avec
//      `courseBilled = false`, et `deliveryGroupId` les relie.
//      Un « départ » = `deliveryGroupKey` (boutique + zone + type + date [+ heure]),
//      la clé PARTAGÉE avec `validatePaymentAmount`. Grouper sur le seul
//      `fastFoodId` était juste tant qu'un validateur imposait zone/date/créneau
//      identiques par boutique ; depuis que le panier est libre, ça versait moins
//      de courses qu'on n'en facturait.
//   2. Le bonus est consommé UNE fois pour le lot, pas une fois par plat.
//   3. DEUX écritures, volontairement séparées :
//        • `order_settlements` — l'ARGENT. Une ligne par commande, TOUJOURS.
//        • `order_deliveries`  — la COURSE. Une ligne SEULEMENT si livrée.
//      Une commande à emporter n'a pas de course : lui créer une ligne dans une
//      table « deliveries » serait incohérent, et pénible à exploiter en stats.
//
// Non bloquant : les commandes existent déjà quand on arrive ici. Un incident
// comptable ne doit pas casser une commande payée — il est journalisé.
// ============================================================================
const repos = require('../../repositories');
const { generateId } = require('../../repositories/idGen');
const { getPricingSettings } = require('../settings/settings.service');
const { resolveOffer } = require('../pricing/deliveryOfferResolver');
const { resolveDeliveryBonus, consumeDeliveryBonus } = require('../bonus/applyDeliveryBonus.service');
const { splitDeliveryAmounts, toNumber, feeIncludedIn, isPlatformDelivered } = require('../pricing/deliveryPricing');
const { withdrawalFee } = require('../pricing/withdrawalFees');
// Clé PARTAGÉE avec `validatePaymentAmount` : on verse exactement le nombre de
// courses qu'on a facturé au user.
const { deliveryGroupKey } = require('../pricing/deliveryGroupKey');

/** Frais de retrait dus sur un montant, pour l'opérateur de la commande. */
const withdrawalFee_ = (amount, pricing, order) => withdrawalFee(amount, pricing?.withdrawalFees, order?.network ?? order?.payBy);

/**
 * Montant RÉEL des articles d'une commande, depuis les prix bruts figés à
 * l'achat (`rawPrice`). Sert en régime PLATEFORME, où le prix payé a été calé
 * sur un multiple du pas : le fastfood doit toucher son prix, pas un résidu.
 */
function rawItemsOf(order) {
  const prices = order?.menu?.prices;
  const idx = Math.max(0, toNumber(order?.selectedPriceIndex) - 1);
  const unit = Array.isArray(prices) ? toNumber(prices[idx]?.rawPrice ?? prices[idx]?.price) : 0;
  const qty = Math.max(1, toNumber(order?.quantity) || 1);

  const sum = (list, factorOf) => (Array.isArray(list) ? list : []).reduce((acc, it) => (it?.status === true ? acc + toNumber(it?.rawPrice ?? it?.prix) * factorOf(it) : acc), 0);

  return unit * qty + sum(order?.extra, () => 1) + sum(order?.drink, d => Math.max(1, toNumber(d?.quantite) || 1));
}

/**
 * @param {Array}  orders     commandes venant de passer en `pending`
 * @param {string} [bonusCode] code bonus présenté pour le lot
 * @returns {Promise<{offer: Object|null, settlements: Array, deliveries: Array}>}
 *   `settlements` : une entrée par commande. `deliveries` : seulement les livrées.
 */
exports.settleDeliveryService = async ({ orders, bonusCode }) => {
  const settled = { offer: null, settlements: [], deliveries: [] };
  const list = (Array.isArray(orders) ? orders : [orders]).filter(o => o && o.id);
  if (list.length === 0) return settled;

  try {
    const pricing = await getPricingSettings();
    const userId = list[0].userId;

    // ── Bonus : résolu UNE fois pour le lot ─────────────────────────────────
    // Un bonus vaut pour une commande, pas pour chaque plat du panier. On le
    // résout sur la boutique de la première commande qui peut y prétendre.
    let bonusResolution = null;
    for (const order of list) {
      const attempt = await resolveDeliveryBonus({ userId, fastFoodId: order.fastFoodId, bonusCode });
      // Un code explicitement fourni et invalide ne doit pas faire échouer un
      // paiement déjà encaissé : on journalise et on continue sans gratuité.
      if (attempt?.error) {
        console.warn('settleDelivery: bonus refusé —', attempt.error);
        break;
      }
      if (attempt?.bonus) {
        bonusResolution = { ...attempt, fastFoodId: order.fastFoodId };
        break;
      }
    }

    // Une campagne globale PRIME et laisse le bonus intact : le brûler pendant
    // une gratuité générale serait une perte sèche pour le user.
    const { offer, consumeBonus } = resolveOffer(pricing.deliveryFreeMode, bonusResolution?.offer || null);
    settled.offer = offer;

    if (consumeBonus && bonusResolution?.bonus) {
      settled.offer = await consumeDeliveryBonus({ ...bonusResolution, orderId: list[0].id });
    }

    // ── Une seule course par DÉPART réel ────────────────────────────────────
    // La clé est celle de `validatePaymentAmount` : ce qu'on verse doit compter
    // exactement les mêmes courses que ce qu'on a facturé au user.
    const groupIdByKey = {};
    const billedKeys = new Set();

    // ── Frais de retrait : UNE ponction par BOUTIQUE, pas par commande ──────
    // Le prix affiché porte le frais sur CHAQUE plat — au moment où il est
    // composé, sur le home, le panier n'existe pas encore. Mais l'argent d'une
    // même boutique sort en UNE fois : facturer N forfaits pour un seul retrait
    // ferait payer au client des frais qui n'existeront jamais.
    //
    // On calcule donc le frais réel sur le total encaissé par boutique, et on
    // le porte sur UNE commande — celle qui porte déjà la course quand il y en
    // a une. Les autres valent 0. L'écart avec ce qui a été facturé revient à
    // la plateforme, exactement comme l'écart de zone.
    //
    // ⚠️ Groupé par `fastFoodId` SEUL, pas par `deliveryGroupKey` : le retrait
    // ne dépend ni de la zone, ni du créneau, ni du mode de livraison — c'est
    // le portefeuille de la boutique qui se vide, tous départs confondus.
    // Clé : `groupId + fastFoodId`. Un panier chez DEUX boutiques n'a qu'un
    // `groupId` mais vide DEUX portefeuilles — donc deux ponctions.
    const withdrawalKeyOf = order => `${order?.groupId ?? order?.id}|${order?.fastFoodId ?? ''}`;

    const netByKey = {};
    const orderByKey = {};
    for (const order of list) {
      if (!order?.fastFoodId) continue;
      const key = withdrawalKeyOf(order);
      const charged = toNumber(order.total);
      netByKey[key] = (netByKey[key] || 0) + (charged - feeIncludedIn(charged, pricing.paymentFeePercent));
      if (orderByKey[key] === undefined) orderByKey[key] = order;
    }
    const withdrawalByKey = {};
    // Qui porte le frais : la première commande rencontrée du groupe.
    const withdrawalHolder = {};
    // Id STOCKÉ, comme `deliveryGroupId` — la clé composée ne sort jamais.
    const withdrawalGroupIdByKey = {};
    for (const [key, net] of Object.entries(netByKey)) {
      withdrawalByKey[key] = withdrawalFee_(net, pricing, orderByKey[key]);
      withdrawalHolder[key] = orderByKey[key].id;
      withdrawalGroupIdByKey[key] = generateId();
    }

    for (const order of list) {
      // ⚠️ Une commande à emporter est réglée AUSSI : le user a bien payé le
      // supplément livraison (fondu dans le prix du plat depuis le home). Sans
      // course à verser, ce montant part intégralement en marge.
      // Seule la ligne `order_deliveries` est omise — il n'y a pas de course.
      const delivered = order.delivery?.status === true;

      const ffId = order.fastFoodId;
      // `null` en retrait : aucune course, donc aucun groupe.
      const groupKey = deliveryGroupKey(order);
      if (groupKey && !groupIdByKey[groupKey]) groupIdByKey[groupKey] = generateId();

      // Une seule course facturée par départ — sans objet si pas de livraison.
      const courseBilled = !!groupKey && !billedKeys.has(groupKey);
      if (groupKey) billedKeys.add(groupKey);

      const fastfood = await repos.fastfoods.getById(ffId);

      // L'offre ne vaut que pour la boutique concernée (ou partout si campagne
      // / bonus plateforme), et n'a aucun sens sans livraison.
      const applies = delivered && (!offer || offer.fastFoodId == null || offer.fastFoodId === ffId);
      const orderOffer = applies ? settled.offer : null;

      const amounts = splitDeliveryAmounts({
        fastfood,
        zone: order.delivery?.zone,
        // Un même lieu n'a pas le même prix en express et en périodique.
        deliveryType: order.delivery?.type,
        platformMargin: pricing.platformMargin,
        quantity: order.quantity,
        courseBilled,
        delivered,
        freeReason: orderOffer?.reason ?? null,
      });

      // `order.total` est déjà TTC : les frais y sont inclus, on les EXTRAIT.
      // On redescend la cascade dans l'ordre inverse de sa composition —
      // commission de l'agrégateur d'abord, frais de retrait ensuite.
      const itemsCharged = toNumber(order.total);
      const paymentFee = feeIncludedIn(itemsCharged, pricing.paymentFeePercent);
      const afterPaymentFee = itemsCharged - paymentFee;
      // Le retrait porte sur ce qui reste APRÈS la commission — et il est dû
      // UNE fois pour toute la boutique, pas une fois par commande.
      const withdrawalKey = withdrawalKeyOf(order);
      const holdsWithdrawal = withdrawalHolder[withdrawalKey] === order.id;
      const withdrawalFee = holdsWithdrawal ? toNumber(withdrawalByKey[withdrawalKey]) : 0;
      const net = Math.max(0, afterPaymentFee - withdrawalFee);
      const qty = Math.max(1, toNumber(order.quantity) || 1);
      const marginDue = toNumber(pricing.platformMargin) * qty;

      // ── Ce qui revient au fastfood ────────────────────────────────────────
      // Le fastfood touche son prix RÉEL, dans les deux régimes : on part des
      // prix bruts figés dans la commande (`rawPrice`). Il n'est JAMAIS le
      // résidu de la cascade, sinon tout prélèvement fait en amont sort de sa
      // poche alors qu'il n'a décidé d'aucun d'eux.
      //
      // ⚠️ La course est facturée au user EN PLUS du prix du plat
      // (`total = base + delivery.prix`), donc `itemsCharged` la contient et la
      // commission de l'agrégateur porte dessus aussi. Cette part de commission
      // n'appartient pas au marchand : elle revient à la MARGE, seule variable
      // d'ajustement. En résidu, le marchand la payait — 2000 devenait 1987.
      const platformDelivered = isPlatformDelivered(fastfood);
      const itemsReal = rawItemsOf(order);

      // Ce qui reste au livreur : le résidu de la cascade. Il porte l'arrondi
      // (à la baisse comme à la hausse) dans la limite fixée par
      // `driver_amortization_max`, appliquée au moment de composer le prix.
      // En régime fastfood, la course est due au tarif de la zone, sans
      // amortissement — le champ trace alors ce qui est versé.
      // ⚠️ PLAFONNÉ au tarif de la zone. Le livreur ABSORBE la baisse quand on
      // arrondit vers le bas (dans la limite de `driver_amortization_max`),
      // mais il n'ENCAISSE jamais la hausse : un arrondi vers le haut est un
      // surplus payé par le client, il revient à la plateforme.
      //
      // Sans ce plafond, un plat à 3500 arrondi de 4110 à 4500 versait 619 F au
      // livreur pour une course qui en vaut 250 — la plateforme payait l'écart.
      const driverAmount = platformDelivered ? Math.min(amounts.realPrice, Math.max(0, net - itemsReal - marginDue)) : amounts.courseBilled ? amounts.realPrice : 0;

      // ── 1. Le règlement : une ligne par commande, TOUJOURS ────────────────
      try {
        const settlement = await repos.orderSettlements.create({
          orderId: order.id,
          userId: order.userId,
          fastFoodId: ffId,
          groupId: order.groupId ?? null,
          itemsReal,
          itemsCharged,
          paymentFee,
          withdrawalFee,
          withdrawalGroupId: withdrawalGroupIdByKey[withdrawalKey] ?? null,
          withdrawalBilled: holdsWithdrawal,
          driverAmount,
          // La MARGE est le résidu, dans les deux régimes : tout ce qui n'est ni
          // le fastfood, ni la course, ni les frais. Elle absorbe donc l'arrondi
          // vers le haut comme la commission prise sur la course.
          platformMargin: Math.max(0, net - itemsReal - driverAmount),
          delivered,
        });
        settled.settlements.push(settlement);
      } catch (err) {
        console.error(`settleDelivery: règlement non enregistré pour ${order.id} —`, err.message);
      }

      // ── 2. La course : seulement si la commande est livrée ────────────────
      if (!delivered) continue;

      try {
        const row = await repos.orderDeliveries.create({
          orderId: order.id,
          userId: order.userId,
          fastFoodId: ffId,
          deliveryGroupId: groupIdByKey[groupKey],
          zone: amounts.zone,
          realPrice: amounts.realPrice,
          chargedPrice: amounts.chargedPrice,
          platformMargin: amounts.platformMargin,
          courseBilled: amounts.courseBilled,
          freeReason: amounts.freeReason,
          coveredBy: orderOffer?.coveredBy ?? null,
          bonusId: orderOffer?.bonusId ?? null,
          bonusCode: orderOffer?.bonusCode ?? null,
        });
        settled.deliveries.push(row);
      } catch (err) {
        console.error(`settleDelivery: course non enregistrée pour ${order.id} —`, err.message);
      }
    }

    return settled;
  } catch (error) {
    console.error('settleDelivery: règlement échoué (commandes conservées) —', error.message);
    return settled;
  }
};
