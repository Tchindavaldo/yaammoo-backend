# Tarification — vérité comptable (règlement)

Ce qui est réellement **versé** à chacun, et où c'est tracé.

> **Prérequis** : [pricing.md](./pricing.md) — distinction zone max / course
> réelle. Sans elle, aucun montant de ce fichier n'est lisible.

| Besoin                                    | Fichier                                                  |
| ----------------------------------------- | -------------------------------------------------------- |
| Composition du prix affiché, réglages     | [pricing.md](./pricing.md)                               |
| Commission agrégateur vs frais de retrait | [pricing-fees.md](./pricing-fees.md)                     |
| Régimes `fastfood` / `platform`, arrondi  | [pricing-delivery-modes.md](./pricing-delivery-modes.md) |
| Recalcul du montant encaissé              | [payment-amount-check.md](./payment-amount-check.md)     |
| Crédit marchand, solde, retraits          | [wallet.md](./wallet.md)                                 |
| Gratuité (bonus / campagne)               | [bonus.md](./bonus.md)                                   |

---

## L'ordre de la cascade — qui est le résidu

`services/order/settleDelivery.service.js` redescend la cascade dans l'ordre
inverse de sa composition :

```
itemsCharged   = order.total                       (plat affiché + course réelle)
paymentFee     = feeIncludedIn(itemsCharged, 5 %)  (commission agrégateur)
withdrawalFee                                       (une fois par boutique)
net            = itemsCharged − paymentFee − withdrawalFee

itemsReal      = Σ rawPrice figés                  ← FIGÉ, jamais le résidu
driverAmount   = tarif de la zone (plafonné)       ← dû
platformMargin = net − itemsReal − driverAmount    ← LE RÉSIDU
```

**La marge est la seule variable d'ajustement.** Le fastfood touche son prix
exact dans les deux régimes, la course est due au tarif de la zone, et tout ce
qui reste — arrondi vers le haut, écart de zone, commission prise sur la course —
tombe dans `platform_margin`.

> ⚠️ **Corrigé.** `items_real` était le résidu en régime `fastfood`. Comme la
> course est ajoutée à `order.total`, la commission de 5 % porte aussi sur elle,
> et cette part sortait de la poche du marchand :
>
> ```
> plat brut 2000, zone max 1000, course 250, marge 100, retrait 54
> client paie 3570 → commission 179, retrait 54 → net 3337
>
> AVANT : items_real = 3337 − 1000 − 100 − 250 = 1987   marchand 2237 ✗
> APRÈS : items_real = 2000 (figé)                       marchand 2250 ✓
>         platform_margin = 3337 − 2000 − 250 = 1087
> ```
>
> Les 13 F d'écart (5 % de 250) reviennent à la marge, pas au marchand.

---

## Les deux tables

**Écrites par `settleDelivery.service.js`.** La séparation est volontaire :
_toute_ commande a un règlement, mais seules les commandes **livrées** ont une
course. Créer une ligne « deliveries » pour une commande à emporter serait
incohérent, et pénible à exploiter en statistiques.

### `order_settlements` — l'ARGENT (une ligne par commande, **toujours**)

| Colonne                                     | Sens                                                    | Audience                 |
| ------------------------------------------- | ------------------------------------------------------- | ------------------------ |
| `items_real`                                | plat + extras + boissons aux `rawPrice` figés           | le **fastfood**          |
| `items_charged`                             | ce que le user a payé (TTC, course comprise)            | le **user**              |
| `payment_fee`                               | la commission **contenue** dans `items_charged`         | l'**agrégateur**         |
| `withdrawal_fee`                            | coût de sortie chez l'opérateur (une fois par boutique) | l'**opérateur**          |
| `withdrawal_group_id` / `withdrawal_billed` | qui porte la ponction                                   | front + comptabilité     |
| `driver_amount`                             | ce qui revient à la course, arrondi absorbé             | le **livreur**           |
| `platform_margin`                           | **le résidu**                                           | **Yaammoo**              |
| `delivered`                                 | `false` = à emporter → marge pure                       | comptabilité             |
| `group_id`                                  | panier du client, recopié d'`orders`                    | agrégation sans jointure |

`driver_amount` est **distinct** de `order_deliveries.real_price` : ce dernier est
le tarif de la zone AVANT amortissement.

Le livreur plateforme est payé **à la livraison**, pas au paiement — une course
annulée en chemin ne se paie pas (`services/transaction/creditDriver.service.js`,
transaction `driver_credit`, idempotente). Voir [wallet.md](./wallet.md).

### `order_deliveries` — la COURSE (uniquement si **livrée**)

| Colonne                   | Sens                                                | Audience               |
| ------------------------- | --------------------------------------------------- | ---------------------- |
| `real_price`              | prix de la zone choisie, au tarif du type           | le **fastfood**        |
| `charged_price`           | zone max × quantité, telle que fondue dans le prix  | le **user**            |
| `platform_margin`         | écart de zone + marge, pour cette course            | **Yaammoo**            |
| `delivery_group_id`       | relie les commandes d'un même panier **+ boutique** | —                      |
| `course_billed`           | `true` sur une seule ligne du groupe                | comptabilité           |
| `free_reason`             | `bonus` \| `campaign` \| null                       | motif de gratuité      |
| `covered_by`              | `fastfood` \| `platform`                            | qui renonce au montant |
| `bonus_id` / `bonus_code` | bonus appliqué                                      | suivi                  |

**`platform_margin` n'est jamais négatif** (contrainte SQL) : une gratuité fait
renoncer à un gain, elle ne crée pas une dépense.

---

## Panier : une seule course par boutique

Une commande = **un plat**. Un panier de 3 plats fait donc 3 commandes, alors que
le livreur ne se déplace qu'une fois.

