// ============================================================================
// updateOrders.service — Façade vers l'orchestrateur
// ============================================================================
// State machine des commandes :
//   pendingToBuy → pending → processing → finished → delivering → delivered
//   (+ cancelByUser, cancelByFastFood comme transitions explicites)
//
// Logique conservée à l'identique :
//   - Transitions autoritaires basées sur le status DB (pas celui du client)
//   - Stock décrémenté à pendingToBuy → pending
//   - Rank assigné quand entrée en file (pending/processing)
//   - Rank/clientId/periodKey supprimés en sortie de file ou à 'finished'
//   - Reindex queue après chaque sortie de file
//   - Emissions socket + notifications push pour les transitions
// ============================================================================

const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { toMerchantView, toMerchantViewOne } = require('./toMerchantView');
const { creditDriverForOrder } = require('../transaction/creditDriver.service');
const { validateOrder } = require('../../utils/validator/validateOrder');
const { getFastFoodService } = require('../fastfood/getFastFood');
const { assignRank, reindexQueue } = require('./rankQueue.service');
const { notifyOrderEvent } = require('../notification/helpers/notifyOrderEvent');
const { shopSender } = require('../notification/helpers/shopSender');
const { reliableEmit } = require('../../utils/reliableEmit');
const { settleDeliveryService } = require('./settleDelivery.service');
const { enrichMenuForClient } = require('../menu/enrichMenuForClient');
const { generateId } = require('../../repositories/idGen');
const { cancelRefusal, cancelPaidOrder } = require('./orderCancel.service');
const { notifyNewOrders } = require('../whatsapp/merchantOrders.service');
const { requiresCancelRequest, requestCancel, cancelRequestOnTransition } = require('./cancelRequest.service');

const buildTransitionNotif = ({ prevStatus, newStatus, order, merchantUserId }) => {
  const menuName = order.menu?.name || order.menu?.titre || 'Menu';
  const qty = order.quantity || 1;
  const total = order.total || 0;
  const bodyBase = `${menuName} x${qty} — ${total} FCFA`;

  if (prevStatus === 'pendingToBuy' && newStatus === 'pending' && merchantUserId) {
    return { targetUserId: merchantUserId, type: 'order_new', title: 'Nouvelle commande', body: bodyBase, orderId: order.id, route: '/(tabs)/boutique' };
  }
  if (prevStatus === 'pending' && newStatus === 'processing') {
    return { targetUserId: order.userId, type: 'order_status', title: 'Commande acceptée', body: bodyBase, orderId: order.id, route: '/(tabs)/cart?section=active' };
  }
  if (prevStatus === 'processing' && newStatus === 'finished') {
    return { targetUserId: order.userId, type: 'order_status', title: 'Commande prête', body: bodyBase, orderId: order.id, route: '/(tabs)/cart?section=finished' };
  }
  if (prevStatus === 'finished' && newStatus === 'delivering') {
    return { targetUserId: order.userId, type: 'order_delivering', title: 'En livraison', body: bodyBase, orderId: order.id, route: '/(tabs)/cart?section=finished' };
  }
  if (prevStatus === 'delivering' && newStatus === 'delivered') {
    return { targetUserId: order.userId, type: 'order_status', title: 'Livrée', body: bodyBase, orderId: order.id, route: '/(tabs)/cart?section=finished' };
  }
  if (newStatus === 'cancelByUser' && merchantUserId) {
    return { targetUserId: merchantUserId, type: 'order_cancel_by_user', title: 'Commande annulée par le client', body: bodyBase, orderId: order.id, route: '/(tabs)/notifications' };
  }
  if (newStatus === 'cancelByFastFood') {
    return { targetUserId: order.userId, type: 'order_cancel_by_merchant', title: 'Commande annulée par le resto', body: bodyBase, orderId: order.id, route: '/(tabs)/notifications' };
  }
  return null;
};

const isRankedStatus = s => s === 'pending' || s === 'processing';
const isCancelStatus = s => s === 'cancelByUser' || s === 'cancelByFastFood';

