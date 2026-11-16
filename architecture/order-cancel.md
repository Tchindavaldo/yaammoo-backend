# Annulation d'une commande payée et groupage des départs

## Annulation (`services/order/orderCancel.service.js`)

| Qui | Statuts autorisés | Statut posé |
|---|---|---|
| Client | `pending` (pas encore acceptée) | `cancelByUser` |
| Restaurant | `pending`, `processing`, `finished` | `cancelByFastFood` |

Un retrait du panier (`pendingToBuy` → `cancelByUser`) n'a rien coûté : aucun
remboursement. Une commande déjà annulée, en livraison ou livrée : refus.

**Concurrence** (verrou optimiste, `orders.repo.update(id, fields, { expectedStatus })`) :
`updateOrders` n'écrit que si le statut en base est encore celui qu'il a lu. Le client
annule pendant que le marchand accepte : la première écriture passe, la seconde est
refusée (« Le restaurant a déjà accepté cette commande… », ou « La commande vient de
changer de statut »). Le stock pris par une écriture refusée est rendu.

### Annulation sur demande (boutique WhatsApp, `services/order/cancelRequest.service.js`)

Boutique `whatsappOrders` : le marchand n'a pas l'app, il doit pouvoir suivre. Un
`cancelByUser` du client sur une commande `pending` **n'annule pas** : il crée une
demande `order.cancelRequest` (dans `extra_data`), envoyée au marchand sur WhatsApp
([whatsapp.md](./whatsapp.md), « Demande d'annulation »). Boutique normale : inchangé,
le client annule directement tant que la commande est en attente.

```
cancelRequest = { status, requestedAt, sentAt, resendAt, sentCount, resolvedAt?, reason? }
  pending  : demande envoyée, commande toujours `pending`
  accepted : le marchand accepte -> `cancelByUser` (remboursement règle CLIENT ci-dessous)
  refused  : le marchand refuse (reason 'merchant'), ou il accepte la COMMANDE entre-temps
             (reason 'accepted_order') ; définitif, plus de nouvelle demande
  closed   : la commande est sortie de `pending` autrement (ex. refusée par le restaurant)
```

- Sans réponse : la demande reste en attente (jamais annulée d'office, décision du
  16/11/2026). Passé `resendAt` (`settings_app.cancel_request_resend_minutes`, 15,
  migration 092), le client peut la **renvoyer** : même `PUT /order cancelByUser`,
  `sentCount` + 1, nouveau `resendAt`, relance au marchand (« Relance : le client
  demande… »). Avant `resendAt`, l'appel ne renvoie rien (réponse `cancelRequested`).
- Client et marchand reçoivent la commande à jour (`userOrderUpdated`,
  `fastFoodOrderUpdated`), le client une push à la décision (`type: 'order_cancel_request'`).
- Réponse de `PUT /order` : `data.cancelRequested = true`, `data.data` = commande. R11 :
  une app sous `settings_deployment.cancel_request_min_app_version` (migration 091 : test 1.1.5, servie par OTA ; prod 1.1.6, l'app 1.1.5 des stores ne la gère pas)
  reçoit `409 { code: 'cancel_requested', message }` : sans cela elle lirait le succès comme
  « Commande annulée ».

### Calcul (tout est relu en base : règlement, crédit marchand, course)

```
payé     = order.total − course non payée (commande qui partageait la course)
gardé    = course de la commande qui PORTE la course, si son départ a encore
           d'autres commandes ouvertes (elle reste due au départ)
base     = payé − gardé
frais    = ⌈dépôt[réseau] % × base⌉ + ⌈commission MW % × base⌉   (realPaymentFeesOf)
client annule   : rendu = base − frais ; reprise marchand = ce qu'il a reçu
marchand annule : rendu = base         ; reprise marchand = reçu + frais
reçu     = items_real + withdrawal_fee (sauf si d'autres commandes de la boutique
           du même panier restent ouvertes) + course (régime fastfood, si pas gardée)
```

- La **réserve de retrait** prise au dépôt paie le payout du remboursement
  (même réseau) : coût plateforme 0.
- **Reprise marchand** : transaction `merchant_debit` sur le réseau du
  paiement. Le solde peut devenir **négatif** : dette reprise sur ses gains.
- **Remboursement** : payout MobileWallet vers le numéro qui a payé
  (`pending_payments.phone`), ligne `order_refunds` (migration 075), une par
  (commande, kind) : jamais deux fois. Verdict : `refundPayoutVerdict.service`.
- **Course gardée** rendue quand le départ n'a plus aucune commande ouverte
  (ligne `kind = 'course'`, même régime de frais que l'annulation d'origine).
- DigiKUNTZ ou numéro introuvable : `status = 'manual'` + `app_errors`.
  Payout refusé : `failed` + `app_errors` (à relancer à la main).
- API Refund pawaPay : non utilisée (todo frontend `remboursement-pawapay-refund.md`).

Devis avant confirmation : `GET /order/cancel-quote/:userId/:orderId`.
Socket au client : `order.refund { orderId, refundId, amount, feesKept, status }`.

Non fait (à décider) : blocage d'une boutique au-delà d'un seuil de dette,
annulation automatique d'une commande non traitée.

## Groupage (`services/order/paidDeliveryGroups.service.js`)

Un client qui a déjà payé une commande pour un départ (`deliveryGroupKey`) pas
encore parti (`pending`, `processing`, `finished`) ne repaie pas la course : la
nouvelle commande porte sa course comme **offerte** (total = base,
`delivery.prix` gardé). `validatePaymentAmount` l'ajoute aux livraisons
offertes, `settleDelivery` la règle en `courseBilled = false`,
`free_reason = 'grouped'` et reprend le `deliveryGroupId` du départ.
`repriceCart` applique la même règle au panier (course retirée ou remise) ;
`updateOrders` relance ce recalcul quand un départ est payé, part en
livraison ou est annulé. Départ en `delivering` : course due (refus « prix
changés » si le client payait entre-temps).

`GET /order/delivery-group/:userId?fastFoodId&zone&type&date&time` →
`{ grouped, orderId }` : l'app affiche la course offerte.

## Annulation d'office et dette

- `order_auto_cancel_days` (settings_app, 7 j, migration 076) : `src/utils/orderAutoCancelJob.js`
  annule (`cancelByFastFood`, via `updateOrders`) toute commande `pending`/`processing`/`finished`
  plus vieille ; remboursement complet, frais repris au marchand.
- `src/services/order/merchantDebtGuard.service.js` : solde < 0 avec une reprise `merchant_debit`
  ⇒ refus `merchant_debt` au précheck + push au marchand à chaque tentative.
- Le devis renvoie `phone` (numéro payeur, `pending_payments.phone`).
