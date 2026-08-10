# Tarification — régime PLATEFORME (`deliveryBy = 'platform'`)

Ce fichier explique le régime où **la plateforme livre elle-même** : comment la
course est fondue dans le prix du plat, pourquoi une livraison offerte n'y coûte
jamais rien, et comment l'express est facturé à part.

Il existe parce que ce régime se raisonne à l'envers du régime `fastfood` : ici
la zone **est** dans le prix du plat, et c'est le livreur — pas la plateforme —
qui absorbe l'arrondi.

> **Prérequis** : [pricing.md](./pricing.md) — composition du prix, frais,
> arrondi au pas. Rien ici n'est lisible sans ça.

| Besoin                              | Fichier                                                  |
| ----------------------------------- | -------------------------------------------------------- |
| Composition du prix, réglages       | [pricing.md](./pricing.md)                               |
| Les deux régimes côte à côte        | [pricing-delivery-modes.md](./pricing-delivery-modes.md) |
| Commission agrégateur vs retrait    | [pricing-fees.md](./pricing-fees.md)                     |
| Répartition au règlement            | [pricing-settlement.md](./pricing-settlement.md)         |
| Régime fastfood, risque de marge    | [pricing-margin-risk.md](./pricing-margin-risk.md)       |
| Minimum de plats sur une gratuité   | [bonus-delivery-offer.md](./bonus-delivery-offer.md)     |

---

## Le fondu, en une page

Le prix affiché d'un plat porte la zone périodique **la plus chère** et la marge,
le tout habillé de ses frais puis calé sur le pas :

```
juste   = withAllFees(brut + zone_périodique_max + marge)
affiché = juste arrondi au pas de 500
```

Trois conséquences, toutes contre-intuitives :

1. **La zone fondue est le MAX, pas celle que le client choisit.** Un client en
   zone à 150 paie le même prix qu'un client en zone à 250 ; l'écart part en
   marge. C'est le modèle, pas un oubli.
2. **L'express n'est PAS dans le fondu** — seul le périodique l'est
   (`PLATFORM_DISPLAY_ZONE_TYPE = 'time'`). Caler tout le catalogue sur l'express
   gonflerait chaque prix pour un mode que la plupart ne prendront pas.
3. **L'arrondi peut DESCENDRE**, contrairement au régime fastfood. Le manque à
   gagner est absorbé par la course du livreur, dans la limite de
   `driver_amortization_max` (100). Au-delà, on monte.

> ⚠️ Ne pas confondre avec le régime `fastfood`, où plus aucune zone n'est fondue
> et où la course est facturée à part au tarif réel.

---

## L'asymétrie qui fait la marge

**Le fondu est facturé sur CHAQUE plat. La course reste UNIQUE par commande.**

C'est tout le levier économique du régime. Sur un plat brut 2000 (affiché 2500),
zone 250, marge 100 :

### 1 plat

```
client paie          2500
− commission 5 %      125
− retrait (2375<4200)  54
= net                2321

− fastfood (2000×1)  2000
= reste               321
− marge due           100
= dispo livreur       221
  course due          250  →  il touche 221, ABSORBE 29
  marge réelle        100
```

### 2 plats

```
client paie          5000
− commission 5 %      250
− retrait (4750≥4200)  61
= net                4689

− fastfood (2000×2)  4000
= reste               689
− marge due           200
= dispo livreur       489
  course due          250  →  il touche 250, ABSORBE 0
  reliquat            239  →  part en marge
  marge réelle        439
```

### 3 plats

```
marge réelle          785
```

Lecture directe :

```
qty 1 : 1 fondu encaissé, 1 course à payer  → équilibre juste, 29 manquent
qty 2 : 2 fondus encaissés, 1 course        → 1 fondu entier en trop → +239
qty 3 : 3 fondus encaissés, 1 course        → 2 fondus en trop       → +485
```

Le saut de 100 à 439 entre 1 et 2 plats, c'est le deuxième fondu qui n'a plus
aucune course en face.

---

## Les bandes — la marge dépend de la POSITION dans le pas

Le prix brut ne détermine pas la marge. Ce qui compte, c'est où le prix juste
tombe dans le pas de 500 — exactement le même phénomène que le surplus d'arrondi
côté fastfood.

Zone 250, marge 100, livraison offerte :