Plutôt que de mettre `real_price = 0` sur les commandes non facturées — ce qui
effacerait l'information — **le prix réel de la zone est conservé sur chaque
ligne**, et `course_billed` marque celle qui porte réellement la course.
`delivery_group_id` les relie.

> La comptabilité somme `real_price WHERE course_billed = TRUE`.

Deux boutiques dans un même panier = **deux courses**, chacune facturée une fois.
La clé de groupe est `services/pricing/deliveryGroupKey.js` —
`fastFoodId | zone | type | date` (+ `time` en `type === 'time'`) — **partagée**
entre `validatePaymentAmount` (ce qui est facturé) et `settleDelivery` (ce qui
est versé). Deux départs distincts de la même boutique (express + programmé, ou
deux zones) = **deux courses**.

`delivery_group_id` et `course_billed` sont **lisibles par le front**
(`deliveryGroupId` / `courseBilled` sur les GET commandes) pour que le client
n'affiche pas N frais de livraison là où il n'y a qu'une course. Les montants de
la table restent, eux, strictement comptables. Voir [orders.md](./orders.md).

---

## À emporter : marge pure

Le supplément livraison (zone max) est fondu dans le prix du plat **depuis le
home**, avant que le user ait choisi son mode. S'il vient chercher sa commande
lui-même, il l'a donc déjà payé — mais il n'y a **aucune course à verser**. La
course réelle n'est, elle, jamais ajoutée au total dans ce cas.

|                           | Livré (zone réelle 500)          | À emporter           |
| ------------------------- | -------------------------------- | -------------------- |
| Ligne `order_settlements` | ✅                               | ✅                   |
| Ligne `order_deliveries`  | ✅                               | **aucune**           |
| `delivered`               | `true`                           | **`false`**          |
| Course ajoutée au total   | 500                              | **0**                |
| `platform_margin`         | zone max − course versée + marge | **zone max + marge** |

`delivered` reste un champ **explicite** sur le règlement, alors qu'on pourrait
le déduire de l'absence de ligne `order_deliveries` : une statistique sur la
marge pure ne doit pas dépendre d'un `LEFT JOIN … IS NULL`.

> Ces commandes étaient auparavant **ignorées** : ni marge ni frais n'étaient
> tracés.

### Gratuité — qui renonce

- Bonus **de boutique** → `covered_by = 'fastfood'` : le marchand renonce à sa
  course, la plateforme conserve intégralement ce qu'elle avait ajouté.
- Bonus **plateforme** / campagne → `covered_by = 'platform'` : Yaammoo renonce
  à sa marge livraison ; la marge plat est conservée.

Livraison offerte, plat brut 2000, zone max 1000, zone réelle 250 (le client paie
le plat affiché seul, 3320 → net 3100) :

|            | `covered_by = fastfood`        | `covered_by = platform` |
| ---------- | ------------------------------ | ----------------------- |
| fastfood   | **2000** (renonce à sa course) | **2250**                |
| plateforme | **1100**                       | **850**                 |

**Non bloquant** : les commandes existent déjà quand on écrit ici. Un incident
comptable ne doit pas faire échouer une commande payée — il est journalisé
bruyamment.

---

## `platform_revenues` — socle, pas encore alimenté

⚠️ **Aucun code n'écrit dans cette table à ce jour.** Elle est posée d'avance
(migration 024) parce que la marge ne viendra pas que des commandes : flyers,
mise en avant d'une boutique, abonnements. Ces recettes n'ont **pas d'`order_id`**
et ne peuvent donc pas entrer dans `order_settlements`, dont la clé primaire
_est_ `order_id`.

| Table               | Portée                                                            |
| ------------------- | ----------------------------------------------------------------- |
| `order_settlements` | le détail d'**une commande** — source de vérité                   |
| `platform_revenues` | l'agrégat de **toutes les sources** (`source_type` + `source_id`) |

Les extras et boissons sont déjà couverts par `order_settlements` : ils font
partie de la commande, leur marge est dans `platform_margin`.

---

## Quand le règlement se déclenche

**Au passage en `pending`**, c'est-à-dire quand la commande devient réelle
(payée). **Jamais à la mise au panier** : un panier peut encore être vidé.

| Chemin           | Point d'entrée                                       | Ce qui arrive                                             |
| ---------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| **Panier**       | `updateOrders` — transition `pendingToBuy → pending` | Le lot arrive en **un seul appel** : c'est lui, le panier |
| **Achat direct** | `createOrderService`, si `status === 'pending'`      | Une seule commande                                        |

C'est parce que `updateOrders` reçoit le **tableau complet** qu'on peut ne
compter qu'une course par boutique et ne consommer le bonus qu'une fois. Aucun
identifiant de panier n'est nécessaire : le lot **est** le panier.

`POST /transaction`, `mwVerdictService` et le mode Apple Review ne sont **pas
modifiés** : ils appellent déjà ces deux services. Voir [payment.md](./payment.md).

> ⚠️ **Cas résiduel** : si un même paiement contient plusieurs commandes _sans
> `id`_ (plusieurs achats directs d'un coup), `mwVerdictService` les crée une par
> une, en appels séparés — chacune comptera sa course. D'après le front, l'achat
> direct ne concerne qu'un plat à la fois.

### Pas de rupture de compatibilité

`orders.delivery` (JSONB) n'est **ni supprimé ni modifié** : les apps en
production le lisent tel quel. `order_deliveries` le **complète**. Le seul ajout
côté réponse est `deliveryOffer`, purement additif et ignoré des anciennes apps.
→ Aucun seuil de version d'app n'est nécessaire ici (cf. CLAUDE.md R11).
