# Tarification — qui livre : fastfood ou plateforme

Régime de livraison d'une boutique (`fastfoods.deliveryBy`, migration 037), pas
d'arrondi, et cascade de répartition dans les deux sens.

> **Prérequis** : lire d'abord [pricing.md](./pricing.md) — en particulier la
> distinction **zone max** (fondue dans le plat) / **course réelle**
> (`delivery.prix`, ajoutée au total). Tout ce fichier repose dessus.

| Besoin                                       | Fichier                                          |
| -------------------------------------------- | ------------------------------------------------ |
| Composition du prix affiché, réglages        | [pricing.md](./pricing.md)                       |
| Commission agrégateur, frais de retrait      | [pricing-fees.md](./pricing-fees.md)             |
| Tables comptables, à emporter, déclenchement | [pricing-settlement.md](./pricing-settlement.md) |
| Paiement du livreur, `driver_credit`         | [wallet.md](./wallet.md)                         |
| Assignation livreur, `driverId`              | [orders.md](./orders.md)                         |

---

## Les deux régimes

`fastfoods.deliveryBy` — **décidé par l'admin**, jamais par la boutique.

| Valeur              | Zones utilisées                | Base du prix affiché                     | Prix affiché                               | Course versée à |
| ------------------- | ------------------------------ | ---------------------------------------- | ------------------------------------------ | --------------- |
| `fastfood` (défaut) | `deliveryHours` de la boutique | **marge par palier seule** (aucune zone) | calé sur le pas, **toujours vers le haut** | **fastfood**    |
| `platform`          | `platformDeliveryZones`        | zone **périodique** + marge de base      | calé sur le pas, **descend** si absorbable | **livreur**     |

> ⚠️ En régime plateforme, l'affichage se base sur le **périodique** : caler le
> catalogue entier sur l'express gonflerait tous les prix pour un mode que la
> plupart ne prendront pas. L'express est donc facturé **à part**, tous frais
> inclus et arrondi au pas (migration 040) — jusque-là il partait brut, et le
> livreur en absorbait la commission et le retrait.
>
> Le détail du régime plateforme — fondu, bandes de marge, gratuité, express —
> est dans [pricing-platform-delivery.md](./pricing-platform-delivery.md).
>
> ⚠️ En régime **fastfood**, plus aucune zone n'entre dans le prix du plat
> (migration 038). Fondre la zone la plus chère gonflait tout le catalogue pour
> couvrir un cas rare : un plat brut à 2000 chez une boutique à 1000 de zone max
> s'affichait 3320 alors que la course due valait 250. La course est désormais
> facturée à part, au tarif réel, et c'est le **surplus d'arrondi** qui absorbe
> la commission prélevée dessus.

---

## Configurer qui livre (routes ADMIN)

| Méthode | Endpoint                         | Rôle                     |
| ------- | -------------------------------- | ------------------------ |
| PATCH   | `/fastFood/:fastFoodId/delivery` | une boutique             |
| PATCH   | `/fastFood/delivery`             | **toutes** les boutiques |

Corps : `{ deliveryBy?, platformDeliveryZones? }` — les deux facultatifs, au
moins un requis. Protégées par `firebaseAuth` + `adminGuard`
(`middlewares/adminMiddleware.js`) : une boutique ne décide pas qui la livre ni à
quel tarif.

> ⚠️ **Passer en `platform` sans zones est REFUSÉ (400).** Le supplément
> livraison tomberait à 0 : le prix affiché ne couvrirait plus la course et le
> livreur ne toucherait rien. Les zones peuvent être déjà en base ou fournies
> dans la même requête.

Sur la route de masse, chaque boutique est validée séparément — celles qui ne
peuvent pas basculer sont listées dans `skipped` plutôt que de faire échouer tout
le lot :

```json
{ "data": { "updated": ["ff1", "ff2"], "skipped": [{ "id": "ff3", "reason": "…sans zones…" }] } }
```

`platformDeliveryZones` a **exactement** la même forme que `deliveryHours` —
`periodicZones` ET `expressZones` par créneau. Le front n'a qu'une structure à
connaître, et `collectZones` / `maxDeliveryPrice` / `zoneDeliveryPrice`
fonctionnent dessus sans rien savoir du régime.

---

## L'arrondi au pas — et pourquoi il vient EN DERNIER

Le prix affiché est un multiple de `price_rounding_step` (500) dans les **deux**
régimes, mais la règle diffère :

| Régime     | Sens de l'arrondi                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| `platform` | **descend** tant que le manque reste sous `driver_amortization_max` (100 F, absorbé par la course) ; au-delà, **monte** |
| `fastfood` | **monte toujours** — il n'y a aucune course plateforme à amortir, et descendre mettrait la marge en négatif             |

Dans les deux cas, le surplus revient à la plateforme.

> ⚠️ **L'ordre est le tout.** Arrondir le prix BRUT en amont ferait franchir un
> palier entier une fois les frais ajoutés (2500 → 3500 au lieu de 3000). On
> compose donc le prix juste d'abord, on cale sur le pas ensuite.

