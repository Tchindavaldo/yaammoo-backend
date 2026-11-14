# Annulation d'une commande payée et groupage des départs

## Annulation (`services/order/orderCancel.service.js`)

| Qui | Statuts autorisés | Statut posé |
|---|---|---|
| Client | `pending` (pas encore acceptée) | `cancelByUser` |
| Restaurant | `pending`, `processing`, `finished` | `cancelByFastFood` |

Un retrait du panier (`pendingToBuy` → `cancelByUser`) n'a rien coûté : aucun
remboursement. Une commande déjà annulée, en livraison ou livrée : refus.

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
