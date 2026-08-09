# Feature — Portefeuille marchand (Wallet & Retraits)

## Rôle

À chaque commande payée, le marchand est **crédité** du montant net (après commissions).
Il peut consulter son **solde** et son **historique**, et **demander un retrait** qui débite
son portefeuille.

> **Solde jamais figé** : il est **calculé** depuis la table `transactions` (comme `isMarchand`
> est recalculé). Pas de colonne `balance`. Source de vérité unique, pas de désync possible.

---

## Modèle de données

Réutilise la table `transactions` (`extra_data` JSONB absorbe les champs hors colonnes) :

- **Crédit** : `type='merchant_credit'`, `userId = userId du marchand`,
  `amount = total de l'item` (aucune retenue — voir ci-dessous).
  Extra : `fastFoodId`, `relatedOrderId`, `grossAmount`.
- **Retrait** : `type='withdrawal'`, `userId = marchand`, `amount = montant retiré`
  (compté en négatif dans le solde). Extra : `withdrawalId`, `status`, `phone`, `network`.

- **Course livreur** : `type='driver_credit'`, `userId = uid du livreur`,
  `amount = order_settlements.driver_amount`. Versée depuis le portefeuille
  PLATEFORME, uniquement pour les boutiques en `deliveryBy = 'platform'`, et
  **à la livraison** — une course annulée en chemin ne se paie pas.
  Idempotente (`repos.transactions.findDriverCredit`) : une transition
  `delivered` rejouée ne verse pas deux fois. Voir
  [creditDriver.service.js](../src/services/transaction/creditDriver.service.js).

**Solde dérivé** : `balance = Σ(merchant_credit.amount) + Σ(driver_credit.amount) − Σ(withdrawal.amount)`
(`repos.transactions.getMerchantBalance(userId)`).

Table `withdrawals` (migration `004_withdrawals.sql`) — trace les demandes de retrait :
`id, user_id, fastfood_id, amount, phone, network, status (pending|completed|failed),
mw_payout_id, failure_reason`.

---

## Commissions — une seule ponction

**Le crédit marchand ne subit AUCUNE retenue.** La commission du prestataire de
paiement est prélevée **une seule fois**, en amont, sur le montant encaissé :
`feeIncludedIn(itemsCharged, payment_fee_percent)` dans
[settleDelivery.service.js](../src/services/order/settleDelivery.service.js).
Ce taux vit dans la table `settings` (clé `payment_fee_percent`, défaut 5),
pilotable à chaud — c'est le **même** taux qui compose le prix affiché, donc une
source de vérité unique.

Le bénéfice yaammoo est porté par la **marge plateforme** et l'**écart de zone**
(cf. [pricing.md](./pricing.md)) — pas par un frais retenu au marchand.

> ⚠️ Le crédit marchand vaut `order_settlements.items_real`, **pas** `order.total`.
> Ce dernier est le prix CLIENT : il porte la livraison, la marge et les frais,
> dont rien n'appartient au marchand. Le créditer entier gonflait son
> portefeuille d'un argent destiné à partir ailleurs.