> ⚠️ **La course du livreur est PLAFONNÉE au tarif de la zone.** Il absorbe la
> baisse quand on arrondit vers le bas (dans la limite de
> `driver_amortization_max`), mais n'encaisse jamais la hausse : un arrondi vers
> le haut est un surplus payé par le client, il revient à la plateforme.
> Sans ce plafond, un plat à 3500 arrondi de 4110 à 4500 versait 619 F au livreur
> pour une course qui en vaut 250.

### Grille en régime `fastfood` (migration 038)

Marge 200 (palier 1) / 300 (palier 2 dès brut 3500), commission 5 %, retrait MTN,
pas 500. La course s'ajoute au total, elle n'est pas dans ces colonnes.

| Brut | Marge | Juste | Affiché | Surplus | Course max couverte |
| ---- | ----- | ----- | ------- | ------- | ------------------- |
| 500  | 200   | 794   | 1000    | 206     | **4 120**           |
| 1000 | 200   | 1320  | 1500    | 180     | **3 600**           |
| 1500 | 200   | 1847  | 2000    | 153     | **3 060**           |
| 2000 | 200   | 2373  | 2500    | 127     | **2 540**           |
| 2500 | 200   | 2899  | 3000    | 101     | **2 020**           |
| 3000 | 200   | 3426  | 3500    | 74      | **1 480**           |
| 3500 | 300   | 4057  | 4500    | 443     | **8 860**           |
| 4000 | 300   | 4586  | 5000    | 414     | **8 280**           |
| 5000 | 300   | 5651  | 6000    | 349     | **6 980**           |
| 8000 | 300   | 8847  | 9000    | 153     | **3 060**           |
| 9000 | 300   | 9912  | 10000   | 88      | **1 760**           |

**« Course max couverte »** = `surplus / commission` : au-delà, la commission
prise sur la course entame la marge de base. Les zones réelles (50 à 300 F)
en sont très loin, mais le surplus se resserre en haut de grille — c'est là
qu'un palier de marge supplémentaire aurait du sens.

> ⚠️ Le surplus dépend du prix **brut** du marchand, sur lequel la plateforme n'a
> aucune prise. Un brut dont le prix juste tombe pile sur un multiple de 500
> donne un surplus nul : la marge de base porte alors seule la commission de la
> course.

### Grille en régime plateforme

Marge 100, zone périodique 250, commission 5 %, retrait MTN. Colonnes calculées
sur le **plat affiché seul** (la course réelle s'ajoute ensuite au total) :

| Plat brut | Prix juste | Plat affiché | Livreur | Marge   |
| --------- | ---------- | ------------ | ------- | ------- |
| 1000      | 1478       | 1500         | 250     | **121** |
| 1500      | 2005       | 2000         | 246     | 100     |
| 2000      | 2531       | 2500         | 221     | 100     |
| 2500      | 3057       | 3000         | 196     | 100     |
| 3000      | 3584       | 3500         | 171     | 100     |
| 3500      | 4110       | 4500         | 250     | **469** |
| 4000      | 4639       | 5000         | 250     | **439** |
| 5000      | 5705       | 6000         | 250     | **377** |

Le fastfood touche son prix exact sur toute la grille, la marge n'est jamais
entamée. Quand on descend, le livreur absorbe ; quand on monte, la plateforme
encaisse.

---

## La cascade, dans les deux sens

Composition (à l'affichage) puis répartition (au règlement) sont exactement
inverses. Plat brut 2000, zone réelle 250, commission 5 %, retrait MTN 54 —
marge 200 en `fastfood` (palier 1), 100 en `platform` :

|                          | `fastfood`                  | `platform`                  |
| ------------------------ | --------------------------- | --------------------------- |
| Prix juste               | 2531                        | 2531                        |
| **Plat affiché**         | **2531**                    | **2500** (arrondi bas)      |
| + course réelle au total | 250                         | 250                         |
| **Le client paie**       | **2781**                    | **2750**                    |
| − commission 5 %         | 140                         | 138                         |
| − frais de retrait       | 54                          | 54                          |
| = net                    | 2587                        | 2558                        |
| → fastfood               | **2250** (2000 + sa course) | **2000** (son prix seul)    |
| → livreur                | —                           | **227** (absorbe l'arrondi) |
| → plateforme             | **337**                     | **331**                     |

**Ni le marchand ni la marge ne sont le résidu.** `items_real` vient toujours des
`rawPrice` figés, la course est due au tarif de la zone (plafonnée en régime
plateforme), et **c'est la marge qui absorbe le reste** — arrondi vers le haut
comme commission prélevée sur la course.

> ⚠️ Corrigé : `items_real` était le résidu en régime `fastfood`. La commission
> portant sur `items_charged` (course comprise), sa part imputable à la course
> sortait de la poche du marchand — un plat à 2000 lui rapportait 1987. Voir
> [pricing-settlement.md](./pricing-settlement.md).
