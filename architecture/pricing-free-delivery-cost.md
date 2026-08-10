# Ce que coûte une livraison OFFERTE — les deux régimes, dépliés

Ce fichier répond à une seule question : **quand offre-t-on la livraison à perte,
et quand est-ce indolore ?**

Il existe parce que l'information était éclatée sur trois fichiers, aucun ne
faisant le calcul de bout en bout : [pricing.md](./pricing.md) compose le prix
mais sans bonus, [pricing-settlement.md](./pricing-settlement.md) donne des marges
négatives sans montrer d'où sortent les montants, et
[bonus-delivery-offer.md](./bonus-delivery-offer.md) donne la formule du minimum
de plats sans la dérouler. Résultat : impossible de dire à quel moment on perd de
l'argent, ni pourquoi.

**Tous les cas ci-dessous sont dépliés étape par étape.** Aucun montant n'est
posé sans qu'on voie d'où il vient — c'est la raison d'être du fichier.

> **Prérequis** : [pricing.md](./pricing.md) — composition du prix, marge par
> palier, arrondi au pas.

| Besoin                                | Fichier                                                        |
| ------------------------------------- | -------------------------------------------------------------- |
| Composition du prix, réglages         | [pricing.md](./pricing.md)                                     |
| Armement / consommation du bonus      | [bonus-delivery-offer.md](./bonus-delivery-offer.md)           |
| Tables comptables, `covered_by`       | [pricing-settlement.md](./pricing-settlement.md)               |
| Régime plateforme en détail           | [pricing-platform-delivery.md](./pricing-platform-delivery.md) |
| Régime fastfood, pertes d'arrondi     | [pricing-margin-risk.md](./pricing-margin-risk.md)             |
| Recalcul du montant payé              | [payment-amount-check.md](./payment-amount-check.md)           |

---

## Le principe, en trois phrases

1. **Le marchand est intouchable.** Il touche son plat (aux `rawPrice` figés)
   **plus sa course**, que le client l'ait payée ou non.
2. **La plateforme est le résidu.** Tout ce qui reste après le marchand et le
   livreur tombe dans `platform_margin` — y compris en négatif.
3. **Offrir la livraison, c'est retirer `delivery.prix` du total payé** sans rien
   retirer de ce qui est dû. L'écart sort donc de la marge.

Ce que ça coûte dépend entièrement du régime :

| Régime     | La course est…                    | Offrir coûte…                              | Comment on offre |
| ---------- | --------------------------------- | ------------------------------------------ | ---------------- |
| `fastfood` | facturée à part, **en plus**      | **de l'argent réel** — la marge peut passer en négatif | **code bonus seul**, via `/bonus/verify` ; minimum de plats calculé |
| `platform` | **fondue** dans le prix du plat   | **un manque à gagner** — jamais une perte  | code, armement **ou campagne globale** ; minimum fixe de 2 plats |

> ⚠️ Deux règles à retenir, posées volontairement :
>
> - **la campagne globale (`delivery_free_mode`) ne s'applique qu'en régime
>   `platform`**, et y respecte le même minimum que les bonus — elle contournait
>   auparavant tout contrôle ;
> - **en régime `fastfood`, l'armement seul ne suffit pas** : le code est
>   obligatoire, pour que `/bonus/verify` annonce le minimum avant le paiement.

---

## Régime FASTFOOD — on peut réellement perdre

### Cas 1 — plat brut 1500, zone 300, 1 plat : on gagne 46

