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

`net = gross − ceil(gross × DIGIKUNTZ_FEE) − YAAMMOO_FLAT_FEE` (clampé ≥ 0).

| Variable | Valeur | Rôle |
|---|---|---|
| `DIGIKUNTZ_FEE` | `0.05` | commission Digikuntz (5%) |
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
| POST | `/wallet/withdraw` | demande de retrait `{ amount, phone, network, receiverName?, narration? }` |

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
