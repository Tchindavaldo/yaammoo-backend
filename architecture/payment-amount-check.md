# Feature — Contrôle du montant encaissé (`validatePaymentAmount`)

## Rôle

`amount` (racine) et `items[].total` sont **fournis par le client** → jamais de
confiance. Avant tout appel MobileWallet, `postTransaction.service` **recalcule**
tout côté serveur (`src/utils/validator/validatePaymentAmount.js`) pour empêcher :
sous-paiement, sur-paiement, livraison facturée en double, total/amount trafiqués.

> Exclu pour un **paiement partiel** (`mobileApp` avec `amount < currentAmount`) :
> il encaisse volontairement moins que le total.

---

## La brique de base : `total` d'une commande

Le prix affiché d'un plat contient déjà la **marge** (supplément fondu depuis le
home). Le **prix de la course** (`delivery.prix`), lui, s'ajoute au total **quand la
livraison n'est pas offerte** :

```
base  = (prices[selectedPriceIndex − 1].price × quantity)   // plat × quantité
      + Σ(extra.prix        où status === true)              // extra coché : ×1
      + Σ(drink.prix × drink.quantite   où status === true)  // drink coché : × sa quantite

total = base + delivery.prix     si livraison livrée ET NON offerte
total = base                     si livraison offerte  (ou retrait)
```

> ⚠️ `selectedPriceIndex` est en **base 1** (1 = `prices[0]`).
> ⚠️ `drink[].quantite` est **propre au drink**, indépendant de `quantity` du plat.

**Niveau ITEM** : pour chaque commande, `total` reçu doit égaler ce total recalculé.
Au **premier** écart → **400** immédiat, sans traiter les items suivants ni sommer.

---

## Livraison offerte — verdict SERVEUR

« Offerte » n'est **jamais** décidé par la présence de `bonusCode` dans le payload.
Le backend rejoue le pipeline (`resolveDeliveryBonus` + `resolveOffer`) :

- **mode campagne** (`delivery_free_mode`) → toutes les livraisons offertes ;
- **bonus user valide** → offert, mais **une seule fois** pour le lot (comme
  `settleDelivery`).

Une commande dont la livraison est offerte : `total = base` (pas de `delivery.prix`).
La gratuité est ensuite absorbée par la marge côté `settleDelivery` (`covered_by`).

---

## Panier groupé — une seule course

La course est facturée dans **chaque** total non offert. Or plusieurs commandes
livrées **ensemble** (même boutique, zone, créneau) ne font qu'**une** course. On
regroupe les commandes livrées **ET non offertes** :

| Mode | Clé de groupe |
|---|---|
| **express** | `fastFoodId + zone` |
| **time** | `fastFoodId + zone + heure` |

Groupe de **N** commandes ⇒ on déduit `(N−1) × delivery.prix`. Zones/créneaux
différents = courses distinctes = **0 déduction**. Les commandes offertes n'entrent
pas dans un groupe (elles n'ont pas payé de course).

> La cohérence des créneaux d'une même boutique est garantie en amont par
> `validateCartDelivery` (cf. [orders.md](./orders.md)).

---

## Contrôle final (niveau PANIER)

```
attendu = Σ(totaux recalculés) − (livraisons groupées en double)
amount == attendu ?   sinon → 400
```

---

## Récapitulatif des cas (vérifiés)

| Cas | `total` d'une cmd | Déduction | Résultat |
|---|---|---|---|
| 1 cmd, livrée, **non offerte** | base + delivery.prix | 0 | `amount == total` |
| 1 cmd, livrée, **offerte** (bonus/campagne) | base (sans delivery.prix) | 0 | course en marge |
| 1 cmd, **retrait** | base | 0 | pas de livraison |
| Panier, cmd non offertes **zones/créneaux ≠** | base + delivery.prix chacune | 0 | N livraisons dues |
| Panier, **N cmd même groupe** non offert | base + delivery.prix chacune | **(N−1)×delivery.prix** | 1 seule course |
| front oublie / ajoute mal la livraison, ou total/amount trafiqué | — | — | **400** |

---

## Fichiers

- `src/utils/validator/validatePaymentAmount.js` — `validatePaymentAmount(amount, items)`,
  `recomputeItemTotal`, `duplicateDeliveryDeduction`, `deliveryGroupKey`.
- Appelé par `src/services/transaction/postTransaction.service.js` (avant MobileWallet).
- Prix affiché : `src/services/pricing/deliveryPricing.js`.
- Champs commande : `src/interface/orderFields.js`.