Le prix affiché se compose ainsi (la zone n'y entre PAS) :

```
1500   prix du marchand
+ 200   marge (palier 1, brut < 3500)
= 1700
+  54   frais de retrait
= 1754
÷ 0,95  commission agrégateur 5 %
= 1847   prix juste
→ 2000   arrondi au pas de 500, toujours vers le haut
```

#### D'abord, le même plat SANS bonus — pour avoir le point de comparaison

Le client paie le plat **et** la course, puisque la livraison est due :

```
il paie 2000 + 300 = 2300

− 115   commission agrégateur (5 % de 2300)
−  54   frais de retrait MTN (2185 < 4200 → forfait)
= 2131   en caisse

− 1500   le marchand reprend son prix de menu
−  300   le marchand reprend la course (c'est LUI qui livre)
=  331   pour la plateforme
```

Ces 331 se décomposent ainsi :

```
 200   la marge du palier
+153   le surplus d'arrondi (2000 − 1847)
−  15   la commission prise sur la course (5 % de 300)
−   7   résidu des arrondis au supérieur (commission, retrait, prix juste)
= 331
```

**C'est le mécanisme central du régime fastfood** : le surplus d'arrondi finance
les frais que la course fait naître, et la marge du palier reste intacte.

#### Maintenant, avec le bonus

La course n'est plus ajoutée au total :

```
il paie 2000
```

Ce qui reste après les frais :

```
2000
− 100   commission (5 % de 2000)
−  54   frais de retrait
= 1846   tout ce qu'il y a en caisse
```

Le partage — le marchand passe en premier, plat **et** course :

```
1846
− 1500   son plat
−  300   sa course
=   46   pour la plateforme
```

**Marge 46 au lieu de 331. Le bonus a coûté 285** — mais on reste positif.

### Cas 2 — même plat, zone 800, 1 plat : REFUSÉ avant paiement

> ⚠️ **Cette perte n'arrive jamais.** Le calcul ci-dessous est ce qui se
> produirait **sans** garde-fou. En pratique le user est prévenu avant de payer —
> voir juste après.

Le prix affiché **ne bouge pas** : depuis la migration 038, aucune zone n'entre
dans le prix du plat. Le client paie toujours 2000, la caisse contient toujours
1846. Mais le marchand réclame une course de 800 :

```
1846
− 1500   son plat
−  800   sa course
= −454   PERTE
```

> ⚠️ C'est exactement ce cas que la contrainte SQL `platform_margin >= 0`
> masquait. Elle a été levée (migration 038) : borner à 0 n'annulait pas la
> perte, il la rendait invisible.

**Le seuil de bascule** sur ce plat : `1846 − 1500 = 346`. Toute course au-dessus
de 346 serait offerte à perte, avec un seul plat.

#### Ce que le user voit RÉELLEMENT — il ne subit rien

Le front vérifie le code **avant** le paiement, en passant le contexte de la
commande. Le backend répond avec le nombre de plats à ajouter :

```jsonc
POST /bonus/verify
{ "code": "ABC123", "fastFoodId": "ff_42",
  "order": { "brutUnit": 1500, "quantity": 1, "coursePrice": 800 } }

→ { "valid": false, "reason": "not_affordable",
    "minItems": 3, "missingItems": 2,
    "message": "Ajoutez 2 plats pour bénéficier de la livraison offerte (3 plats minimum pour cette zone)." }
```

Le user sait donc quoi faire pour obtenir sa gratuité. Il n'y a ni surprise, ni
commande refusée sans explication.

Le `minItems` de 3 se calcule ainsi :

```
contribution par plat = (marge 200 + surplus 153) × 0,95 = 335
minItems = plafond(800 / 335) = 3
```

C'est exactement le cas 3 ci-dessous — et il est bénéficiaire.

**Et si le front n'a pas vérifié** : `POST /transaction` refuse en **400** avant
tout appel à MobileWallet, avec le même message. La perte n'est jamais encaissée
— c'est un refus DUR, pas une absorption silencieuse.

> Détail du contrat de `/bonus/verify` :
> [bonus-delivery-offer.md](./bonus-delivery-offer.md) § « Refus DUR ».

### Cas 3 — zone 800, mais 3 plats : on gagne 327

```
il paie 2000 × 3 = 6000
− 300   commission
−  73   retrait
= 5627

− 4500   ses trois plats
−  800   sa course — UNE SEULE, il ne se déplace qu'une fois
=  327   pour la plateforme
```

**C'est tout le mécanisme du garde-fou** : la marge et le surplus d'arrondi sont
facturés sur **chaque** plat, la course reste **unique**. Trois marges encaissées
pour une seule course payée.

### Le garde-fou : minimum de plats, refus DUR

`services/bonus/deliveryOfferAffordability.js`

```
contribution par plat = (marge du palier + surplus d'arrondi) × (1 − commission)
quantité minimale     = plafond( course / contribution )
```

En dessous du minimum, la commande est **refusée en 400 à
`POST /transaction`**, avant tout encaissement. Pas de commande à perte.

Le user est prévenu à l'avance : `POST /bonus/verify` accepte un contexte de
commande et renvoie `reason: 'not_affordable'`, `minItems`, `missingItems` et le
message « Ajoutez N plats pour bénéficier de la livraison offerte ».

> ⚠️ Le minimum se mesure sur le **départ** (`deliveryGroupKey` : même boutique,
> même zone, même créneau), pas sur une commande isolée. Un panier de 3 commandes
> d'un plat qui partent ensemble compte donc **3 plats** — même argent encaissé
> qu'une commande de 3 plats, même course unique à financer. Deux zones
> différentes = deux départs, chacun jugé séparément.

---

## Régime PLATEFORME — on ne perd jamais

La différence tient en une ligne : **la zone périodique est fondue dans le prix
du plat**. Elle est donc déjà encaissée quand on l'offre.

### Cas 4 — plat brut 1500, zone 250, 1 plat

Le prix affiché porte la zone :

```
1500   prix du marchand
+ 250   zone périodique (la plus chère de la liste)
+ 100   marge de base
= 1850
+  54   retrait
= 1904
÷ 0,95
= 2005   prix juste
→ 2000   arrondi — ici on DESCEND de 5, absorbable par le livreur
```

**Sans bonus**, le client paie la course en plus :

```
il paie 2000 + 250 = 2250
− 113   commission
−  54   retrait
= 2083

− 1500   plat du marchand
−  250   course du livreur
=  333   marge
```

**Avec bonus**, il ne paie que le plat :

```
il paie 2000
− 100   commission
−  54   retrait
= 1846

− 1500   plat du marchand
= 346   disponible
− 100   marge due, servie AVANT le livreur
= 246   pour le livreur
  course due 250 → il touche 246, il ABSORBE 4
  marge réelle : 100
```

**Marge 100 au lieu de 333.** On renonce à 233 — on ne perd rien.

### Cas 5 — 2 plats : la marge remonte

```
il paie 2000 × 2 = 4000
− 200   commission
−  54   retrait
= 3746

− 3000   ses deux plats
=  746   disponible
− 200   marge due (100 × 2)
= 546   pour le livreur
  course due 250 → il touche 250, ABSORBE 0
  reliquat 296 → part en marge
  marge réelle : 496
```

Même asymétrie qu'en fastfood : **deux fondus encaissés, une seule course payée**.

### Cas 6 — panier de 2 commandes à 1 plat : identique à 1 commande de 2 plats

Même boutique, même zone, même créneau : les deux commandes partent **ensemble**,
le livreur ne se déplace qu'une fois.

```
il paie 2000 × 2 = 4000     (deux commandes d'un plat)

−  200   commission (5 % de 4000)
−   54   retrait — UNE seule fois pour la boutique
=  3746   en caisse

− 3000   le marchand : ses deux plats
=  746   disponible
−  200   ta marge due (100 × 2)
=  546   pour le livreur
   course due 250 → il touche 250 ENTIERS, absorbe 0
   reliquat 296 → part en marge

ta marge : 200 + 296 = 496
```

| Panier                   | Livreur touche | Il absorbe | Ta marge |
| ------------------------ | -------------- | ---------- | -------- |
| 1 commande × 1 plat      | 246 / 250      | 4          | 100      |
| **2 commandes × 1 plat** | **250 / 250**  | **0**      | **496**  |
| 1 commande × 2 plats     | 250 / 250      | 0          | 496      |

Les deux dernières lignes sont **identiques** : deux fondus encaissés face à une
course unique. Que les plats soient dans une commande ou dans deux ne change rien
à l'argent — d'où le comptage par départ.

### Le minimum de 2 plats — il protège le LIVREUR, pas la marge

Le fondu vaut `zone + marge`, **tous frais inclus**. Il couvre donc la course par
construction, quelle que soit sa valeur : **la marge n'est jamais menacée ici.**
Le seul écart possible vient de l'arrondi vers le bas — et il est borné par
`driver_amortization_max` (100).

Mais borné ne veut pas dire nul. Dans le cas 4 ci-dessus, à un seul plat, le
livreur touche 246 au lieu de 250 : il absorbe 4. Sur d'autres prix de plat il
peut absorber jusqu'à 100. **Dès deux plats, il touche son tarif entier** — un
fondu complet n'a plus de course en face.

D'où un minimum **fixe de 2 plats**, piloté en base
(`platform_free_delivery_min_items_bonus` / `_campaign`, migration 041). Fixe et
non calculé :
l'absorption dépend de la position du prix juste dans le pas d'arrondi, donc du
plat. Un seuil qui varierait d'un plat à l'autre serait inexplicable au user.

Le message renvoyé ne mentionne donc pas la zone, contrairement au régime
fastfood :

```
Ajoutez 1 plat pour bénéficier de la livraison offerte (2 plats minimum).
```

Balayage exhaustif, brut 500 → 50 000 (pas de 10), zone 250 :

```
absorption maximale à 1 plat    : 100   (brut 43 390)
marge minimale à 1 plat         : 100
cas où 2 plats absorbent encore :   0
```

L'absorption atteint **exactement** la borne sans jamais la franchir :
`roundToStep` monte au lieu de descendre dès que la descente coûterait plus.

Ces chiffres disent deux choses distinctes, à ne pas confondre :

| Constat                              | Conséquence                                        |
| ------------------------------------ | -------------------------------------------------- |
| la marge minimale est 100, jamais négative | **aucun risque financier** — le fondu surcouvre |
| l'absorption monte jusqu'à 100 à 1 plat    | **le livreur est rogné** — d'où le minimum de 2 |

```js
if (isPlatformDelivered(fastfood)) {
  const minItems = platformMinItems(pricing, reason); // 2, selon bonus / campagne
  const affordable = qty >= minItems;
  return { affordable, minItems, missing: affordable ? 0 : minItems - qty, fixed: true };
}
```

> ⚠️ Le `fixed: true` change le message : sans zone mentionnée, puisque le seuil
> ne dépend pas d'elle.

---

## Qui renonce : `covered_by`

Tout ce qui précède suppose `covered_by = 'platform'` — c'est Yaammoo qui offre.

| `covered_by` | Qui renonce                     | Marchand touche       | Marge plateforme | Minimum de plats |
| ------------ | ------------------------------- | --------------------- | ---------------- | ---------------- |
| `platform`   | Yaammoo (bonus plateforme, campagne) | plat **+ course** | peut être négatif (régime fastfood) | oui : calculé en fastfood, **fixe à 2** en plateforme |
| `fastfood`   | le marchand (bonus de boutique) | plat **seul**         | intacte          | **aucun**        |

Sur un bonus de boutique, le marchand renonce à sa course : il touche 1500 au
lieu de 1800 dans le cas 1, et la plateforme conserve intégralement sa marge. Il
n'y a donc rien à financer, et aucun contrôle de quantité.

---

## Récapitulatif — quand perd-on ?

| Situation                                    | Résultat                                | Ce que voit le user                          |
| -------------------------------------------- | --------------------------------------- | -------------------------------------------- |
| `fastfood`, course ≤ seuil du plat, 1 plat   | gain réduit                             | sa livraison est offerte                     |
| `fastfood`, course > seuil, quantité insuffisante | **refusé**, aucune perte encaissée | « Ajoutez N plats… » (verify) ou 400 (transaction) |
| `fastfood`, course > seuil, quantité suffisante   | gain                                    | sa livraison est offerte                     |
| `fastfood`, campagne globale (`delivery_free_mode`) | **ne s'applique plus** — réservée au régime plateforme | rien : la course reste due |
| `platform`, campagne globale, 1 plat         | **refusé** — même minimum que les bonus | « Ajoutez 1 plat… » (`deliveryOffer.minItems`) |
| `platform`, 1 plat                           | marge servie, mais le livreur absorbe   | « Ajoutez 1 plat… » — **minimum fixe de 2** |
| `platform`, 2 plats ou plus                  | manque à gagner, **jamais de perte**    | sa livraison est offerte                     |
| `covered_by = 'fastfood'`                    | marge intacte                           | sa livraison est offerte, sans condition     |

> ⚠️ **Deux corrections sur la campagne globale (`delivery_free_mode`).**
>
> 1. Elle **ne s'applique plus en régime `fastfood`** : la course y est facturée
>    à part, l'offrir sort réellement de la caisse. Elle produisait des marges
>    négatives en série sur les grosses zones.
> 2. En régime `platform`, elle **respecte désormais le minimum de 2 plats**.
>    Elle passait auparavant sans aucun contrôle : sur un départ d'un seul plat,
>    le livreur était rogné exactement comme avec un bonus.
>
> Ne passant pas par `/bonus/verify`, la campagne porte son seuil dans
> `deliveryOffer.minItems` — sans quoi le front ne pourrait pas l'annoncer.
>
> En fastfood, la gratuité passe donc **uniquement par un bonus à code**, validé
> par `POST /bonus/verify` avant paiement. Un bonus seulement armé y est ignoré.

---

## Où c'est tracé

Une perte n'est utile que si on peut la mesurer. Deux colonnes portent
l'information (`order_deliveries`) :

| Colonne           | Ce qu'elle dit                                    |
| ----------------- | ------------------------------------------------- |
| `platform_margin` | le résidu, **négatif possible**                   |
| `free_reason`     | `bonus` \| `campaign` \| `null`                   |
| `covered_by`      | `fastfood` \| `platform` — qui a renoncé          |

Le coût réel d'une campagne se lit donc directement :

```sql
SELECT free_reason, covered_by,
       COUNT(*), SUM(platform_margin)
FROM order_deliveries
WHERE free_reason IS NOT NULL
GROUP BY 1, 2;
```

> `platform_revenues` garde sa contrainte `>= 0` — c'est un grand livre de
> RECETTES, une ligne négative n'y aurait pas de sens.

---

## Réglages qui déplacent les seuils

| Clé                               | Défaut | Effet sur le coût d'une gratuité                          |
| --------------------------------- | -----: | --------------------------------------------------------- |
| `fastfood_margin`                 |    200 | Monte la contribution par plat → minimum de plats plus bas |
| `fastfood_margin_tier_2_margin`   |    300 | Idem au-dessus de 3500 de brut                            |
| `price_rounding_step`             |    500 | Crée le surplus d'arrondi — deuxième source de contribution |
| `driver_amortization_max`         |    100 | Régime plateforme : ce que le livreur absorbe au maximum  |
| `platform_margin`                 |    100 | Marge fondue par plat, régime plateforme                  |
| `delivery_free_mode`              |  false | Campagne globale — régime `platform` uniquement           |
| `platform_free_delivery_min_items_bonus` | 2 | Plats minimum sur un départ, bonus, régime plateforme     |
| `platform_free_delivery_min_items_campaign` | 2 | Idem pour la campagne — clé **distincte**              |

> ⚠️ Changer `price_rounding_step`, `fastfood_margin` ou `payment_fee_percent`
> **invalide tous les chiffres de ce fichier**. Les recalculer avant de conclure.
