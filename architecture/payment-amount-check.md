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
- **bonus par code** (`bonusCode` présenté) → vérifié par code ;
- **bonus armé** (le user a réclamé puis **armé** son bonus, sans présenter de
  code) → `resolveDeliveryBonus` retombe sur l'armement global (`getArmedDeliveryOffers`).
  ⚠️ On interroge donc le pipeline **même sans `bonusCode`**, dès qu'un `userId`
  est présent — sinon un bonus armé serait ignoré et la commande refusée à tort.

Dans tous les cas, un bonus vaut **une seule fois** pour le lot (comme `settleDelivery`).

Une commande dont la livraison est offerte : `total = base` (pas de `delivery.prix`).
La gratuité est ensuite absorbée par la marge côté `settleDelivery` (`covered_by`).

---

## Panier groupé — une seule course

La course est facturée dans **chaque** total non offert. Or plusieurs commandes
qui partent **ensemble** ne font qu'**une** course. On regroupe les commandes
livrées **ET non offertes** :

| Mode | Clé de groupe |
|---|---|
| **express** | `fastFoodId + zone + type + date` |
| **time** | `fastFoodId + zone + type + date + heure` |

Chaque segment porte une raison d'être un départ distinct :

- `fastFoodId` + `zone` — un déplacement, une destination ;
- `type` — un express et un programmé ne partent jamais ensemble ;
- `date` — deux jours différents = deux courses ;
- `heure` — **uniquement en `time`**. L'express n'a pas de créneau (il part dès
  que c'est prêt), et une commande express portant une heure est **refusée en
  amont** par `validateExpressDelivery` (cf. [orders.md](./orders.md)).

Groupe de **N** commandes ⇒ on déduit `(N−1) × delivery.prix`. Toute différence
sur un segment de la clé = courses distinctes = **0 déduction**. Les commandes
offertes n'entrent pas dans un groupe (elles n'ont pas payé de course).

> **Le panier est libre** : modes et créneaux peuvent être mélangés, même chez
> une seule boutique. Aucune uniformité n'est exigée — la clé ci-dessus suffit à
> facturer le bon nombre de courses. (L'ancien `validateCartDelivery`, qui
> imposait cette uniformité, a été supprimé.)

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

## Logs

Le bloc `[payAmount]` affiche les commandes **groupées par course** — même clé que
le calcul (`fastFoodId|zone|type|date(|time)`) — pour qu'on voie d'un coup d'œil
qui partage un déplacement. Les commandes en retrait vont dans `(sans livraison)`.

```
[payAmount] ═══ 10 commande(s) · amount reçu=11500 · bonusCode=∅ ═══

[payAmount] ┌ 8KqUta…|zb|time|2026-07-25|13:00 — 2 cmd
[payAmount] │ #1 plat=1000×1=1000 + extras=0 + drinks=0 + livraison=250 → attendu=1250 | reçu=1250
[payAmount] │ #7 plat=1000×1=1000 + extras=0 + drinks=0 + livraison=250 → attendu=1250 | reçu=1250

[payAmount] ⤷ 8KqUta…|zb|time|2026-07-25|13:00 : 2 cmd → 1 course, déduit 1×250=250
[payAmount] Σtotal=12250 − groupé=250 → attendu=12000 | amount=12000
[payAmount] ✓ amount 12000 == attendu 12000 → OK
```

- Les `#N` gardent leur **index dans le payload** (non séquentiels dans un bloc) :
  c'est ce qui permet de retrouver la commande dans la requête.
- En cas d'écart sur un item, les lignes déjà traitées sont affichées **à plat**
  puis la validation s'arrête — elle reste dans l'ordre reçu.
- `POST /transaction` ne logue plus le body complet (25 commandes = mur illisible),
  seulement `payBy / userId / amount / items=<n>`.

---

## Fichiers

- `src/utils/validator/validatePaymentAmount.js` — exports :
  `validatePaymentAmount(amount, items, ctx)` (async ; `ctx = { userId, bonusCode }`),
  `recomputeItemBase`, `deliveryGroupKey`, `resolveOfferedDeliveries`, `AMOUNT_TOLERANCE`.
- `src/utils/validator/validateExpressDelivery.js` — refuse une commande express
  portant une heure (appelé juste avant, dans le même service).
- Appelé par `src/services/transaction/postTransaction.service.js` (avant MobileWallet,
  avec `{ userId, bonusCode }` ; le `bonusCode` est extrait de `items[].bonusCode`).
- Verdict d'offre : `resolveDeliveryBonus` (`services/bonus/applyDeliveryBonus.service.js`)
  + `resolveOffer` (`services/pricing/deliveryOfferResolver.js`) + `getPricingSettings`.
- Prix affiché : `src/services/pricing/deliveryPricing.js`.
- Champs commande : `src/interface/orderFields.js`.