| brut   | affiché | gonfl. | qty1 abs. | qty1 marge | qty2 marge | qty3 marge |
| -----: | ------: | -----: | --------: | ---------: | ---------: | ---------: |
|  1 000 |   1 500 |    500 |         0 |        121 |        546 |        969 |
|  1 500 |   2 000 |    500 |         4 |        100 |        496 |        877 |
|  2 000 |   2 500 |    500 |        29 |        100 |        439 |        785 |
|  2 500 |   3 000 |    500 |        54 |        100 |        377 |        693 |
|  3 000 |   3 500 |    500 |        79 |        100 |        316 |        601 |
|  3 400 |   4 000 |    600 |         4 |        100 |        454 |        809 |
|  3 500 |   4 500 |  1 000 |         0 |        469 |      1 193 |      1 917 |
|  3 900 |   4 500 |    600 |        31 |        100 |        393 |        717 |
|  4 000 |   5 000 |  1 000 |         0 |        439 |      1 132 |      1 825 |
|  5 000 |   6 000 |  1 000 |         0 |        377 |      1 009 |      1 640 |
|  7 000 |   8 000 |  1 000 |         0 |        254 |        763 |      1 272 |
| 10 000 |  11 000 |  1 000 |        30 |        100 |        395 |        719 |

`abs.` = ce que le livreur absorbe sur sa course de 250. Aucune colonne
`qty2 abs.` : dès 2 plats elle vaut **0** partout.

Le motif se répète tous les 500 de brut :

```
3400 → marge 100    fin de bande   (gonflement minimal, tout part en course)
3500 → marge 469    début de bande (gonflement maximal)      ← saut
3900 → marge 100    fin de bande
4000 → marge 439    début de bande                           ← saut
```

> ⚠️ Un échantillon pris sur les multiples ronds (1000, 2000, 3000…) **masque ces
> bandes** et donne l'illusion d'une marge stable à 100. Toujours balayer au pas
> de 10 ou 100 pour voir le vrai comportement.

Le gonflement passe de 500 à 1000 au-dessus de 4200 de brut : le franchissement
du seuil de retrait pousse le prix juste par-dessus le palier, forçant un pas
entier de plus. Ce pas est bien plus large que nécessaire, d'où des marges déjà
grasses sur un seul plat (439 à brut 4000).

---

## Livraison OFFERTE — aucun minimum de plats

**En régime plateforme, une gratuité ne coûte rien à financer.** Aucun garde-fou
de quantité n'est appliqué :

```js
if (coveredBy !== 'platform' || isPlatformDelivered(fastfood)) {
  return { affordable: true, minItems: 0, missing: 0 };
}
```

`services/bonus/deliveryOfferAffordability.js`

La raison est structurelle, pas empirique : le fondu vaut `zone + marge` **tous
frais inclus**. Il couvre donc la course par construction, quelle que soit sa
valeur. Seul l'arrondi crée un écart, et il est déjà borné par
`driver_amortization_max`.

Balayage exhaustif — brut 500 → 50 000 (pas de 10), zone 250, marge 100 :

```
absorption maximale à 1 plat  : 100   (brut 43 390)
marge minimale à 1 plat       : 100
cas où 2 plats absorbent encore :  0
```

L'absorption atteint **exactement** la borne de 100 sans jamais la franchir —
c'est `roundToStep` qui l'y contraint : quand la descente coûterait plus, il
monte au lieu de descendre.

> ⚠️ Contraste avec le régime `fastfood`, où la marge ne porte plus aucune zone :
> offrir une course y coûte réellement de l'argent, d'où le minimum de plats de
> [bonus-delivery-offer.md](./bonus-delivery-offer.md). Les deux régimes ne se
> raisonnent pas de la même façon.

### Ce que le bonus change pour le client

Sans bonus, la course de 250 est payée **en plus** du prix affiché et versée au
livreur ; le fondu tombe alors intégralement en marge :

```
sans bonus, 1 plat : client 2750 → marge 308
avec bonus, 1 plat : client 2500 → marge 100
```

Le bonus te fait donc **renoncer à 208**, pas perdre de l'argent.

---

## Zones EXPRESS — facturées à part, frais inclus

L'express n'étant pas dans le fondu, il était facturé **brut** : la commission et
le retrait étaient prélevés dessus sans jamais avoir été encaissés, et c'est le
livreur qui absorbait la différence.

```
zone périodique 250, zone express 400, plat affiché 2500

net 2321 − items 2000 − marge 100 = 221 pour le livreur

  course périodique 250 → absorbe  29   tolérable
  course express    400 → absorbe 179   ← bien au-delà des 100
```

