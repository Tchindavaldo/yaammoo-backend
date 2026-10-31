# Tarification — les deux frais

Deux prélèvements **distincts**, souvent confondus. Les nommer correctement est
la moitié du travail :

| Frais                       | Qui le prend                                    | Sur quoi                                        | Réglage                                            |
| --------------------------- | ----------------------------------------------- | ----------------------------------------------- | -------------------------------------------------- |
| **Frais de paiement**       | l'agrégateur ACTIF, via MobileWallet            | le montant **encaissé**                         | par agrégateur — voir ci-dessous                   |
| **Frais de retrait kiosque**| l'**opérateur mobile** (MTN / Orange)           | l'argent que le marchand **sort** au kiosque    | `withdrawal_fee_mtn_*` / `withdrawal_fee_orange_*` |

> ⚠️ Ne jamais appeler les frais de paiement « commission MTN ». Les frais de
> retrait kiosque (54 F / 1,2 % + 4) restent dus **quel que soit l'agrégateur** :
> ils couvrent le marchand qui retire son argent chez Orange/MTN.

## Frais de paiement — un barème PAR agrégateur

Source unique : [paymentFees.js](../src/services/pricing/paymentFees.js).
Agrégateur actif : `settings_deployment.payment_aggregator` (base, migration 065) (`pawapay` | `digikuntz`). Chaque
agrégateur garde **ses propres clés** dans `settings_pricing` (migration 063) :
basculer de l'un à l'autre ne touche jamais au barème de l'autre.

| Agrégateur | Clés                                                                                                    | Formule (P = montant payé)                                    |
| ---------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| DigiKUNTZ  | `payment_fee_percent` (5)                                                                                | ⌈5 % × P⌉                                                      |
| pawaPay    | `pawapay_deposit_fee_{mtn,orange}_percent` (1,75 / 1,77), `pawapay_mw_commission_percent` (0,1), `pawapay_payout_fee_{mtn,orange}_percent` (1,3 / 1) | ⌈dépôt[n] × P⌉ + ⌈commission MW × P⌉ + ⌈réserve[n] × P⌉ |

> **DigiKUNTZ n'a pas de clé de commission MobileWallet séparée** : ses 5 % sont
> un taux TOUT COMPRIS, commission MW incluse. C'était déjà le fonctionnement
> avant pawaPay ; on l'a laissé tel quel (ni renommé ni scindé) pour ne rien casser.

**pawaPay, en détail** — chaque frais est calculé sur P et arrondi à l'excès
**séparément**, comme MobileWallet (`core/fees.py`) :

- **dépôt** : ce que prend pawaPay sur l'encaissement ;
- **commission MobileWallet** ;
- **réserve de retrait** : MobileWallet la prélève **au dépôt** pour payer plus
  tard le virement vers le marchand sur le **même réseau**. C'est pourquoi un
  retrait même réseau coûte 0 F au marchand. Le même taux sert de frais
  **interréseau** quand le marchand retire vers l'autre réseau (voir
  [wallet.md](./wallet.md#frais-dun-retrait)).

Total : MTN 3,15 %, Orange 2,87 %.

**Réseau inconnu** (prix affiché sur le home : le client n'a pas encore choisi
MTN ou Orange) → barème du réseau **le plus cher** (MTN), pour que les frais
soient couverts dans tous les cas. Quand le client paie par Orange, l'écart
(~0,28 %) revient à la marge. Au **règlement**, le réseau et l'agrégateur réels
du paiement sont connus (`pending_payments`) : ce sont eux qui servent.

## Ce que couvre le prix d'un plat (pawaPay)

```
base + frais de retrait kiosque (54 F, ou 1,2 % + 4 au-dessus de 4 200)
  → + dépôt pawaPay (1,75 %) + commission MobileWallet (0,1 %) + réserve de retrait (1,3 %)
  → arrondi au pas (500), inchangé
```

`withAllFees` cherche le plus petit P tel que
`P − ⌈1,75 % P⌉ − ⌈0,1 % P⌉ − ⌈1,3 % P⌉ ≥ base + retrait kiosque`
(`grossUpForPaymentFees`). DigiKUNTZ garde sa formule historique
`⌈(base + retrait) / (1 − 5 %)⌉`, inchangée.

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
payé = (base + frais de retrait) / (1 − commission)      (DigiKUNTZ)
payé = plus petit P couvrant base + retrait               (pawaPay, arrondis séparés)
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
