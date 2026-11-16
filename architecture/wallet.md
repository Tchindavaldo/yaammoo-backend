# Feature — Portefeuille marchand (Wallet & Retraits)

## Rôle

À chaque commande payée, le marchand est **crédité** du montant net (après commissions).
Il peut consulter son **solde** et son **historique**, et **demander un retrait** qui débite
son portefeuille.

> **Solde jamais figé** : il est **calculé** depuis la table `transactions` (comme `isMarchand`
> est recalculé). Pas de colonne `balance`. Source de vérité unique, pas de désync possible.

---

## Deux soldes : MTN et Orange (migration 064)

Chez pawaPay, MobileWallet tient un solde **par réseau**. Le portefeuille
yaammoo suit la même forme : chaque crédit est rattaché au **réseau qui a
encaissé le paiement** et à l'**agrégateur** utilisé.

- **Seuls les montants pawaPay** sont affichés et retirables
  (`WALLET_AGGREGATORS`, [paymentAggregator.js](../src/utils/paymentAggregator.js)).
  L'historique DigiKUNTZ (818 224 F au passage à pawaPay) est **conservé en
  base**, marqué `aggregator='digikuntz'`, jamais affiché ni retirable.
- **Aucun nom d'agrégateur** ne sort vers le front (mapper `transaction` et
  réponse de retrait le masquent).
- Réseaux en base : `'MTN' | 'ORANGEMONEY'` (forme `/payout` de MobileWallet),
  normalisés par [mobileNetwork.js](../src/utils/mobileNetwork.js).

## Modèle de données

Réutilise la table `transactions` (`extra_data` JSONB absorbe les champs hors colonnes).
Colonnes ajoutées par la migration 064 : `aggregator`, `network` (réseau du
solde touché), `mw_transaction_id`.

- **Crédit** : `type='merchant_credit'`, `userId = userId du marchand`,
  `amount = order_settlements.items_real` (aucune retenue — voir ci-dessous),
  `aggregator`/`network`/`mw_transaction_id` = ceux du paiement (`pending_payments`).
  Extra : `fastFoodId`, `relatedOrderId`, `grossAmount`, `clientUserId`.
  Sans paiement réel (build de test, Apple Review) : `aggregator = NULL`, hors portefeuille.
- **Retrait** : `type='withdrawal'`, `userId = marchand`, `amount = montant reçu + frais
  interréseau` (compté en négatif), `network = solde SOURCE débité`.
  Extra : `withdrawalId`, `status`, `phone`, `receivedAmount`, `fee`, `receiverNetwork`.
  > Les retraits antérieurs à la migration 064 portent `network` (réseau de
  > réception) dans `extra_data`.

- **Course livreur** : `type='driver_credit'`, `userId = uid du livreur`,
  `amount = order_settlements.driver_amount`. Versée depuis le portefeuille
  PLATEFORME, uniquement pour les boutiques en `deliveryBy = 'platform'`, et
  **à la livraison** — une course annulée en chemin ne se paie pas.
  Réseau/agrégateur relus sur le **crédit marchand** de la même commande
  (`repos.transactions.findMerchantCreditByOrder`).
  Idempotente (`repos.transactions.findDriverCredit`) : une transition
  `delivered` rejouée ne verse pas deux fois. Voir
  [creditDriver.service.js](../src/services/transaction/creditDriver.service.js).