L'express porte donc désormais ses frais, comme un extra ou une boisson : `prix`
est ce que paie le client, `rawPrice` ce que touche le livreur.

```
zone express 400
  retrait 400 < 4200              → forfait 54
  juste = ceil((400 + 54) / 0,95) = 478
  affiché = 500                     (pas de 500, toujours vers le HAUT)

client paie 500 → commission 25 → retrait 54 → livreur touche 400. Absorption 0.
```

| zone brute | affiché | livreur touche |
| ---------: | ------: | -------------: |
|        400 |     500 |            400 |
|        700 |   1 000 |            700 |
|      1 200 |   1 500 |          1 200 |

> ⚠️ On **DIVISE** par `(1 − commission)`. `400 × 1,05` laisserait la commission
> porter sur 420 et oublierait le retrait.

> ⚠️ Le forfait de retrait est appliqué à la zone **isolée**, alors qu'en réalité
> le retrait porte une seule fois sur le total de la commande. On facture donc
> jusqu'à 54 F pour un surcoût réel de 5 F au maximum (400 × 1,2 %) :
>
> ```
> total  2 900 → retrait  54, il aurait été  54 sans la zone → coût réel 0
> total  4 400 → retrait  57, il aurait été  54 sans la zone → coût réel 3
> total 12 000 → retrait 148, il aurait été 143 sans la zone → coût réel 5
> ```
>
> L'écart est **toujours** en faveur de la plateforme. Modéliser le seuil
> exactement supposerait de connaître le total de la commande au moment où la
> zone est affichée — or le panier n'existe pas encore.

> ⚠️ Les zones **périodiques restent brutes** : déjà fondues dans le prix du
> plat, les habiller les ferait payer deux fois.

Le pas d'arrondi de l'express est **distinct** de celui des plats
(`express_price_rounding_step`) : un pas de 500 sur une course de 400 à 1400 est
grossier, et l'écart revient intégralement à la plateforme. Toujours vers le
haut, jamais d'amortissement — le livreur n'a pas à financer l'arrondi.

---

## Comptabilisation — `chargedPrice`

`splitDeliveryAmounts` enregistre ce qui a été facturé au titre de la livraison :

```
chargedPrice = zone_périodique_max × quantity        (le fondu)
             + prix_affiché_express                  (si express, une seule fois)
```

Deux pièges déjà rencontrés :

- **La liste consultée doit être la MÊME que celle de la composition**
  (`PLATFORM_DISPLAY_ZONE_TYPE`). Quand la composition fondait le périodique
  (250) et que la répartition facturait le max des deux listes (400, l'express),
  `charged_price` enregistrait 150 F de marge fantôme par commande.
- **Le périodique est facturé × quantity, l'express une seule fois** : le premier
  est un supplément par plat, le second une course.

Le fondu est facturé **même en retrait** : le supplément est intégré depuis le
home, avant que le user ait choisi. S'il vient chercher lui-même, il n'y a aucune
course à verser et le montant part intégralement en marge. Modèle retenu, pas un
oubli.

---

## Réglages concernés

| Clé                           | Valeur | Rôle                                                          |
| ----------------------------- | -----: | ------------------------------------------------------------- |
| `price_rounding_step`         |    500 | Pas d'arrondi des plats — crée le gonflement et les bandes    |
| `driver_amortization_max`     |    100 | Ce que le livreur absorbe au maximum sur sa course            |
| `platform_margin`             |    100 | Marge fondue par plat, régime plateforme                      |
| `express_price_rounding_step` |    500 | Pas d'arrondi des zones express (migration 040), vers le haut |
| `payment_fee_percent`         |      5 | Commission agrégateur                                         |
| `withdrawal_fee_mtn_*`        |      — | Barème à seuil : 54 sous 4200, sinon 1,2 % + 4                |

> ⚠️ Changer `price_rounding_step`, `driver_amortization_max` ou
> `payment_fee_percent` **invalide tous les chiffres de ce fichier**. Rejouer le
> balayage avant de conclure quoi que ce soit.

### Rejouer le balayage

Calcul ponctuel, pas un test automatisé. Mêmes fonctions que la production —
`withAllFees`, `roundToStep` (`services/pricing/deliveryPricing.js`) :

```
affiché = roundToStep(withAllFees(brut + zone + marge), {step:500, amortizationMax:100})
total   = affiché × qty
net     = total − commission(total) − retrait(total − commission)
dispo   = net − brut×qty − marge×qty
absorbé = zone − min(zone, dispo)
marge   = net − brut×qty − min(zone, dispo)
```
