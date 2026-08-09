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

| Valeur              | Zones utilisées                | Base du prix affiché | Prix affiché                   | Course versée à |
| ------------------- | ------------------------------ | -------------------- | ------------------------------ | --------------- |
| `fastfood` (défaut) | `deliveryHours` de la boutique | max des DEUX listes  | exact, aucun arrondi           | **fastfood**    |
| `platform`          | `platformDeliveryZones`        | **périodique seul**  | calé sur `price_rounding_step` | **livreur**     |

> ⚠️ En régime plateforme, l'affichage se base sur le **périodique**. Un client
> qui choisit l'express paie son supplément en connaissance de cause ; caler le
> catalogue entier sur l'express gonflerait tous les prix pour un mode que la
> plupart ne prendront pas. En régime fastfood, on garde le max des deux listes.

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

En régime plateforme, le prix affiché est toujours un multiple de
`price_rounding_step` (500). On **descend** tant que le manque reste absorbable
par la course (`driver_amortization_max`, 100 F) ; au-delà on **monte**, et le
surplus revient à la plateforme.

> ⚠️ **L'ordre est le tout.** Arrondir le prix BRUT en amont ferait franchir un
> palier entier une fois les frais ajoutés (2500 → 3500 au lieu de 3000). On
> compose donc le prix juste d'abord, on cale sur le pas ensuite.

> ⚠️ **La course du livreur est PLAFONNÉE au tarif de la zone.** Il absorbe la
> baisse quand on arrondit vers le bas (dans la limite de
> `driver_amortization_max`), mais n'encaisse jamais la hausse : un arrondi vers
> le haut est un surplus payé par le client, il revient à la plateforme.
> Sans ce plafond, un plat à 3500 arrondi de 4110 à 4500 versait 619 F au livreur
> pour une course qui en vaut 250.

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
inverses. Plat brut 2000, marge 100, zone 250, commission 5 %, retrait MTN 54 :

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