- **Transfert de marge plateforme** : `type='platform_transfer'`, `userId = propriétaire
  de la boutique destinataire`, `amount` = montant versé, `network` = réseau de la
  marge prélevée, `aggregator = 'pawapay'`, `payBy='platform'`, `name='Crédit Yaammoo'`.
  Extra : `fastFoodId` (destinataire), `sourceFastFoodId`, `reason`, `adminUid`.
  Compté comme un crédit (solde, historique `payin`, stats). Voir
  [Transfert de marge plateforme](#transfert-de-marge-plateforme-admin).

**Solde dérivé** (`repos.transactions.getMerchantBalance(userId)`), agrégateurs du portefeuille seulement :

```
solde[réseau] = Σ(crédits sur ce réseau) − Σ(retraits débités de ce réseau)
balance       = mtn + orange
```

**Découpage de chaque solde** (`breakdown`, ajout additif R11 de `GET /wallet/balance`) :

```
breakdown[réseau] = { orders, fees, total }     total = orders + fees = solde[réseau]
crédit  : extra_data.kioskFee → fees, le reste → orders
retrait : extra_data.feesDebit → sort de fees, le reste → sort de orders
```

`kioskFee` = frais de retrait kiosque du règlement (`order_settlements.withdrawal_fee`).
Au retrait, les frais (kiosque + interréseau) sont pris d'abord sur `fees` ; si la
réserve ne suffit plus, le manque sort de `orders`.

Table `withdrawals` (migrations `004_withdrawals.sql`, `064`) — trace les demandes de retrait :
`id, user_id, fastfood_id, amount (reçu), phone, network (réception), source_network
(solde débité), fee (interréseau), aggregator, status (pending|completed|failed),
mw_payout_id, failure_reason, kind (wallet|platform|order), order_id` (migration 086,
versement automatique d'une commande).

---

## Commissions — une seule ponction

**Le crédit marchand ne subit AUCUNE retenue.** Les frais de paiement sont prélevés
**une seule fois**, en amont, sur le montant encaissé :
`paymentFeeOf(itemsCharged, pricing, { aggregator, network })` dans
[settleDelivery.service.js](../src/services/order/settleDelivery.service.js), au
barème de l'agrégateur ET du réseau qui ont réellement encaissé.
Barèmes en base (`settings_pricing`), pilotables à chaud — c'est le **même** barème
qui compose le prix affiché ([paymentFees.js](../src/services/pricing/paymentFees.js),
détail dans [pricing-fees.md](./pricing-fees.md)).

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
- crée la transaction `merchant_credit` (net), avec `aggregator`/`network` du paiement ;
- émet socket `wallet.credited` vers le marchand (room = `userId`), avec `network`
  (`MTN` | `ORANGEMONEY`) — **uniquement** si le crédit compte dans le portefeuille.

> **Montant crédité** (lu dans `order_settlements`) :
> `items_real` (plat + extras + boissons) + `withdrawal_fee` + `driver_amount`
> **si le marchand livre** (régime fastfood ; en régime plateforme la course va
> au livreur plateforme). Panier : règlement lu via `item.id`. Achat direct :
> via l'id de la commande créée au verdict (`orderId`). Règlement absent →
> **aucun crédit** (jamais le total client), alerte dans `app_errors`, à
> régulariser à la main. Voir [money-rules.md](./money-rules.md).

> **Idempotence** : le verdict global est protégé par `reserveSettlement` (un seul canal
> traite) → un seul crédit par commande. Échec partiel toléré (logué).

---

## Routes (`/wallet`, protégées `firebaseAuth`)

| Méthode | Endpoint                   | Rôle                                                                                      |
| ------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| GET     | `/wallet/balance`          | `{ balance, mtn, orange, totalEarned, totalWithdrawn }` (`req.user.uid`)                  |
| GET     | `/wallet/history`          | payin (gains) + payout (retraits), filtrable, triés DESC                                  |
| GET     | `/wallet/stats`            | totaux payin/payout/net agrégés par jour/semaine/mois                                     |
| GET     | `/wallet/withdraw/quote`   | frais d'un retrait avant confirmation `?amount&network&sourceNetwork`                     |
| POST    | `/wallet/operator/predict` | réseau d'un numéro saisi `{ phone }` → `{ phone, network }` (relais MobileWallet)         |
| POST    | `/wallet/withdraw`         | retrait `{ amount, phone, network, sourceNetwork, receiverName?, narration? }`            |
| POST    | `/wallet/admin/platform-transfer` | **admin** : verse de la marge plateforme `{ toFastFoodId, sources[], reason? }`   |

Payloads déclarés dans [walletFields.js](../src/interface/walletFields.js).

### Anciennes apps et retrait (R11)

Référence : la version actuelle en base, **`platform_latest_app_version`**.
App antérieure → `POST /wallet/withdraw` répond **426** `app_update_required`,
« Mettez à jour l'application pour effectuer un retrait. » (toast).

### `GET /wallet/balance` — compatibilité (R11)

`balance` garde son sens (**total retirable**) ; `mtn` et `orange` sont **ajoutés**.
Changement purement additif : une ancienne app lit `balance` et ignore le reste.
Depuis le passage à pawaPay, `balance` ne compte plus l'historique DigiKUNTZ.

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
  "balance": 14150,
  "balances": { "mtn": 9000, "orange": 5150 },
  "totals": { "payin": 14250, "payout": 100, "net": 14150 },
  "series": [{ "period": "2026-06-18", "payin": 4650, "payout": 0, "net": 4650, "count": 1, "payoutByType": {} }],
  "withdrawFeePercent": { "mtn": 1.3, "orange": 1.0 }
}
```

`series[].payoutByType` (additif) : sorties du jour par type (`withdrawal`,
`merchant_debit`, `sms_fee`), pour libeller chaque sortie dans l'app.

`withdrawFeePercent` (additif) : taux interréseau par réseau de **réception**
(`pawapay_payout_fee_<réseau>_percent`, valeurs d'exemple). Il est affiché sur
les cartes de numéro du retrait (« +1 % interréseau ») avant la saisie du
montant. C'est un taux **indicatif** : le frais réel reste celui de
`GET /wallet/withdraw/quote`.

Clés `period` : `YYYY-MM-DD` (day), `YYYY-Www` semaine ISO (week), `YYYY-MM` (month).
Helper : [src/utils/period.js](../src/utils/period.js) (`resolvePeriod`, `groupKey`).

Routes : [walletRoutes.js](../src/routes/walletRoutes.js) ·
Controller : [wallet.controller.js](../src/controllers/wallet/wallet.controller.js) ·
Service : [withdraw.service.js](../src/services/wallet/withdraw.service.js) ·
Repo : [withdrawals.repo.js](../src/repositories/supabase/withdrawals.repo.js) ·
Validateur : [validateWithdrawal.js](../src/utils/validator/validateWithdrawal.js).

### Frais d'un retrait

`amount` = **espèces voulues** (touchées chez l'agent). On **envoie** au téléphone
`sentAmount = amount + kioskFee` (1,2 % + 4 du réseau de réception, migration 066
`withdrawals.kiosk_fee` ; `withdrawals.amount` = montant envoyé). Débité du solde
source : `totalDebited = sentAmount + fee` (frais interréseau calculés sur `sentAmount`).


L'utilisateur choisit **le solde débité** (`sourceNetwork`) ET **le numéro de
réception** (réseau `network`, détecté à la saisie via `POST /wallet/operator/predict`).
**Aucun repli automatique** sur l'autre solde.

| Cas                                | Frais                                                    |
| ---------------------------------- | -------------------------------------------------------- |
| même réseau (`sourceNetwork = network`) | **0 F** — prépayés au dépôt (réserve de retrait pawaPay) |
| interréseau                        | ⌈taux du réseau de réception × montant⌉, débité **en plus** sur le solde source |

Le frais interréseau vient de MobileWallet (`GET /payout/quote`), qui fait foi ;
il est redemandé au retrait. `GET /wallet/withdraw/quote` renvoie
`{ amount, fee, totalDebited, sourceBalance, sufficient, maxAmount, sameNetwork }` —
`maxAmount` (plus gros montant recevable depuis ce solde, frais compris) est
estimé avec `pawapay_payout_fee_<réseau>_percent`
([withdrawQuote.service.js](../src/services/wallet/withdrawQuote.service.js)).
Le front n'affiche les frais **qu'en interréseau**.

### Flux retrait (`POST /wallet/withdraw`)

Body : `{ amount, phone, network, sourceNetwork, receiverName?, narration? }`.
`amount` = montant **reçu**, entier.

> ⚠️ **Le débit n'a lieu QU'AU SUCCÈS du payout** (transaction `withdrawal` créée au verdict
> `successful`), jamais à la demande. Donc un retrait échoué/annulé laisse le solde intact.

1. valide montant/phone/network/sourceNetwork (`MTN` | `ORANGEMONEY`) ;
2. devis : frais 0 (même réseau) ou interréseau (MobileWallet) ;
3. solde **source** → **400 `insufficient_balance`** si `amount + frais > solde source`
   (`data` = le devis) ;
4. **blocage doublon** : **409 `withdrawal_in_progress`** s'il existe déjà un retrait `pending` ;
5. **cooldown** : **429 `cooldown`** si moins de `WITHDRAWAL_COOLDOWN_HOURS` (env, défaut 24h)
   depuis le dernier retrait (les versements automatiques `kind = 'order'` ne comptent
   ni ici ni au point 4) ;
6. `receiver_name` : `receiverName` du body → nom marchand (`users`) → `fastfood.name` ;
7. insère `withdrawals` (`status='pending'`, `source_network`, `fee`, `aggregator`) — **aucun débit** ;
8. appelle **MobileWallet `/payout`** avec `aggregator` + `source_network`
   ([mobilewalletService.payout](../src/services/transaction/mobilewalletService.js)),
   stocke `mw_payout_id` et le `fee` réellement retenu. Échec d'initiation → `status='failed'`
   + **vrai code HTTP MobileWallet** renvoyé (400/409/422…, 503 opérateur, 502 injoignable) ;
9. émet socket fiable `wallet.withdrawal` (`status='pending'`, `fee`, `sourceNetwork`).

### Verdict du retrait (webhook + socket)

Même double canal que les paiements. [webhookMobilewallet.service](../src/services/transaction/webhookMobilewallet.service.js)
**route en tête** : si `transaction_id` correspond à un `withdrawals.mw_payout_id` →
[webhookPayout.service](../src/services/transaction/webhookPayout.service.js) :

- idempotence via `reserveSettlement` (table partagée) ;
- `successful` → crée la transaction `withdrawal` (**débit réel** = montant + frais, sur le
  solde source) + `status='completed'` + socket `wallet.withdrawal` (`status='completed'`,
  `newBalance`, `newBalances: { mtn, orange }`) ;
- `failed`/`cancelled` → `status='failed'`, **aucun débit** + socket `wallet.withdrawal`
  (`status='failed'`).

Variables d'env : `WITHDRAWAL_COOLDOWN_HOURS`, `WITHDRAWAL_CURRENCY` (défaut `XAF`).

---

## Versement automatique d'une commande (boutique WhatsApp, migration 086)

Boutique `whatsappOrders` seulement. À la validation de la livraison par QR (scan
dans l'app ou « LIVRÉ » sur WhatsApp, `confirmDelivery.service`), la part du
marchand pour CETTE commande part sur son numéro, sans retrait à demander
([orderPayout.service.js](../src/services/wallet/orderPayout.service.js)) :

- **montant** = son `merchant_credit` de la commande, tel quel : le départage est
  déjà fait au paiement (plats réels + frais de retrait + course s'il livre) ;
- **solde source** = réseau du paiement ; **numéro** = numéro de versement de la
  boutique (`payout_numbers`, saisi par l'admin : `PUT /fastfood/:id/payout-number`),
  celui du même réseau d'abord → **0 F** ;
- **commande confiée à un livreur** (`order.driverId`, migration 093, décision du
  16/11/2026) : numéro OM / MoMo validé **du livreur** (même choix de réseau), jamais celui
  de la boutique en repli. Le livreur remet la part à la boutique. Le débit reste sur le
  solde de la boutique ; `withdrawals.driver_id` garde le livreur (suivi de ce que chaque
  livreur a reçu). Livreur sans numéro : rien ne part, `app_errors`
  `driver_payout_number_missing` (un livreur ne livre qu'avec un numéro validé) ;
- **interréseau** (aucun numéro sur le réseau du paiement) : frais MobileWallet pris
  sur la part de la commande, envoyé + frais = crédit ;
- **pas de blocage doublon ni de cooldown** : un versement par commande livrée
  (`withdrawals.kind = 'order'`, `order_id` unique hors échecs). Un versement échoué
  se relance au scan suivant (`alreadyDelivered`) ;
- solde source < montant + frais (dette d'annulation) : rien ne part ;
- verdict par `webhookPayout.service` comme un retrait (débit au succès seulement,
  transaction `withdrawal` nommée « Versement commande », `relatedOrderId`), plus un
  message WhatsApp au marchand (reçu / échoué), et au livreur quand il l'a reçu ;
- tout échec ou cas non versé est tracé dans `app_errors` (`scope = 'order_payout'`).

Boutique normale : le QR valide seulement la livraison, aucun versement.

---

## Transfert de marge plateforme (admin)

Il n'existe **pas de solde plateforme** : la part Yaammoo d'une commande est le
résidu `order_settlements.platform_margin` (marge + arrondi + écart de zone − frais),
qui reste sur le compte de l'agrégateur. `order_deliveries.platform_margin` n'en est
que le détail course : ne **jamais** l'additionner (double compte).

`POST /wallet/admin/platform-transfer` (`authorize(adminOnly)`) en verse une partie
sur le portefeuille d'une boutique. Body ([walletFields.js](../src/interface/walletFields.js)) :

```json
{ "toFastFoodId": "ff_B", "reason": "geste commercial",
  "sources": [ { "fastFoodId": "ff_A", "network": "MTN", "amount": 1000 },
               { "fastFoodId": "ff_C", "network": "ORANGEMONEY", "amount": 500 } ] }
```

```
marge gagnée[F, réseau]   = Σ platform_margin des commandes de F payées sur ce réseau
                            (réseau relu sur le merchant_credit, pawaPay seulement)
déjà transférée[F, réseau] = Σ platform_transfer dont sourceFastFoodId = F
disponible                 = gagnée − transférée     ← PLAFOND de chaque source
```

- **Montant par source** ; une source peut être la boutique destinataire elle-même.
  Deux lignes identiques (même boutique, même réseau) sont additionnées.
- **Réseau conservé** : marge MTN → solde MTN du destinataire, Orange → Orange.
  La réserve de retrait pawaPay (1,3 %) a été prélevée au dépôt sur **tout** le
  paiement, marge comprise : le retrait même réseau reste gratuit.
- **Frais kiosque inclus** : 1 000 F transférés = 1 000 F crédités ; le marchand
  touchera ~984 F en espèces (1,2 % + 4 pris au retrait, comme tout retrait).
- **Tout ou rien** : une source au-delà de sa marge disponible → **400
  `insufficient_margin`**, `data.refused[] = { fastFoodId, network, amount, available, reason }`,
  rien n'est versé. Destinataire absent → **404 `destination_not_found`**.
- Une insertion unique (une transaction par source) puis socket `wallet.credited`
  (`type: 'platform_transfer'`) vers le destinataire.
- Verrou en base `platform_transfer_locks` (migration 067) : une ligne par
  boutique source pendant le transfert ; un second transfert simultané sur la
  même source reçoit 409 `transfer_in_progress`. Verrou périmé après 2 min (crash).

Code : [platformTransfer.service.js](../src/services/wallet/platformTransfer.service.js) ·
[platformTransfers.repo.js](../src/repositories/supabase/platformTransfers.repo.js) ·
validateur `validatePlatformTransfer` ([validateWithdrawal.js](../src/utils/validator/validateWithdrawal.js)).

---

## TODO

- [ ] Réservation atomique du solde entre la demande et le verdict (aujourd'hui : blocage
      `pending` + cooldown suffisent en pratique, mais le solde n'est pas verrouillé).
- [ ] Remboursement client : crédit marchand inverse à prévoir si une commande payée est annulée.


## `merchant_debit`

Reprise d'une commande payée annulée (cf. order-cancel.md) : DÉBIT du solde, sur le réseau du paiement. Le solde peut devenir négatif. `extra_data.feesDebit` = frais kiosque repris.

## Numéros de retrait vérifiés (migration 079)

Un retrait (`POST /wallet/withdraw`) n'est accepté que vers un numéro vérifié
par le compte : sinon 403 `payout_number_unverified`. Vérification par code
**SMS uniquement** (Bird `channels: ['sms']`) :

- `POST /wallet/payout-number/request { phoneNumber }` : envoi (cooldown et 429
  `Retry-After` comme `/auth/phone/request`), coût journalisé dans `bird_costs`
  avec le `userId` du marchand (facturation future des frais OTP) ;
- `POST /wallet/payout-number/verify { phoneNumber, code }` : 401 si code refusé
  (`reason`, `attemptsRemaining`), sinon ligne `payout_numbers` (E.164). Aucune
  connexion ni création de compte ;
- `GET /wallet/payout-number` : numéros vérifiés du compte.

Service : `services/wallet/payoutNumber.service.js`. Les numéros déjà enregistrés
avant 079 ne sont pas vérifiés : le marchand les revérifie depuis sa boutique.

**Sans code si déjà validé sur WhatsApp** (migration 093, R11) : app >=
`settings_deployment.payout_number_whatsapp_min_app_version` (1.1.6 : l'app y saute
l'étape code et impose le WhatsApp avant OM / MoMo) et numéro présent dans `whatsapp_numbers` du compte → `request` le vérifie
tout de suite, sans SMS ni frais : `200 { verified: true, phoneNumber }`. En dessous du
seuil : code SMS comme avant. L'app impose donc le WhatsApp en premier (création,
modification de la boutique, retrait). **Sens inverse** : `POST /whatsapp-number/request`
sur un numéro déjà validé comme numéro de retrait du compte → WhatsApp vérifié sans code
(`verified: true`, `whatsapp_numbers.source = 'payout'`), même seuil de version.
Livreur sans app : il donne son numéro à l'agent IA sur WhatsApp ; celui d'où il écrit
est validé sans code, un autre reçoit ce même code SMS, qu'il renvoie à l'agent. Frais SMS
débités à sa **boutique** (`billUserId` de `requestPayoutNumberCode` / `verifyPayoutNumberCode`)
([whatsapp-ai.md](./whatsapp-ai.md), « Livreurs »).

## Numéro WhatsApp de la boutique vérifié (migration 080)

`POST /whatsapp-number/request|verify` (+ `GET /whatsapp-number`) : même mécanique
que les numéros de retrait, mais code sur **WhatsApp uniquement** (`channels:
['whatsapp']`, aucun repli SMS). Un code livré par un autre canal est refusé.
Connexion par numéro (`/auth/phone/verify`) : si Bird a livré le code par
WhatsApp, le numéro est enregistré comme WhatsApp vérifié (`source = 'login'`) ;
un repli SMS ne vérifie rien. Livreur WhatsApp qui donne comme numéro OM / MoMo celui d'où
il écrit : `source = 'inbound'` (migration 093). Table `whatsapp_numbers`.

## Frais SMS des numéros de retrait (`sms_fee`, migration 083, CGU 12.5 bis)

Chaque code envoyé par SMS pour vérifier un numéro Orange Money / MTN
(`POST /wallet/payout-number/request`, `network` obligatoire) est débité au
marchand :

```
frais = ⌈ coût Bird réel en USD (delta non encore débité) × taux USD→XAF du jour ⌉
```

- Transaction `sms_fee` (débit, direction `payout`), sur le solde du réseau
  vérifié, agrégateur `pawapay`. `extra_data` : `verificationId`, `costUsd`,
  `usdXafRate`, `phone`.
- Bird ne connaît le coût qu'après la livraison : débit à la validation du code,
  sinon par `smsFeeJob` (1×/h) ; les envois jamais validés sont relus chez Bird
  après 15 min. Un renvoi réutilise le même `verificationId` : seul le delta
  (`bird_costs.fee_debited_usd`) est débité.
- Taux : `settings_app.usd_xaf_rate` `{ rate, fetchedAt }`, rafraîchi 1×/jour
  depuis `FX_RATE_URL` (fly.toml) ; en panne, dernier taux. Sans taux : rien
  n'est débité, alerte `app_errors` (`sms_fee_no_rate`), rattrapé au passage suivant.
- Échec d'écriture : `app_errors` `sms_fee_debit_failed`.
- Le solde peut devenir négatif : ce négatif **ne bloque pas** la boutique
  (`merchantDebtGuard` ne regarde que `merchant_debit`).
- Estimation avant l'envoi : `GET /wallet/payout-number/fee` = moyenne des 50
  derniers coûts SMS réels (par envoi) × taux, ⌈⌉. Le WhatsApp de la boutique
  (`/whatsapp-number`) n'est pas facturé.

## Part de la plateforme (admin) — `GET /wallet/admin/platform-share`

`platformShare.repo`, par réseau (orange, mtn), portefeuille pawaPay :

```
margin            = Σ order_settlements.platform_margin (réseau du merchant_credit),
                    commandes annulées (cancelByUser / cancelByFastFood) exclues
smsFees           = Σ transactions sms_fee
transferred       = Σ transactions platform_transfer (marge versée à une boutique)
earned            = margin + smsFees − transferred
withdrawn         = Σ transactions platform_withdrawal (retraits admin confirmés)
pendingWithdrawal = retraits admin envoyés, verdict pas encore reçu
available         = earned − withdrawn − pendingWithdrawal
walletsOwed       = Σ des soldes POSITIFS des portefeuilles (marchands, livreurs)
```

Chaque marge est figée par commande au paiement : un changement de réglage ne
modifie pas les marges passées. Ne jamais retirer directement sur pawaPay (le
retrait ne serait pas connu) : passer par la route ci-dessous.

## Retrait de la part plateforme (admin) — `POST /wallet/admin/platform-withdraw`

`platformWithdraw.service`. Body `{ amount, phone, network, reason? }`
(`PlatformWithdrawFields`). Même réseau que la part débitée (aucun frais
interréseau). Plafond `available`. Ligne `withdrawals` avec `kind = 'platform'`
(migration 084), payout MobileWallet ; au succès, transaction
`platform_withdrawal` (aucun portefeuille touché). Verrou global
`__platform__` (table `platform_transfer_locks`) partagé avec les versements.

## Versement de marge à une boutique — plafonds

`POST /wallet/admin/platform-transfer` : chaque source est plafonnée à la marge
disponible de SA boutique (commandes annulées exclues), et le total par réseau
à `available` de la plateforme (une marge déjà retirée ne peut plus être versée).
