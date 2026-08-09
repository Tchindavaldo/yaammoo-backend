# Tarification — quel prix pour quel rôle

Qui voit le prix **affiché** (client) et qui voit le prix **brut** (marchand),
sur les routes comme sur les sockets.

> **Prérequis** : la composition du prix affiché et la distinction zone max /
> course réelle sont dans [pricing.md](./pricing.md). Ne pas lire ce fichier
> seul si la question porte sur un montant.

| Besoin                                                    | Fichier                                                  |
| --------------------------------------------------------- | -------------------------------------------------------- |
| Comment le prix affiché est composé                       | [pricing.md](./pricing.md)                               |
| Ce que chaque partie touche au règlement                  | [pricing-settlement.md](./pricing-settlement.md)         |
| Régimes `fastfood` / `platform`                           | [pricing-delivery-modes.md](./pricing-delivery-modes.md) |
| Champs `deliveryGroupId` / `courseBilled` servis au front | [orders.md](./orders.md)                                 |

---

## Ce que chaque rôle voit

| Route                         | Audience | Prix                              |
| ----------------------------- | -------- | --------------------------------- |
| `GET /order/user/all/:userId` | client   | **affiché** (ce qu'il a payé)     |
| `GET /order/driver/:driverId` | livreur  | **affiché** — identique au client |
| `GET /order/all/:fastFoodId`  | marchand | **réel** + `customerTotal`        |

Le **livreur voit les prix client**, pas les montants marchands : il est
l'interface avec le client à la livraison, et annoncer un montant différent de
celui payé créerait un litige à chaque course. Il ne sait donc rien de ce que
touche la boutique.

La bascule marchand est portée par `services/order/toMerchantView.js`. Exemple
avec un plat brut 2000, zone max 1000, zone réelle 500 :

| Champ                           | Marchand                                                 |
| ------------------------------- | -------------------------------------------------------- |
| `menu.prices[].price`           | `rawPrice` (2000)                                        |
| `extra[].prix` / `drink[].prix` | `rawPrice`                                               |
| `delivery.prix`                 | course réelle (500)                                      |
| `total`                         | **ce qu'il encaisse** = `items_real` + course = **2500** |
| `customerTotal`                 | ce que le client a payé (3820)                           |

`total` vient de `order_settlements.items_real` + la course. Tant que la commande
n'est pas réglée, il est recalculé depuis les `rawPrice` figés.

> ⚠️ **Une seule course par départ.** Un panier de 3 plats chez la même boutique
> fait 3 commandes mais UN déplacement : la course n'est ajoutée qu'à la
> commande qui la porte (`courseBilled`, ou `deliveryGroupKey` avant règlement),
> sinon la boutique verrait N fois la course.
>
> Panier A+B (plats bruts 2000, course 500) : A → `total` 2500, B → `total` 2000,
> soit **4500** encaissés pour une seule course — et non 5000.

---

## Vue marchand — acheter vs gérer

**`GET /fastfood/all` sert le prix affiché à TOUT LE MONDE**, propriétaire
compris (`pricing.applied: true` toujours). Cette route alimente le **home**,
donc un écran d'**achat** : un marchand qui commande y est un client comme un
autre, et lui montrer ses prix réels afficherait un prix qu'il ne paierait pas.

Le catalogue réel se lit sur **`GET /menu/:fastFoodId`**, qui n'applique aucune
surcharge — c'est l'endpoint de **gestion**. La distinction est donc portée par
l'**endpoint** (acheter vs gérer), pas par le rôle de l'appelant.

> ⚠️ Auparavant `getFastFoods` passait `isOwner` à `applyDisplayPricing` : le
> propriétaire voyait ses prix bruts sur le home, donc un prix inférieur à celui
> qu'il aurait payé en commandant.

---

## Sockets menu — affiché (client) vs brut (marchand)

Un menu émis en socket doit porter le **bon prix selon l'audience**, comme
`getFastFoods` :

| Événement                                                                                  | Audience                    | Prix                                    |
| ------------------------------------------------------------------------------------------ | --------------------------- | --------------------------------------- |
| `globalMenuUpdated`, `newGlobalMenu`, `globalMenuDeleted`                                  | broadcast **client** (home) | **affiché** (livraison + marge + frais) |
| `fastFoodMenuUpdated`, `newFastFoodMenu`, `fastFoodMenuDeleted`, `newMenu` (room boutique) | **marchand** (gestion)      | **brut**                                |

Les émissions client passent par `services/menu/enrichMenuForClient.js` (recharge
la boutique du menu → `applyDisplayPricing`). Avant, ces sockets renvoyaient le
**prix brut** → le home affichait un prix sans livraison/marge/frais (bug au
changement de stock pendant une commande, à la création/édition/suppression de
menu).

Liste complète des événements : [socket-events.md](./socket-events.md).

---

## `rawPrice` — le prix réel transporté à côté de l'affiché

`applyDisplayPricing` ajoute **`rawPrice`** sur chaque `prices[]`, `extra[]` et
`drink[]` : le prix réel du fastfood, servi en même temps que le prix affiché.

Le front le **renvoie tel quel** dans `order.menu` à la commande, ce qui fige le
prix de l'époque. C'est la seule façon de le connaître plus tard :

- le prix affiché n'est **pas inversible** (l'arrondi `ceil` détruit l'information) ;
- relire le menu après coup donnerait le prix **courant**, pas celui payé — un
  marchand qui change ses tarifs réécrirait tout son historique.

> ⚠️ **`rawPrice` est la base du montant versé au marchand** : `settleDelivery`
> calcule `items_real` depuis les `rawPrice` figés, dans les **deux** régimes,
> pour que le fastfood touche son prix exact et ne soit jamais le résidu de la
> cascade. Voir [pricing-settlement.md](./pricing-settlement.md).
>
> Ce qui est **encaissé** reste, lui, contrôlé par `validatePaymentAmount` sur
> `price` — un `rawPrice` falsifié ne change donc pas ce que le client paie, mais
> il changerait la répartition. Le risque est accepté tel quel : revalider
> rejetterait à tort les commandes passées pendant une édition de menu.

---

## Quantité — asymétrie voulue

Le supplément est porté par le prix **unitaire**, donc facturé sur **chaque
exemplaire**. Le fastfood, lui, ne touche qu'**une seule course**. Tout l'écart
revient à la plateforme — c'est le levier de marge.

Plat 2000, zone max 1000, zone réelle 500, marge 100, **quantité 2** :

|                            | Montant             |
| -------------------------- | ------------------- |
| Supplément facturé au user | 2 × 1100 = **2200** |
| Course versée au fastfood  | **500** (une seule) |
| Marge plateforme           | **1700**            |
