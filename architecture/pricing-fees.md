# Tarification — les deux frais

Deux prélèvements **distincts**, souvent confondus. Les nommer correctement est
la moitié du travail :

| Frais                     | Qui le prend                             | Sur quoi                              | Réglage                                            |
| ------------------------- | ---------------------------------------- | ------------------------------------- | -------------------------------------------------- |
| **Commission agrégateur** | MobileWallet, le prestataire de paiement | le montant **encaissé**               | `payment_fee_percent` (5 %)                        |
| **Frais de retrait**      | l'**opérateur mobile** (MTN / Orange)    | l'argent qui **sort** du portefeuille | `withdrawal_fee_mtn_*` / `withdrawal_fee_orange_*` |

> ⚠️ Ne jamais appeler la commission de 5 % « commission MTN ». MTN et Orange
> n'interviennent que sur le **retrait**.

> **Prérequis** : [pricing.md](./pricing.md) pour la composition du prix affiché.

| Besoin                             | Fichier                                                  |
| ---------------------------------- | -------------------------------------------------------- |
| Composition du prix, réglages      | [pricing.md](./pricing.md)                               |
| Répartition au règlement           | [pricing-settlement.md](./pricing-settlement.md)         |
| Demande de retrait, solde marchand | [wallet.md](./wallet.md)                                 |
| Régimes de livraison               | [pricing-delivery-modes.md](./pricing-delivery-modes.md) |

---

## Les frais de retrait entrent dans le prix

Encaisser ne suffit pas : l'argent doit **sortir** du portefeuille MTN ou Orange,
et ce retrait coûte. Ce coût était supporté en silence ; il est désormais fondu
dans le prix affiché, comme la commission de l'agrégateur.

Barème à **seuil**, par opérateur (`services/pricing/withdrawalFees.js`) :

```
montant <  seuil  →  frais FIXE           (54 F)
montant >= seuil  →  pourcentage + fixe   (1,2 % + 4 F)
```

Valeurs par défaut : `threshold` 4200, `flat` 54, `percent` 1,2, `addend` 4.

> ⚠️ Un jeu de clés PAR opérateur. Mêmes valeurs aujourd'hui, mais un opérateur
> qui change son barème ne doit pas entraîner l'autre.

Les deux frais ne s'additionnent pas naïvement : la commission est un pourcentage
du prix **payé**, alors que le retrait porte sur ce qui reste **après** elle.

```
payé = (base + frais de retrait) / (1 − commission)
```

Extras et boissons portent eux aussi le retrait, en plus de la commission.

> ⚠️ La **course réelle** (`delivery.prix`) est ajoutée au total **sans** repasser
> par cette formule : elle n'est connue qu'à la commande. La commission porte donc
> aussi sur elle, et cette part-là revient à la **marge** — jamais au marchand.
> Voir [pricing-settlement.md](./pricing-settlement.md).

---

## Frais de retrait — UNE ponction par BOUTIQUE

Le prix affiché porte le frais sur **chaque plat** : au moment où il est composé,
sur le home, le panier n'existe pas encore. Mais l'argent d'une même boutique
sort du portefeuille opérateur **en une fois**.

Panier de 10 plats à 2000, même boutique :

```
facturé au client : 54 × 10           = 540
frais réel        : 20 000 → 1,2 % + 4 = 244
écart                                  = 296  → marge plateforme
```

Le règlement ne prélève donc **qu'une fois** par boutique, sur le total encaissé,
et le porte sur UNE commande (celle qui porte déjà la course quand il y en a
une) ; les autres ont `withdrawal_fee = 0`. L'écart avec ce qui a été facturé
revient à la plateforme, exactement comme l'écart de zone.

> ⚠️ Groupé sur **`fastFoodId` seul** — pas sur `deliveryGroupKey`. Le retrait ne
> dépend ni de la zone, ni du créneau, ni du mode de livraison : c'est le
> portefeuille de la boutique qui se vide, tous départs confondus. C'est la
> différence avec la course, qui elle se groupe par DÉPART.

Le barème étant à seuil, découper coûte toujours plus cher que regrouper :

| Panier   | Par commande  | En une fois  | Écart |
| -------- | ------------- | ------------ | ----- |
| 2 × 2000 | 54 + 54 = 108 | 4000 → 54    | 54    |
| 2 × 3000 | 54 + 54 = 108 | 6000 → 76    | 32    |
| 2 × 5000 | 64 + 64 = 128 | 10 000 → 124 | 4     |

---

## Comment le front sait qui porte le frais

Trois champs, à la racine de la commande — même lecture que la course :

| Champ                 | Sens                                  |
| --------------------- | ------------------------------------- |
| `withdrawalGroupId`   | commandes partageant la même ponction |
| `withdrawalFeeBilled` | `true` sur celle qui la porte         |
| `withdrawalFee`       | le montant, `0` sur les autres        |

Sans eux, un `withdrawalFee: 0` serait ambigu : groupé ? réglages illisibles ?
réellement nul ? C'est exactement le rôle de `courseBilled` pour la livraison
(voir [orders.md](./orders.md)).

`withdrawalGroupId` est un **id généré et stocké**
(`order_settlements.withdrawal_group_id`), comme `deliveryGroupId` — jamais une
clé composée exposée au front.

Le groupe réunit les commandes d'un même **panier** ET d'une même **boutique** :
un panier chez deux boutiques vide DEUX portefeuilles, donc porte deux groupes ;
et deux paniers passés des jours différents chez la même boutique sont deux
paiements distincts, donc deux ponctions aussi.

Panier chez deux boutiques :

```
wg_abc (ff1)  →  A  withdrawalFee 65, billed true
                 B  withdrawalFee  0, billed false
wg_def (ff2)  →  C  withdrawalFee 54, billed true
```

> Le regroupement s'arrête au panier. Si le marchand attend et retire plusieurs
> paniers d'un coup, il ne paiera qu'un forfait au lieu de N — l'écart reste à la
> plateforme. Aller plus loin est impossible au moment de la commande : on ne
> sait ni quand il retirera, ni ce qu'il aura accumulé d'ici là.

Côté vue marchand, `withdrawalFee` est une **estimation** : le frais réellement
dû porte sur le montant effectivement retiré, qui agrège plusieurs commandes.
Voir [wallet.md](./wallet.md).