Les **frais de retrait** (MTN / Orange) sont, eux, fondus dans le prix affiché
en amont : voir [pricing-fees.md](./pricing-fees.md#les-frais-de-retrait-entrent-dans-le-prix).
La vue marchand renvoie `withdrawalFee` par commande — une **estimation** de ce
que coûtera la sortie de cet argent, le frais réel portant sur le montant
effectivement retiré (qui agrège plusieurs commandes).

> ⚠️ Auparavant `utils/commission.js` (`computeNet`) reprélevait 5 %
> (`DIGIKUNTZ_FEE`) **plus** un frais fixe (`YAAMMOO_FLAT_FEE`) sur le crédit
> marchand : la commission était donc comptée **deux fois**. Ce helper et ces
> variables d'env ont été supprimés.
>
> ⚠️ Le même helper servait aussi à calculer `afterMw`, le montant envoyé à
> MobileWallet à l'appel `/pay`. MobileWallet prélevant sa commission **dans** le
> montant, lui envoyer un montant déjà amputé de 5 % **sous-facturait le client**.
> On lui transmet désormais le TTC affiché tel quel.

---

## Crédit au paiement réussi

Dans [webhookMobilewallet.service.js](../src/services/transaction/webhookMobilewallet.service.js),
bloc `status === 'successful'` : après le traitement des items (update/create), une boucle
crédite **chaque item** via
[creditMerchant.service.js](../src/services/transaction/creditMerchant.service.js)
(`creditMerchantForItem`) :

- résout le marchand : `repos.fastfoods.getById(item.fastFoodId).userId` ;
- crée la transaction `merchant_credit` (net) ;
- émet socket `wallet.credited` vers le marchand (room = `userId`).

> **Idempotence** : le verdict global est protégé par `reserveSettlement` (un seul canal
> traite) → un seul crédit par commande. Échec partiel toléré (logué).

---

## Routes (`/wallet`, protégées `firebaseAuth`)

| Méthode | Endpoint           | Rôle                                                                       |
| ------- | ------------------ | -------------------------------------------------------------------------- |
| GET     | `/wallet/balance`  | `{ balance, totalEarned, totalWithdrawn }` du marchand (`req.user.uid`)    |
| GET     | `/wallet/history`  | payin (gains) + payout (retraits), filtrable, triés DESC                   |
| GET     | `/wallet/stats`    | totaux payin/payout/net agrégés par jour/semaine/mois                      |
| POST    | `/wallet/withdraw` | demande de retrait `{ amount, phone, network, receiverName?, narration? }` |

### `GET /wallet/history`

Chaque entrée porte un champ **`direction`** : `payin` (= `merchant_credit`) ou
`payout` (= `withdrawal`). Query params :

- `direction=payin|payout` — filtre par sens (sinon les deux) ;
- `period=today|week|month|all` — raccourci de période ;
- `from=<ISO>&to=<ISO>` — intervalle explicite (**prime sur `period`**).

### `GET /wallet/stats`

Agrégats pour graphiques/résumés. Query : `groupBy=day|week|month` (+ `period` ou `from/to`).

```json
{
  "groupBy": "day",
  "totals": { "payin": 14250, "payout": 100, "net": 14150 },
  "series": [{ "period": "2026-06-18", "payin": 4650, "payout": 0, "net": 4650, "count": 1 }]
}
```

Clés `period` : `YYYY-MM-DD` (day), `YYYY-Www` semaine ISO (week), `YYYY-MM` (month).
Helper : [src/utils/period.js](../src/utils/period.js) (`resolvePeriod`, `groupKey`).

Routes : [walletRoutes.js](../src/routes/walletRoutes.js) ·
Controller : [wallet.controller.js](../src/controllers/wallet/wallet.controller.js) ·
Service : [withdraw.service.js](../src/services/wallet/withdraw.service.js) ·
Repo : [withdrawals.repo.js](../src/repositories/supabase/withdrawals.repo.js) ·
Validateur : [validateWithdrawal.js](../src/utils/validator/validateWithdrawal.js).

### Flux retrait (`POST /wallet/withdraw`)

Body : `{ amount, phone, network, receiverName?, narration? }`.

> ⚠️ **Le débit n'a lieu QU'AU SUCCÈS du payout** (transaction `withdrawal` créée au verdict
> `successful`), jamais à la demande. Donc un retrait échoué/annulé laisse le solde intact.

1. valide montant/phone/network ;
2. recalcule le solde → **400 `insufficient_balance`** si `amount > balance` ;
3. **blocage doublon** : **409 `withdrawal_in_progress`** s'il existe déjà un retrait `pending` ;
4. **cooldown** : **429 `cooldown`** si moins de `WITHDRAWAL_COOLDOWN_HOURS` (env, défaut 24h)
   depuis le dernier retrait ;
5. `receiver_name` : `receiverName` du body → nom marchand (`users`) → `fastfood.name` ;
6. insère `withdrawals` (`status='pending'`) — **aucun débit** ;
7. appelle **MobileWallet `/payout`** ([mobilewalletService.payout](../src/services/transaction/mobilewalletService.js)),
   stocke `mw_payout_id`. Échec d'initiation (409/503/502) → `status='failed'` + erreur renvoyée ;
8. émet socket fiable `wallet.withdrawal` (`status='pending'`).

### Verdict du retrait (webhook + socket)

Même double canal que les paiements. [webhookMobilewallet.service](../src/services/transaction/webhookMobilewallet.service.js)
**route en tête** : si `transaction_id` correspond à un `withdrawals.mw_payout_id` →
[webhookPayout.service](../src/services/transaction/webhookPayout.service.js) :

- idempotence via `reserveSettlement` (table partagée) ;
- `successful` → crée la transaction `withdrawal` (**débit réel**) + `status='completed'` +
  socket `wallet.withdrawal` (`status='completed'`, `newBalance`) ;
- `failed`/`cancelled` → `status='failed'`, **aucun débit** + socket `wallet.withdrawal`
  (`status='failed'`).

Variables d'env : `WITHDRAWAL_COOLDOWN_HOURS`, `WITHDRAWAL_CURRENCY` (défaut `XAF`).

---

## TODO

- [ ] Réservation atomique du solde entre la demande et le verdict (aujourd'hui : blocage
      `pending` + cooldown suffisent en pratique, mais le solde n'est pas verrouillé).
- [ ] Remboursement client : crédit marchand inverse à prévoir si une commande payée est annulée.
