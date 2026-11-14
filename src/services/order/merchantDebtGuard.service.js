// ============================================================================
// merchantDebtGuard — Boutique en dette de remboursement : commandes refusées
// ============================================================================
// Un remboursement d'annulation reprend au marchand ce qu'il avait reçu
// (`merchant_debit`). Si son solde passe en NÉGATIF à cause d'une telle reprise,
// la boutique ne reçoit plus de commande tant que la dette n'est pas comblée.
// Ce n'est pas un seuil de montant : la cause du négatif compte. Seule cause
// de blocage aujourd'hui : un remboursement de commande (le retrait ne peut
// pas dépasser le solde, donc un négatif vient forcément d'une reprise).
// Chaque tentative refusée envoie un push au marchand avec la raison.
// ============================================================================
const repos = require('../../repositories');
const { notifyOrderEvent } = require('../notification/helpers/notifyOrderEvent');

const DEBT_MESSAGE = 'Cette boutique ne prend pas de commande pour le moment. Choisis une autre boutique.';

/** Dette de remboursement de la boutique (montant > 0), ou 0. */
async function refundDebtOf(shop) {
  if (!shop?.userId) return 0;
  const { balance } = await repos.transactions.getMerchantBalance(shop.userId);
  if (!(balance < 0)) return 0;
  return (await repos.transactions.hasMerchantDebit(shop.userId)) ? -balance : 0;
}

/**
 * Refus si une boutique du lot est en dette de remboursement, sinon null.
 * @param {Array} orders
 * @param {(id:string)=>Promise<Object>} shopOf
 */
async function debtRefusal(orders, shopOf) {
  const ids = [...new Set(orders.map(o => o?.fastFoodId).filter(Boolean).map(String))];
  for (const id of ids) {
    const shop = await shopOf(id);
    const debt = await refundDebtOf(shop);
    if (debt <= 0) continue;
    await notifyOrderEvent({
      targetUserId: shop.userId,
      type: 'merchant_debt',
      title: 'Commande refusée : solde négatif',
      body: `Un client a voulu commander, mais votre solde est négatif de ${debt} F à cause du remboursement d'une commande annulée. Vous ne recevez plus de commande tant que ce montant n'est pas réglé. Contactez l'administrateur Yaammoo.`,
      route: '',
      audience: 'merchant',
    }).catch(e => console.warn(`[merchantDebtGuard] push marchand : ${e.message}`));
    return { code: 'merchant_debt', message: DEBT_MESSAGE, detail: `boutique ${id} : dette de remboursement ${debt} F` };
  }
  return null;
}

module.exports = { debtRefusal, refundDebtOf };