/**
 * @param {Array|Object} orders
 * @param {string} userId
 * @param {Object} [payment] `{ aggregator, network }` du paiement MobileWallet
 *   qui règle le panier — fixe le barème de frais extrait au règlement.
 * @param {Object} [opts] `{ fromCancelRequest }` : annulation acceptée par le marchand
 *   WhatsApp (cancelRequest.service) — pas de nouvelle demande, demande `accepted`.
 *   `{ expectedStatus }` : avance seulement depuis ce statut (sinon conflit, rien écrit).
 *   `{ viaDeliveryCode }` : posé par confirmDelivery seul ; boutique WhatsApp, delivering ->
 *   delivered refusé sans lui.
 *   Une avance pas à pas (agent IA, livreur WhatsApp) ne saute ainsi jamais une étape
 *   quand deux actions se croisent (ex. delivering -> delivered sans QR).
 */
exports.updateOrders = async (orders, userId, payment = null, opts = {}) => {
  try {
    const io = getIO();

    const removedOrders = [];
    const updates = Array.isArray(orders) ? orders : [orders];

    console.info(`[updateOrders] ═══ ${updates.length} cmd · userId=${userId} ═══`);
    const groupedByFastFood = {};
    const results = [];
    // Boutique WhatsApp : annulations client converties en demandes (cancelRequest.service).
    const cancelRequested = [];
    // Statut changé entre la lecture et l'écriture (action concurrente) : rien écrit.
    const conflicts = [];
    const transitions = [];
    const reindexOps = [];

    for (const updateData of updates) {
      const errors = validateOrder(updateData, false, false);
      if (errors && errors.length > 0) {
        const formattedErrors = errors.map(err => `${err.field}: ${err.message}`).join(', ');
        console.error(`[updateOrders] ❌ ABANDON validation id=${updateData.id || '?'} — ${formattedErrors}`);
        return {
          success: false,
          message: `Erreur de validation pour la commande ${updateData.id || 'inconnue'}: ${formattedErrors}`,
          data: null,
        };
      }

      const { id, status, fastFoodId } = updateData;
      if (!id) {
        console.error('[updateOrders] ❌ ABANDON — ID de commande manquant');
        return { success: false, message: 'ID de commande manquant pour une mise à jour.', data: null };
      }
      if (!userId) {
        console.error(`[updateOrders] ❌ ABANDON id=${id} — userId manquant`);
        return { success: false, message: 'userId manquant pour une mise à jour.', data: null };
      }
      if (!fastFoodId) {
        console.error(`[updateOrders] ❌ ABANDON id=${id} — fastFoodId manquant`);
        return { success: false, message: 'fastFoodId manquant pour une mise à jour.', data: null };
      }

      const prevData = await repos.orders.getById(id);
      if (!prevData) {
        console.error(`[updateOrders] ❌ ABANDON id=${id} — commande introuvable en DB`);
        return { success: false, message: `Commande non trouvée pour l'ID ${id}`, data: null };
      }

      const prevStatus = prevData.status;
      const prevRank = prevData.rank;
      if (opts.expectedStatus && prevStatus !== opts.expectedStatus) {
        console.error(`[updateOrders] ❌ CONFLIT id=${id} — statut ${prevStatus} au lieu de ${opts.expectedStatus}, rien écrit`);
        conflicts.push({ id, status });
        continue;
      }

      // Toute boutique : le client ne peut pas annuler seul une commande payée en
      // attente, il le DEMANDE au marchand (WhatsApp ou app).
      if (status === 'cancelByUser' && prevStatus === 'pending' && !opts.fromCancelRequest) {
        const shop = await repos.fastfoods.getById(prevData.fastFoodId);
        if (await requiresCancelRequest(shop)) {
          const r = await requestCancel(prevData, shop);
          if (!r.ok) return { success: false, message: r.message, data: null };
          cancelRequested.push(r.order);
          continue;
        }
      }
      const deliveryDate = prevData.delivery?.date || new Date().toISOString().split('T')[0];

      // Transition autoritaire (état réel en DB)
      let newStatus;
      if (isCancelStatus(status)) {
        // Commande payée : annulable seulement avant acceptation (client) ou
        // avant le départ en livraison (restaurant). Déjà annulée : refus.
        const refusal = isCancelStatus(prevStatus) ? 'Cette commande est déjà annulée.' : cancelRefusal(prevStatus, status);
        if (refusal) {
          console.error(`[updateOrders] ❌ ABANDON id=${id} — annulation refusée (${prevStatus} → ${status})`);
          return { success: false, message: refusal, data: null };
        }
        newStatus = status;
      } else {
        switch (prevStatus) {
          case 'pendingToBuy':
            newStatus = 'pending';
            break;
          case 'pending':
            newStatus = 'processing';
            break;
          case 'processing':
            newStatus = 'finished';
            break;
          case 'finished':
            newStatus = 'delivering';
            break;
          case 'delivering':
            newStatus = 'delivered';
            break;
          default:
            newStatus = prevStatus;
        }
      }

      // Boutique WhatsApp : « livrée » vient SEULEMENT du QR du client (confirmDelivery, qui
      // vérifie que c'est bien celui qui livre et verse la part). Bouton d'avance de l'app,
      // livreur ou marchand : refusé (décision du 16/11/2026). Boutiques de l'app : inchangé.
      if (prevStatus === 'delivering' && newStatus === 'delivered' && !opts.viaDeliveryCode) {
        const shop = await repos.fastfoods.getById(prevData.fastFoodId);
        if (shop?.whatsappOrders === true) {
          console.error(`[updateOrders] ❌ ABANDON id=${id} — boutique WhatsApp : « livrée » seulement par le QR du client`);
          return { success: false, message: 'Livraison à valider en scannant le QR code du client.', data: null };
        }
      }

      console.info(`[updateOrders] id=${id} transition ${prevStatus} → ${newStatus}${prevStatus === newStatus ? ' (INCHANGÉ)' : ''} · fastFoodId=${fastFoodId} · statusDemandé=${status || '∅'}`);

      const setData = {
        ...updateData,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      };
      const fieldsToDelete = [];
      // Demande d'annulation en attente : réglée par la transition (acceptée, refusée, close).
      const cancelRequest = cancelRequestOnTransition(prevData, newStatus, opts);
      if (cancelRequest) setData.cancelRequest = cancelRequest;
      let stockTaken = null;

      // 1) Sortie de file : reindex à scheduler + clear rank
      if (isRankedStatus(prevStatus) && prevStatus !== newStatus && typeof prevRank === 'number') {
        reindexOps.push({ fastFoodId, deliveryDate, status: prevStatus, removedRank: prevRank });
        fieldsToDelete.push('rank');
      }

      // 2) Cleanup tracking fields sur 'finished'
      if (newStatus === 'finished') {
        if (Object.prototype.hasOwnProperty.call(prevData, 'clientId')) fieldsToDelete.push('clientId');
        if (Object.prototype.hasOwnProperty.call(prevData, 'periodKey')) fieldsToDelete.push('periodKey');
        if (prevData.clientId || prevData.periodKey) {
          removedOrders.push({
            orderId: id,
            clientId: prevData.clientId || null,
            periodKey: prevData.periodKey || null,
          });
        }
      }

      // 2b) Stock check à pendingToBuy → pending
      if (prevStatus === 'pendingToBuy' && newStatus === 'pending') {
        const menuId = prevData.menu?.id;
        const qty = Number(updateData.quantity ?? prevData.quantity) || 1;
        if (menuId) {
          const menu = await repos.menus.getById(menuId);
          if (menu && typeof menu.stock === 'number') {
            if (menu.stock < qty) {
              console.error(`[updateOrders] ❌ ABANDON id=${id} — stock insuffisant menu=${menuId} (dispo=${menu.stock}, demandé=${qty}) → tout le panier reste en pendingToBuy`);
              return {
                success: false,
                message: `Stock insuffisant pour "${menu.name || menu.titre || 'ce menu'}". Stock disponible : ${menu.stock}`,
                data: null,
              };
            }
            const newStock = menu.stock - qty;
            const updatedMenu = await repos.menus.updateStock(menuId, newStock);
            stockTaken = { menuId, qty };
            // Broadcast CLIENT : prix AFFICHÉ (livraison + marge + frais), pas le brut.
            const clientMenu = await enrichMenuForClient(updatedMenu);
            io.emit('globalMenuUpdated', { message: 'Stock mis à jour', menuId, menu: clientMenu });
          }
        }
      }

      // 3) Entrée dans une file rangée : assigner rank atomiquement
      if (isRankedStatus(newStatus)) {
        // rank sera assigné par assignRank, on ne le met pas dans setData
        delete setData.rank;
        if (fieldsToDelete.length > 0) setData.__delete = fieldsToDelete;
      } else if (fieldsToDelete.length > 0) setData.__delete = fieldsToDelete;
      // Verrou optimiste : écrit seulement si le statut est encore celui lu plus haut.
      // Ex. le client annule pendant que le marchand accepte : la seconde action échoue.
      const written = await repos.orders.update(id, setData, { expectedStatus: prevStatus });
      if (!written) {
        console.error(`[updateOrders] ❌ CONFLIT id=${id} — statut changé depuis la lecture (${prevStatus}), rien écrit`);
        if (stockTaken) {
          const m = await repos.menus.getById(stockTaken.menuId);
          if (m && typeof m.stock === 'number') await repos.menus.updateStock(stockTaken.menuId, m.stock + stockTaken.qty);
        }
        conflicts.push({ id, status });
        continue;
      }
      if (isRankedStatus(newStatus)) await assignRank({ fastFoodId, deliveryDate, status: newStatus, orderRef: id });

      const updatedOrder = await repos.orders.getById(id);
      results.push(updatedOrder);

      if (prevStatus !== newStatus) {
        transitions.push({ prevStatus, newStatus, order: updatedOrder, fastFoodId });
      }

      if (!groupedByFastFood[fastFoodId]) groupedByFastFood[fastFoodId] = [];
      groupedByFastFood[fastFoodId].push(updatedOrder);
    }

    // ── Course du livreur PLATEFORME : versée à la LIVRAISON ────────────────
    // Pas au paiement : une course annulée en chemin ne se paie pas. Le montant
    // dû est `order_settlements.driver_amount` — nul quand la boutique livre
    // elle-même, ou quand la commande partage la course d'une autre du panier.
    const becameDelivered = transitions.filter(t => t.newStatus === 'delivered').map(t => t.order);
    for (const order of becameDelivered) {
      await creditDriverForOrder({ order }).catch(e => console.error('[updateOrders] course livreur non versée —', e.message));
    }

    // ── Annulation d'une commande PAYÉE : remboursement + reprise marchand ──
    // (un retrait du panier, depuis `pendingToBuy`, n'a rien coûté).
    for (const t of transitions) {
      if (!isCancelStatus(t.newStatus) || t.prevStatus === 'pendingToBuy') continue;
      await cancelPaidOrder(t.order, t.newStatus);
    }

    // ── Règlement livraison : le panier vient d'être payé ────────────────────
    // `updates` est le panier ENTIER, reçu en un seul appel. C'est le seul
    // moment où le backend voit ces commandes comme un tout — donc le seul où il
    // peut ne compter qu'UNE course par boutique et ne consommer le bonus
    // qu'une fois. Déclenché sur la transition vers `pending` uniquement : avant,
    // le panier peut encore être vidé.
    const becamePending = transitions.filter(t => t.prevStatus === 'pendingToBuy' && t.newStatus === 'pending').map(t => t.order);

    console.info(`[updateOrders] ${becamePending.length}/${updates.length} cmd pendingToBuy → pending (déclenche groupId + settleDelivery)`);

    if (becamePending.length > 0) {
      // Panier de plusieurs plats : un `groupId` commun permet de les réafficher
      // ensemble côté marchand comme côté client — un seul client, une seule
      // livraison, même si ce sont techniquement plusieurs commandes.
      // Inutile sur une commande seule : on ne pollue pas la donnée.
      if (becamePending.length > 1) {
        const groupId = generateId();
        console.info(`[updateOrders] groupId=${groupId} appliqué à ${becamePending.length} cmd du même panier`);
        for (const order of becamePending) {
          try {
            await repos.orders.update(order.id, { groupId });
            order.groupId = groupId;
          } catch (e) {
            console.warn(`[updateOrders] groupId non appliqué à ${order.id}:`, e.message);
          }
        }
      }

      // Le bonus voyage avec le panier, pas avec un plat en particulier.
      const bonusCode = updates.find(o => o && o.bonusCode)?.bonusCode;
      const settled = await settleDeliveryService({ orders: becamePending, bonusCode, payment });
      console.info(`[updateOrders] settleDelivery terminé · bonusCode=${bonusCode || '∅'} · offre=${settled?.offer ? 'appliquée' : '∅'} → order_settlements créés pour ${becamePending.length} cmd`);
      // Le front reçoit l'offre appliquée sans avoir à re-GET.
      if (settled.offer) {
        for (const order of becamePending) order.deliveryOffer = settled.offer;
      }
    }

    // Groupage : un départ vient d'être payé, de partir ou d'être annulé →
    // les paniers de la boutique sont recalculés (course offerte ou remise).
    const regroupShops = [...new Set(transitions.filter(t => t.newStatus === 'pending' || t.newStatus === 'delivering' || isCancelStatus(t.newStatus)).map(t => t.fastFoodId))];
    if (regroupShops.length) require('./repriceCart.service').repriceCartsForShops(regroupShops);

    let message = updates.some(o => o.status === 'cancelByFastFood') ? 'Commande annulée avec succès' : updates.some(o => o.status === 'cancelByUser') ? 'Commande retirée du panier avec succès' : 'Commande(s) mise(s) à jour avec succès';

    let hasRemoval = false;
    let hasNewDelivery = false;

    for (const fastFoodId in groupedByFastFood) {
      try {
        const fastfood = await getFastFoodService(fastFoodId);
        if (!fastfood.userId) continue;

        const pendingOrders = [];
        groupedByFastFood[fastFoodId].forEach(order => {
          if (order.status === 'pending') pendingOrders.push(order);
        });

        if (pendingOrders.length > 0) {
          console.info(`[updateOrders] → émission 'newFastFoodOrders' à marchand=${fastfood.userId} (fastFoodId=${fastFoodId}) · ${pendingOrders.length} cmd: ${pendingOrders.map(o => o.id).join(', ')}`);
          toMerchantView(pendingOrders)
            .then(merchantOrders => {
              notifyNewOrders(fastFoodId, merchantOrders); // boutique WhatsApp : message au marchand
              return reliableEmit(io, fastfood.userId, 'newFastFoodOrders', {
                message: pendingOrders.length > 1 ? 'Nouvelles commandes' : 'Nouvelle commande',
                data: merchantOrders,
              });
            })
            .catch(e => console.warn('[updateOrders] reliableEmit newFastFoodOrders:', e.message));
          pendingOrders.forEach(order => {
            reliableEmit(io, order.userId, 'userOrderUpdated', { data: order }).catch(e => console.warn('[updateOrders] reliableEmit userOrderUpdated:', e.message));
          });
        }

        groupedByFastFood[fastFoodId].forEach(order => {
          if (fastfood.userId === userId && order.periodKey !== undefined && order.status === 'delivering') {
            io.to(order.userId).emit('newPeriodKeyDelivering', { periodKey: order.periodKey });
            io.to(fastfood.userId).emit('newPeriodKeyDelivering', { periodKey: order.periodKey });
            hasNewDelivery = true;
          }
          if (fastfood.userId === userId && removedOrders.length > 0 && order.status === 'finished') {
            const r = removedOrders.find(x => x.orderId === order.id);
            if (r && r.periodKey) {
              io.to(order.userId).emit('removePeriodKeyDelivering', { periodKey: r.periodKey });
              io.to(fastfood.userId).emit('removePeriodKeyDelivering', { periodKey: r.periodKey });
              hasRemoval = true;
            }
          }
          if (fastfood.userId === userId && order.clientId !== undefined && order.status === 'delivering') {
            io.to(order.userId).emit('newClientIdDelivering', { clientId: order.clientId });
            io.to(fastfood.userId).emit('newClientIdDelivering', { clientId: order.clientId });
            hasNewDelivery = true;
          }
          if (fastfood.userId === userId && removedOrders.length > 0 && order.status === 'finished') {
            const r = removedOrders.find(x => x.orderId === order.id);
            if (r && r.clientId) {
              io.to(order.userId).emit('removeClientIdDelivering', { clientId: r.clientId });
              io.to(fastfood.userId).emit('removeClientIdDelivering', { clientId: r.clientId });
              hasRemoval = true;
            }
          }
          if (order.status !== 'pending') {
            reliableEmit(io, order.userId, 'userOrderUpdated', { data: order }).catch(e => console.warn('[updateOrders] reliableEmit userOrderUpdated:', e.message));
            toMerchantViewOne(order)
              .then(view => reliableEmit(io, fastfood.userId, 'fastFoodOrderUpdated', { data: view }))
              .catch(e => console.warn('[updateOrders] reliableEmit fastFoodOrderUpdated:', e.message));
          }
        });

        // Notifications de transitions. Vers le client, c'est la boutique qui
        // parle : son logo en avatar (shopSender). Vers le marchand, l'icône de l'app.
        const ffTransitions = transitions.filter(t => t.fastFoodId === fastFoodId);
        const sender = shopSender(fastfood);
        for (const t of ffTransitions) {
          const notif = buildTransitionNotif({
            prevStatus: t.prevStatus,
            newStatus: t.newStatus,
            order: t.order,
            merchantUserId: fastfood.userId,
          });
          if (notif) {
            const toClient = notif.targetUserId !== fastfood.userId;
            notifyOrderEvent({ ...notif, sender: toClient ? sender : null, audience: toClient ? 'client' : 'merchant' }).catch(e => console.warn('[updateOrders] notify error:', e.message));
          }
        }

        // Reindex queue scheduled ops
        const opsForFF = reindexOps.filter(op => op.fastFoodId === fastFoodId);
        for (const op of opsForFF) {
          await reindexQueue({
            fastFoodId: op.fastFoodId,
            deliveryDate: op.deliveryDate,
            status: op.status,
            removedRank: op.removedRank,
            fastFoodUserId: fastfood.userId,
          });
        }
      } catch (err) {
        console.error(`Erreur lors de l'émission pour fastFoodId ${fastFoodId}:`, err.message);
        continue;
      }
    }

    if (results.some(o => o.status === 'finished') && hasRemoval) {
      message = 'Livraison annulée avec succès';
    } else if (hasNewDelivery) {
      message = 'Nouvelle livraison lancée avec succès';
    }

    if (!results.length && conflicts.length && !cancelRequested.length) {
      const fresh = await repos.orders.getById(conflicts[0].id);
      const asked = conflicts[0].status;
      const refusal = isCancelStatus(asked) && fresh ? (isCancelStatus(fresh.status) ? 'Cette commande est déjà annulée.' : cancelRefusal(fresh.status, asked)) : null;
      return { success: false, message: refusal || 'La commande vient de changer de statut : rechargez et réessayez.', data: null };
    }
    if (cancelRequested.length && !results.length) message = "Demande d'annulation envoyée au restaurant. Vous serez prévenu de sa réponse.";

    console.info(`[updateOrders] ✓ terminé — ${results.map(o => `${o.id}:${o.status}`).join(' | ')}${cancelRequested.length ? ` · demandes d'annulation : ${cancelRequested.map(o => o.id).join(', ')}` : ''}`);

    return { success: true, message, data: results, ...(cancelRequested.length ? { cancelRequested } : {}) };
  } catch (error) {
    console.error(`[updateOrders] ❌ EXCEPTION: ${error.message}`, error.stack);
    return {
      success: false,
      message: error.message || 'Erreur lors de la mise à jour des commandes',
      data: null,
    };
  }
};
