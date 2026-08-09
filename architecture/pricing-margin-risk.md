# Tarification — risque de marge et plafond de livraison

Ce fichier trace **les analyses chiffrées** qui ont fixé
`fastfood_min_covered_course` à **1400**, et **ce qu'on a accepté de perdre**.

Il existe pour une raison précise : le jour où l'on voudra relever le plafond de
livraison, il faut pouvoir dire _combien on est prêt à perdre en plus_ sans
refaire toute l'étude. Les tableaux plus bas donnent la réponse directement.

> **Prérequis** : [pricing.md](./pricing.md) — composition du prix, marge par
> palier, arrondi au pas. Rien ici n'est lisible sans ça.

| Besoin                            | Fichier                                                  |
| --------------------------------- | -------------------------------------------------------- |
| Composition du prix, réglages     | [pricing.md](./pricing.md)                               |
| Régimes de livraison, arrondi     | [pricing-delivery-modes.md](./pricing-delivery-modes.md) |
| Commission agrégateur vs retrait  | [pricing-fees.md](./pricing-fees.md)                     |
| Répartition au règlement          | [pricing-settlement.md](./pricing-settlement.md)         |
| Minimum de plats sur une gratuité | [bonus-delivery-offer.md](./bonus-delivery-offer.md)     |

---

## Le mécanisme en une page

En régime `fastfood` (migration 038), le prix du plat ne porte **que la marge**.
La course est facturée à part, au tarif réel. Ce qui absorbe les frais prélevés
sur cette course, c'est le **surplus d'arrondi** :

```
juste   = ceil((brut + marge + retrait) / (1 − commission))
affiché = juste ↑ 500
surplus = affiché − juste
```

Le surplus ne dépend **pas de la hauteur** du prix, mais de la position du juste
dans le pas :

```
brut  640 → juste  942 → affiché 1000 → surplus  58
brut  660 → juste  963 → affiché 1000 → surplus  37
brut  700 → juste 1005 → affiché 1500 → surplus 495
```

Deux garde-fous en découlent, aux deux bouts de la même valeur :

| Garde-fou         | Où                  | Règle                                                   |
| ----------------- | ------------------- | ------------------------------------------------------- |
| Prix de menu      | `POST/PUT /menu`    | le surplus doit couvrir ≥ `fastfood_min_covered_course` |
| Zone de livraison | `PUT /fastFood/:id` | la course ne doit pas dépasser cette même valeur        |

Les deux ensemble garantissent que, sur toute commande valide, le surplus
absorbe (presque) tout ce qui est prélevé sur la course.

---

## Ce que le surplus doit couvrir — l'erreur initiale

La première formule divisait le surplus par la **seule commission** (5 %) :

```
covered = surplus / 0,05        ← FAUX
```

Elle ignorait que la course fait aussi monter le **frais de retrait**. Sur le cas
qui l'a révélé :

```
brut 6670, affiché 7500, surplus 70

commission sur 1400 de course :  70   ← couvert pile
hausse du frais de retrait    :  16   ← non couvert
                                        → marge 279 au lieu de 300
```

La formule retenue divise donc par **commission + taux de retrait** (6,2 %) :

```
covered = surplus / (payment_fee_percent + withdrawal_percent)
```

> ⚠️ Baisser le seuil ne corrigeait rien : à 1400, 1200, 1000, 800, 600 ou 500,
> l'écart restait négatif. Le problème était le **diviseur**, pas le seuil.

### Le seuil de 4 200 — une approximation assumée

Le barème de retrait est à **seuil** : forfait de 54 F en dessous de 4 200,
`1,2 % + 4` au-dessus. Le diviseur du garde-fou applique pourtant `1,2 %`
**partout**, y compris sous le seuil où le forfait ne bouge pas d'un franc quand
la course s'ajoute.

C'est volontairement **conservateur** : on surestime ce qu'il faudra absorber,
donc on refuse quelques prix qui auraient pu passer. Jamais l'inverse.

Coût mesuré, plafond 1400 :

```
prix refusés au total        : 875
dont la marge aurait tenu    :  10   = 1,1 %
```

Modéliser le seuil exactement supposerait de connaître le total de la commande
au moment où le prix du menu est saisi — impossible : la course n'existe pas
encore, et le panier non plus.

> ⚠️ Le forfait ne protège pas de tout : sous 4 200, le retrait reste à 54 mais
> **la commission porte bien sur la course**. Brut 640, affiché 1000, course
> 1400 → total 2400, retrait 54, mais marge **186** au lieu de 200. Le refus
> reste justifié.

---

## Ce qui reste, et qu'on a ACCEPTÉ

Même avec la bonne formule, la marge n'est **pas garantie au franc près**. Trois
arrondis au supérieur s'empilent — prix juste, commission, retrait — et laissent
un résidu de quelques francs qu'aucun pourcentage ne capture.

### Balayage exhaustif, plafond 1400

```
brut  100 → 50 000  (pas de 10)
zone   50 →  1 400  (pas de 10)
────────────────────────────────
559 776 combinaisons
    601 en perte     = 0,11 %
    pire perte       = 11 F
```

| Perte | Cas |
| ----- | --- |
| −11 F | 2   |
| −10 F | 8   |
| −9 F  | 14  |
| −8 F  | 19  |
| −7 F  | 32  |
| −6 F  | 47  |
| −5 F  | 64  |
| −4 F  | 80  |
| −3 F  | 94  |
| −2 F  | 111 |
| −1 F  | 130 |

