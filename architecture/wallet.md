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

- **Crédit** : `type='merchant_credit'`, `userId = userId du marchand`, `amount = net`.
  Extra : `fastFoodId`, `relatedOrderId`, `grossAmount`, `mwCommission`, `yaammooFee`.
- **Retrait** : `type='withdrawal'`, `userId = marchand`, `amount = montant retiré`
  (compté en négatif dans le solde). Extra : `withdrawalId`, `status`, `phone`, `network`.

**Solde dérivé** : `balance = Σ(merchant_credit.amount) − Σ(withdrawal.amount)`
(`repos.transactions.getMerchantBalance(userId)`).

Table `withdrawals` (migration `004_withdrawals.sql`) — trace les demandes de retrait :
`id, user_id, fastfood_id, amount, phone, network, status (pending|completed|failed),
mw_payout_id, failure_reason`.

---

## Commissions (env)

`net = gross − round(gross × MOBILEWALLET_COMMISSION_RATE) − YAAMMOO_FLAT_FEE` (clampé ≥ 0).

| Variable | Valeur | Rôle |
|---|---|---|
| `MOBILEWALLET_COMMISSION_RATE` | `0.05` | commission MobileWallet (5%) |
| `YAAMMOO_FLAT_FEE` | `100` | frais fixe yaammoo (FCFA) par commande |

Helper : [src/utils/commission.js](../src/utils/commission.js) → `computeNet(gross)`.

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

| Méthode | Endpoint | Rôle |
|---|---|---|
| GET | `/wallet/balance` | `{ balance, totalEarned, totalWithdrawn }` du marchand (`req.user.uid`) |
| GET | `/wallet/history` | payin (gains) + payout (retraits), filtrable, triés DESC |
| GET | `/wallet/stats` | totaux payin/payout/net agrégés par jour/semaine/mois |
| POST | `/wallet/withdraw` | demande de retrait `{ amount, phone, network }` |

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
  "series": [
    { "period": "2026-06-18", "payin": 4650, "payout": 0, "net": 4650, "count": 1 }
  ]
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

1. valide montant/phone/network ;
2. recalcule le solde → **400 `insufficient_balance`** si `amount > balance` ;
3. insère `withdrawals` (`status='pending'`) ;
4. crée la transaction `withdrawal` (débite le solde dérivé) ;
5. **STUB MobileWallet** : `// TODO` appel endpoint payout (fourni plus tard). Le retrait
   reste `pending`. Au branchement : `updateStatus(completed|failed)` (+ remboursement si échec) ;
6. émet socket `wallet.withdrawal`.

---

## TODO

- [ ] Brancher l'endpoint MobileWallet de retrait (payout) — fourni plus tard.
- [ ] Remboursement automatique (`merchant_credit` compensatoire) si le payout échoue.
- [ ] Remboursement client : crédit marchand inverse à prévoir si une commande payée est annulée.