**Décision : accepté.** Une combinaison sur ~900 perd entre 1 et 11 F, jamais
plus. Sur une marge de 200/300, le pire représente **3,7 %**, et seulement quand
le prix brut ET la zone tombent tous deux au plus mauvais endroit.

L'alternative — exiger `surplus ≥ course × 6,2 % + 20 F` — fermait le trou mais
refusait sensiblement plus de prix de menu. Jugé disproportionné pour 11 F.

### Le pire cas, déplié

```
plat brut 9940 + zone 1400

prix juste 10913 → affiché 11000   (surplus 87)
client paie 11000 + 1400 = 12400

− commission        620
− frais de retrait  146
= net             11634

→ fastfood        11340   (9940 + 1400)
→ PLATEFORME        294   au lieu de 300   →  perte 6
```

Le surplus de 87 devait couvrir commission (70) **et** hausse du retrait (23),
soit 93. Il en manque 6.

> ⚠️ Ce cas-ci perd 6 F ; le pire absolu du balayage (11 F) se situe **au-delà
> de 12 000 de brut**. Une première analyse tronquée à 12 000 avait conclu à tort
> que 6 F était le maximum — d'où la plage étendue à 50 000.

---

## Si l'on veut RELEVER le plafond de livraison

C'est la raison d'être de ce fichier. Même balayage, plafond par plafond :

| Plafond            | Menus valides | Combinaisons | Cas en perte | %          | Pire perte |
| ------------------ | ------------- | ------------ | ------------ | ---------- | ---------- |
| 700                | 4 548         | 300 168      | 317          | 0,11 %     | **−9 F**   |
| 1 000              | 4 373         | 419 808      | 530          | 0,13 %     | **−11 F**  |
| **1 400** (retenu) | **4 116**     | **559 776**  | **601**      | **0,11 %** | **−11 F**  |
| 2 000              | 3 747         | 734 412      | 981          | 0,13 %     | **−13 F**  |
| 3 000              | 3 126         | 925 296      | 1 565        | 0,17 %     | **−16 F**  |
| 5 000              | 1 891         | 937 936      | 3 264        | 0,35 %     | **−23 F**  |

Deux effets à lire ensemble :

- **La perte unitaire monte lentement** : doubler le plafond (1400 → 3000) fait
  passer le pire cas de 11 à 16 F. Ce n'est pas là que se joue le coût.
- **Le catalogue se restreint vite** : de 4 116 prix de menu valides à 1 891 en
  passant à 5 000. Un plafond haut exige un surplus élevé, donc refuse beaucoup
  plus de prix.

> Le vrai coût d'un plafond élevé n'est pas la perte de marge, c'est le **nombre
> de prix de menu refusés** — et donc la friction imposée aux marchands.

### Reproduire l'analyse

Le balayage n'est pas un test automatisé : c'est un calcul ponctuel, à rejouer
seulement quand un réglage tarifaire change. Il croise `surplusOf` (garde-fou)
et la cascade de règlement, avec les mêmes fonctions que la production —
`withAllFees`, `roundToStep`, `marginForBrut`, `feeIncludedIn`
(`services/pricing/deliveryPricing.js`).

Pour chaque couple (brut, zone) :

```
tot   = affiché + zone
marge = tot − commission(tot) − retrait(tot − commission) − (brut + zone)
écart = marge − marge_du_palier
```

Un écart négatif est une perte réelle sur cette commande.

---

## Ce que ces garde-fous NE couvrent pas

| Situation                                | Pourquoi ce n'est pas ici                                                                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Livraison **offerte** (bonus plateforme) | la course entière est à financer, pas seulement ses frais — c'est le **minimum de plats** qui protège, voir [bonus-delivery-offer.md](./bonus-delivery-offer.md) |
| Régime `deliveryBy = 'platform'`         | la zone périodique est fondue dans le prix, elle finance déjà la course ; l'arrondi peut y **descendre**                                                         |
| Menus **déjà en base**                   | non contrôlés jusqu'à leur prochaine modification — aucune migration de données                                                                                  |
| Bonus `covered_by = 'fastfood'`          | le marchand renonce à sa course, la plateforme ne finance rien                                                                                                   |

---

## Réglages concernés

| Clé                                           | Valeur     | Rôle                                                                            |
| --------------------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| `fastfood_min_covered_course`                 | 1400       | Plafond de zone **et** exigence de surplus sur les prix de menu (migration 039) |
| `fastfood_margin`                             | 200        | Marge de base, régime fastfood (migration 038)                                  |
| `fastfood_margin_tier_2_min_brut` / `_margin` | 3500 / 300 | Palier 2                                                                        |
| `price_rounding_step`                         | 500        | Pas d'arrondi — c'est lui qui crée le surplus                                   |
| `payment_fee_percent`                         | 5          | Commission agrégateur                                                           |
| `withdrawal_fee_mtn_percent`                  | 1,2        | Entre dans le diviseur de couverture                                            |

> ⚠️ Changer `price_rounding_step` ou `payment_fee_percent` **invalide tous les
> chiffres de ce fichier** : le surplus et le diviseur en dépendent directement.
> Rejouer le balayage avant de conclure quoi que ce soit.
