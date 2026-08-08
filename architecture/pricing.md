# Feature — Tarification & livraison

## Rôle

Composer le **prix affiché** au client à partir du prix réel du fastfood, de la
livraison et de la marge Yaammoo — sans jamais gonfler un prix en base — et
tracer la vérité comptable de chaque livraison.

> **Règle centrale : le prix affiché est CALCULÉ, le prix réel est STOCKÉ.**
> Même principe que `isMarchand` : la donnée métier est dérivée à la lecture.

---

## Routes

| Méthode | Endpoint | Contrôleur | Protégé | Rôle |
|---|---|---|---|---|
| GET | `/settings/pricing` | `getPublicPricingController` | Non | Réglages tarifaires publics (**sans la marge**) |
| GET | `/settings` | `getSettingsController` | **Oui** — admin | Tous les réglages, avec descriptions |
| PATCH | `/settings/:key` | `patchSettingController` | **Oui** — admin | Bascule un réglage **à chaud** |

---

## Composition du prix affiché

```
base            = prix fastfood + livraison LA PLUS CHÈRE + marge
plat affiché    = ceil( (base + frais de retrait) / (1 − commission) )
extra affiché   = ceil( (prix extra   + frais de retrait) / (1 − commission) )
boisson affiché = ceil( (prix boisson + frais de retrait) / (1 − commission) )

montant payé    = SOMME de ce que le user voit
```

> ⚠️ **On DIVISE par `(1 − commission)`, on ne multiplie pas par `(1 + commission)`.**
> L'agrégateur prélève son pourcentage sur le montant qu'il **encaisse**. Pour
> qu'il reste 2404 après sa part : `2404 / 0,95 = 2531`. En multipliant on
> aurait `2404 × 1,05 = 2524`, dont 5 % font 126 — il ne resterait que 2398.
>
> `feeIncludedIn` suit la **même** convention (`montant × 5 %`). Les deux bouts
> de la cascade doivent s'accorder : quand la composition divisait par 0,95 et la
> répartition par 1,05, on croyait qu'il restait 2404 alors qu'on en comptait
> 2410 — et les 6 F d'écart partaient en silence chez le marchand.

> ⚠️ **Aucun frais n'est jamais ajouté à la fin.** Les 5 % sont déjà dans chaque
> prix affiché : le user paie tout sans voir de ligne de frais ni de taxe. Ils
> sont appliqués **une fois par prix**, jamais multipliés par la quantité.

> **Montant encaissé** : `amount` est fourni par le front. En cas de gratuité
> (campagne / bonus livraison), **le front retire lui-même la livraison** du total
> avant d'envoyer le paiement — le backend ne recalcule ni ne déduit rien.

### Contrôle du montant encaissé (`validatePaymentAmount`)

`amount` et `items[].total` venant du client, `postTransaction.service` les
**recalcule avant tout appel MobileWallet** — la livraison étant déjà fondue dans
le prix du plat, elle n'est **jamais** ajoutée au total.
Détail complet : **[payment-amount-check.md](./payment-amount-check.md)**.

Les prix RÉELS des menus sont dans **`prices[]`** (`{price, description}`), pas
dans `prix1/prix2/prix3` — ces colonnes existent dans le mapper mais sont NULL
sur toute la base.

**Pourquoi la livraison la plus chère** : une boutique a plusieurs zones à des
prix différents, et le home ne sait pas encore où le user se fera livrer. En
prenant le maximum, le prix annoncé couvre toutes les zones — il ne peut jamais
manquer. Si le user choisit ensuite une zone moins chère, **l'écart reste à la
plateforme**.

**Le supplément livraison + marge n'est porté que par le plat.** Extras et
boissons ne portent que leurs propres frais — sinon chaque supplément ajouterait
une livraison de plus.

> ⚠️ **`pickupAllowed` n'entre pas dans le calcul.** Ce champ dit que le client
> *peut venir récupérer sur place*, pas que la boutique refuse de livrer. Une
> boutique qui ne livre pas ne déclare simplement aucune zone → supplément à 0.
> (Il s'appelait `pickupOnly`, ce qui laissait croire l'inverse et annulait à
> tort le supplément de boutiques qui livrent.)

### Exemple de référence

Plat 2000, zones 500 / 800 / 1000, marge 100, frais 5 %.

| | Montant |
|---|---|
| Avant frais | 2000 + 1000 + 100 = 3100 |
| + frais de retrait | 3100 + 54 = 3154 |
| **Prix affiché** | `ceil(3154 / 0,95)` = **3320** |
| Commission (5 % du payé) | **166** |
| Frais de retrait | **54** |
| Le fastfood touche (zone 500) | 2000 + 500 = **2500** |
| Yaammoo garde | (1000 − 500) + 100 = **600** |

Le user ne voit **jamais** la ligne livraison : elle est fondue dans le prix du
plat.

### Express ou périodique — deux tarifs par lieu

Un même lieu a **deux prix** : `periodicZones` et `expressZones`. « Bonanjo »
peut valoir 500 en périodique et 900 en express.

| Usage | Liste consultée |
|---|---|
| Prix **affiché** (home) | max des **deux** listes — le user n'a pas encore choisi son mode |
| `real_price` (à la commande) | la liste du **type réellement choisi** (`orders.delivery.type`) |

Sans ce filtre, une course express était créditée au tarif périodique et l'écart
tombait dans la marge plateforme.

### Ne jamais inverser le calcul

L'arrondi au supérieur rend l'opération **non réversible** : plat 25 → affiché
`ceil(1125 × 1.05)` = 1182 ; l'inverse donne `1182 ÷ 1.05 − 1100` = **25,71**.

Le prix réel n'est donc **jamais recalculé** : il est servi tel quel depuis la
base, et le réel comme le facturé sont stockés côte à côte
(`order_settlements`, `order_deliveries`).

### Sockets menu — prix affiché (client) vs brut (marchand)

Un menu émis en socket doit porter le **bon prix selon l'audience**, comme
`getFastFoods` (raw pour le marchand, affiché pour le client) :

| Événement | Audience | Prix |
|---|---|---|
| `globalMenuUpdated`, `newGlobalMenu`, `globalMenuDeleted` | broadcast **client** (home) | **affiché** (livraison + marge + frais) |
| `fastFoodMenuUpdated`, `newFastFoodMenu`, `fastFoodMenuDeleted`, `newMenu` (room boutique) | **marchand** (gestion) | **brut** |

Les émissions client passent par `services/menu/enrichMenuForClient.js` (recharge la
boutique du menu → `applyDisplayPricing`). Avant, ces sockets renvoyaient le **prix
brut** → le home affichait un prix sans livraison/marge/frais (bug au changement de
stock pendant une commande, à la création/édition/suppression de menu).

### Vue marchand

**`GET /fastfood/all` sert le prix affiché à TOUT LE MONDE**, propriétaire
compris (`pricing.applied: true` toujours). Cette route alimente le **home**,
donc un écran d'**achat** : un marchand qui commande y est un client comme un
autre, et lui montrer ses prix réels afficherait un prix qu'il ne paierait pas.

Le catalogue réel se lit sur **`GET /menu/:fastFoodId`**, qui n'applique aucune
surcharge — c'est l'endpoint de **gestion**. La distinction est donc portée par
l'**endpoint** (acheter vs gérer), plus par le rôle de l'appelant.

> ⚠️ Auparavant `getFastFoods` passait `isOwner` à `applyDisplayPricing` : le
> propriétaire voyait ses prix bruts sur le home, donc un prix inférieur à celui
> qu'il aurait payé en commandant.

### `rawPrice` — le prix réel transporté à côté de l'affiché

`applyDisplayPricing` ajoute **`rawPrice`** sur chaque `prices[]`, `extra[]` et
`drink[]` : le prix réel du fastfood, servi en même temps que le prix affiché.

Le front le **renvoie tel quel** dans `order.menu` à la commande, ce qui fige le
prix de l'époque. C'est la seule façon de le connaître plus tard :

- le prix affiché n'est **pas inversible** (l'arrondi `ceil` détruit l'information) ;
- relire le menu après coup donnerait le prix **courant**, pas celui payé — un
  marchand qui change ses tarifs réécrirait tout son historique.

`rawPrice` n'entre dans **aucun** calcul d'argent : le montant payé reste contrôlé
par `validatePaymentAmount` sur `price`, et ce qui est versé vient de
`order_settlements`. Un client qui le falsifierait ne fausserait que son propre
affichage — d'où l'absence de revalidation (qui rejetterait à tort les commandes
passées pendant une édition de menu).

### Ce que chaque rôle voit

| Route | Audience | Prix |
|---|---|---|
| `GET /order/user/all/:userId` | client | **affiché** (ce qu'il a payé) |
| `GET /order/driver/:driverId` | livreur | **affiché** — identique au client |
| `GET /order/all/:fastFoodId` | marchand | **réel** + `customerTotal` |

Le **livreur voit les prix client**, pas les montants marchands : il est
l'interface avec le client à la livraison, et annoncer un montant différent de
celui payé créerait un litige à chaque course. Il ne sait donc rien de ce que
touche la boutique.

La bascule marchand est portée par `services/order/toMerchantView.js` :

| Champ | Marchand |
|---|---|
| `menu.prices[].price` | `rawPrice` (2000) |
| `extra[].prix` / `drink[].prix` | `rawPrice` |
| `delivery.prix` | course réelle (500) |
| `total` | **ce qu'il encaisse** (2500) |
| `customerTotal` | ce que le client a payé (3255) |

`total` vient de `order_settlements.itemsReal` + la course. Tant que la commande
n'est pas réglée, il est recalculé depuis les `rawPrice` figés.

> ⚠️ **Une seule course par départ.** Un panier de 3 plats chez la même boutique
> fait 3 commandes mais UN déplacement : la livraison n'est ajoutée qu'à la
> commande qui la porte (`courseBilled`, ou `deliveryGroupKey` avant règlement),
> sinon la boutique verrait N fois la course.
>
> Panier A+B (plats bruts 2000, course 500) : A → `total` 2500, B → `total` 2000,
> soit **4500** encaissés pour une seule course — et non 5000.

### Quantité — asymétrie voulue

Le supplément est porté par le prix **unitaire**, donc facturé sur **chaque
exemplaire**. Le fastfood, lui, ne touche qu'**une seule course**. Tout l'écart
revient à la plateforme — c'est le levier de marge.

Plat 2000, zone 500, marge 100, **quantité 2** :

| | Montant |
|---|---|
| Facturé au user | 2 × 1100 = **2200** de supplément |
| Versé au fastfood | **500** (une seule course) |
| Marge plateforme | **1700** |

---

## Qui livre : fastfood ou plateforme (migration 037)

`fastfoods.deliveryBy` — **décidé par l'admin**, jamais par la boutique.

| Valeur | Zones utilisées | Base du prix affiché | Prix affiché | Course |
|---|---|---|---|---|
| `fastfood` (défaut) | `deliveryHours` de la boutique | max des DEUX listes | exact, aucun arrondi | versée au fastfood |
| `platform` | `platformDeliveryZones` | **périodique seul** | calé sur `price_rounding_step` | versée au LIVREUR |

### Configurer qui livre (routes ADMIN)

| Méthode | Endpoint | Rôle |
|---|---|---|
| PATCH | `/fastFood/:fastFoodId/delivery` | une boutique |
| PATCH | `/fastFood/delivery` | **toutes** les boutiques |

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
{ "data": { "updated": ["ff1", "ff2"],
            "skipped": [{ "id": "ff3", "reason": "…sans zones…" }] } }
```

`platformDeliveryZones` a **exactement** la même forme que `deliveryHours` —
`periodicZones` ET `expressZones` par créneau. Le front n'a qu'une structure à
connaître, et `collectZones` / `maxDeliveryPrice` / `zoneDeliveryPrice`
fonctionnent dessus sans rien savoir du régime.

> ⚠️ En régime plateforme, l'affichage se base sur le **périodique**. Un client
> qui choisit l'express paie son supplément en connaissance de cause ; caler le
> catalogue entier sur l'express gonflerait tous les prix pour un mode que la
> plupart ne prendront pas. En régime fastfood, on garde le max des deux listes.

> ⚠️ **La course du livreur est PLAFONNÉE au tarif de la zone.** Il absorbe la
> baisse quand on arrondit vers le bas (dans la limite de
> `driver_amortization_max`), mais n'encaisse jamais la hausse : un arrondi vers
> le haut est un surplus payé par le client, il revient à la plateforme.
> Sans ce plafond, un plat à 3500 arrondi de 4110 à 4500 versait 619 F au livreur
> pour une course qui en vaut 250.

### Grille en régime plateforme

Marge 100, périodique 250, commission 5 %, retrait MTN :

| Plat | Prix juste | Client paie | Livreur | Marge |
|---|---|---|---|---|
| 1000 | 1478 | 1500 | 250 | **121** |
| 1500 | 2005 | 2000 | 246 | 100 |
| 2000 | 2531 | 2500 | 221 | 100 |
| 2500 | 3057 | 3000 | 196 | 100 |
| 3000 | 3584 | 3500 | 171 | 100 |
| 3500 | 4110 | 4500 | 250 | **469** |
| 4000 | 4639 | 5000 | 250 | **439** |
| 5000 | 5705 | 6000 | 250 | **377** |

Le fastfood touche son prix exact sur toute la grille, la marge n'est jamais
entamée. Quand on descend, le livreur absorbe ; quand on monte, la plateforme
encaisse.

### Les frais de retrait entrent dans le prix

Encaisser ne suffit pas : l'argent doit **sortir** du portefeuille MTN ou Orange,
et ce retrait coûte. Ce coût était supporté en silence ; il est désormais fondu
dans le prix affiché, comme la commission de l'agrégateur.

Barème à **seuil**, par opérateur (`services/pricing/withdrawalFees.js`) :

```
montant <  seuil  →  frais FIXE           (54 F)
montant >= seuil  →  pourcentage + fixe   (1,2 % + 4 F)
```

> ⚠️ Un jeu de clés PAR opérateur (`withdrawal_fee_mtn_*`, `withdrawal_fee_orange_*`).
> Mêmes valeurs aujourd'hui, mais un opérateur qui change son barème ne doit pas
> entraîner l'autre.

Les deux frais ne s'additionnent pas naïvement : la commission est un pourcentage
du prix **payé**, alors que le retrait porte sur ce qui reste **après** elle.

```
payé = (base + frais de retrait) / (1 − commission)
```

Extras et boissons portent eux aussi le retrait, en plus de la commission.

### L'arrondi au pas — et pourquoi il vient EN DERNIER

En régime plateforme, le prix affiché est toujours un multiple de
`price_rounding_step` (500). On **descend** tant que le manque reste absorbable
par la course (`driver_amortization_max`, 100 F) ; au-delà on **monte**, et le
surplus revient à la plateforme.

> ⚠️ **L'ordre est le tout.** Arrondir le prix BRUT en amont ferait franchir un
> palier entier une fois les frais ajoutés (2500 → 3500 au lieu de 3000). On
> compose donc le prix juste d'abord, on cale sur le pas ensuite.

### La cascade, dans les deux sens

Composition (à l'affichage) puis répartition (au règlement) sont exactement
inverses. Plat brut 2000, marge 100, zone 250, commission 5 %, retrait MTN :

| | `fastfood` | `platform` |
|---|---|---|
| Prix juste | 2531 | 2531 |
| **Le client paie** | **2531** | **2500** (arrondi bas) |
| − commission 5 % | 121 | 119 |
| − frais de retrait | 54 | 54 |
| = net | 2356 | 2327 |
| → fastfood | 2006 | **2000** (son prix, entier) |
| → livreur | 250 | **227** (absorbe l'arrondi) |
| → plateforme | **100** | **100** |

**La marge n'est jamais entamée.** L'arrondi vers le bas est porté par la course,
jamais par le marchand ni par la plateforme — c'est la règle qui décide de tout
le reste. En régime `fastfood`, le montant marchand est le résidu de la cascade ;
en régime `platform`, il est calculé depuis les `rawPrice` figés à l'achat, et
c'est la course qui devient le résidu.

### Frais de retrait — UNE ponction par BOUTIQUE

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

| Panier | Par commande | En une fois | Écart |
|---|---|---|---|
| 2 × 2000 | 54 + 54 = 108 | 4000 → 54 | 54 |
| 2 × 3000 | 54 + 54 = 108 | 6000 → 76 | 32 |
| 2 × 5000 | 64 + 64 = 128 | 10 000 → 124 | 4 |

### Comment le front sait qui porte le frais

Trois champs, à la racine de la commande — même lecture que la course :

| Champ | Sens |
|---|---|
| `withdrawalGroupId` | commandes partageant la même ponction |
| `withdrawalFeeBilled` | `true` sur celle qui la porte |
| `withdrawalFee` | le montant, `0` sur les autres |

Sans eux, un `withdrawalFee: 0` serait ambigu : groupé ? réglages illisibles ?
réellement nul ? C'est exactement le rôle de `courseBilled` pour la livraison.

`withdrawalGroupId` est un **id généré et stocké** (`order_settlements.withdrawal_group_id`),
comme `deliveryGroupId` — jamais une clé composée exposée au front.

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

### Ce que trace `order_settlements`

| Colonne | Sens |
|---|---|
| `items_charged` | ce que le client a payé |
| `payment_fee` | commission agrégateur, extraite du payé |
| `withdrawal_fee` | coût de sortie chez l'opérateur |
| `items_real` | ce qui revient au fastfood |
| `driver_amount` | ce qui reste au livreur, arrondi absorbé |
| `platform_margin` | le reste |

`driver_amount` est **distinct** de `order_deliveries.real_price` : ce dernier est
le tarif de la zone AVANT amortissement.

Le livreur plateforme est payé **à la livraison**, pas au paiement — une course
annulée en chemin ne se paie pas (`services/transaction/creditDriver.service.js`,
transaction `driver_credit`, idempotente).

---

## Réglages (`settings`)

Table clé/valeur (migration 019), lue via `services/settings/settings.service`.

| Clé | Défaut | Rôle |
|---|---|---|
| `platform_margin` | 100 | Marge Yaammoo ajoutée au prix affiché de chaque plat (FCFA) |
| `payment_fee_percent` | 5 | Frais prestataire, en % du montant payé, **arrondi à l'entier supérieur** |
| `delivery_free_mode` | false | Campagne « livraison offerte » globale |
| `apple_review_mode` | false | Mode Apple Review exposé au frontend (migration 036) — voir [payment.md](./payment.md) |
| `apple_version_review_mode` | `""` | Version d'app exacte en review ; déclenche le bypass paiement (migration 036) — voir [payment.md](./payment.md) |
| `withdrawal_fee_mtn_*` / `withdrawal_fee_orange_*` | 4200 / 54 / 1.2 / 4 | Barème de retrait par opérateur : `threshold`, `flat`, `percent`, `addend` (migration 037) |
| `price_rounding_step` | 500 | Pas d'arrondi du prix affiché, en livraison PLATEFORME (migration 037) |
| `driver_amortization_max` | 100 | Ce que la course peut absorber pour arrondir vers le bas (migration 037) |

**Pourquoi en base et pas dans `.env`** : ce sont des décisions **commerciales**,
prises et annulées en cours de journée. `flyctl secrets set` ne rebuild pas le
code mais redémarre la machine — inacceptable pour basculer une campagne.

> Les **seuils de version d'app** restent, eux, en `.env` : ils sont liés au
> déploiement (cf. CLAUDE.md › Versioning par version d'app).

**Cache** : ces valeurs sont lues à chaque affichage du home, donc gardées en
mémoire pendant `SETTINGS_CACHE_TTL_MS`. L'écriture purge le cache local ; les
autres machines suivent à l'expiration. En cas d'incident de lecture, on sert
des replis **sûrs** (marge 0, frais 0, aucune campagne) plutôt que d'échouer.

---

## Campagne vs bonus — qui prime

`services/pricing/deliveryOfferResolver.js`

| Situation | `deliveryOffer.reason` | Bonus consommé ? |
|---|---|---|
| Campagne active | `campaign` | **Non** |
| Pas de campagne, bonus armé/code | `bonus` | Oui |
| Ni l'un ni l'autre | `null` | — |

**La campagne prime et laisse le bonus intact.** Brûler le bonus d'un user
pendant une période où la livraison est de toute façon offerte à tout le monde
serait une perte sèche pour lui.

Un seul motif à la fois : le front n'a jamais à arbitrer.

> ⚠️ **Les prix de livraison ne sont JAMAIS forcés à 0**, campagne ou pas. Le
> montant payé est identique ; c'est la **marge** qui varie. `deliveryOffer` dit
> seulement que la livraison est offerte — le front décide de l'affichage.

Forme de `deliveryOffer` : voir [bonus.md](./bonus.md#deliveryoffer--objet-unique-partagé).

---

## Vérité comptable (`order_settlements` + `order_deliveries`)

**Deux tables, écrites par `services/order/settleDelivery.service.js`.** La
séparation est volontaire : *toute* commande a un règlement, mais seules les
commandes **livrées** ont une course. Créer une ligne dans une table
« deliveries » pour une commande à emporter serait incohérent, et pénible à
exploiter en statistiques.

### `order_settlements` — l'ARGENT (une ligne par commande, **toujours**)

| Colonne | Sens | Audience |
|---|---|---|
| `items_real` | plat + extras + boissons, hors livraison, frais et marge | le **fastfood** |
| `items_charged` | ce que le user a payé (TTC) | le **user** |
| `payment_fee` | les 5 % **contenus** dans `items_charged` | le **prestataire** |
| `platform_margin` | marge plat + écart livraison | **Yaammoo** |
| `delivered` | `false` = à emporter → **marge pure** | comptabilité |
| `group_id` | panier du client, recopié d'`orders` | agrégation sans jointure |

### `order_deliveries` — la COURSE (uniquement si **livrée**)

| Colonne | Sens | Audience |
|---|---|---|
| `real_price` | prix de la zone choisie, au tarif du type | le **fastfood** |
| `charged_price` | livraison facturée (la plus chère × quantité) | le **user** |
| `platform_margin` | écart + marge, pour cette course | **Yaammoo** |
| `delivery_group_id` | relie les commandes d'un même panier **+ boutique** | — |
| `course_billed` | `true` sur une seule ligne du groupe | comptabilité |
| `free_reason` | `bonus` \| `campaign` \| null | motif de gratuité |
| `covered_by` | `fastfood` \| `platform` | qui renonce au montant |
| `bonus_id` / `bonus_code` | bonus appliqué | suivi |

**`platform_margin` n'est jamais négatif** (contrainte SQL) : une gratuité fait
renoncer à un gain, elle ne crée pas une dépense.

### `platform_revenues` — socle, pas encore alimenté

⚠️ **Aucun code n'écrit dans cette table à ce jour.** Elle est posée d'avance
(migration 024) parce que la marge ne viendra pas que des commandes : flyers,
mise en avant d'une boutique, abonnements. Ces recettes n'ont **pas d'`order_id`**
et ne peuvent donc pas entrer dans `order_settlements`, dont la clé primaire
*est* `order_id`.

| Table | Portée |
|---|---|
| `order_settlements` | le détail d'**une commande** — source de vérité |
| `platform_revenues` | l'agrégat de **toutes les sources** (`source_type` + `source_id`) |

Les extras et boissons, eux, sont déjà couverts par `order_settlements` : ils
font partie de la commande, leur marge est dans `platform_margin`.

Le jour où une seconde source existe, les règlements de commandes s'y déversent
(`source_type = 'order'`, `source_id = order_id`). Tant qu'il n'y a que les
commandes, interroger `order_settlements` directement reste plus simple et plus
sûr.

### Panier : une seule course par boutique

Une commande = **un plat**. Un panier de 3 plats fait donc 3 commandes, alors que
le livreur ne se déplace qu'une fois.

Plutôt que de mettre `real_price = 0` sur les commandes non facturées — ce qui
effacerait l'information — **le prix réel de la zone est conservé sur chaque
ligne**, et `course_billed` marque celle qui porte réellement la course.
`delivery_group_id` les relie.

> La comptabilité somme `real_price WHERE course_billed = TRUE`.

Deux boutiques dans un même panier = **deux courses**, chacune facturée une fois.
Plus généralement, la clé de groupe est
`services/pricing/deliveryGroupKey.js` — `fastFoodId | zone | type | date`
(+ `time` en `type === 'time'`) — **partagée** entre `validatePaymentAmount` (ce
qui est facturé) et `settleDelivery` (ce qui est versé). Deux départs distincts
de la même boutique (express + programmé, ou deux zones) = **deux courses**.

`delivery_group_id` et `course_billed` sont désormais **lisibles par le front** :
les GET commandes les exposent en `deliveryGroupId` / `courseBilled` pour que le
client n'affiche pas N frais de livraison là où il n'y a qu'une course. Les
montants de la table (`real_price`, `charged_price`, `platform_margin`) restent,
eux, strictement comptables. Voir [orders.md](./orders.md).

### À emporter : marge pure

Le supplément livraison est fondu dans le prix du plat **depuis le home**, avant
que le user ait choisi son mode. S'il vient chercher sa commande lui-même, il l'a
donc déjà payé — mais il n'y a **aucune course à verser au fastfood**. Le montant
part intégralement en marge. C'est le modèle économique retenu : le prix affiché
ne baisse jamais.

| | Livré (zone 500) | À emporter |
|---|---|---|
| Ligne `order_settlements` | ✅ | ✅ |
| Ligne `order_deliveries` | ✅ | **aucune** |
| `delivered` | `true` | **`false`** |
| `platform_margin` | 600 | **1 100** |

`delivered` reste un champ **explicite** sur le règlement, alors qu'on pourrait
le déduire de l'absence de ligne `order_deliveries` : une statistique sur la
marge pure ne doit pas dépendre d'un `LEFT JOIN … IS NULL`.

> Ces commandes étaient auparavant **ignorées** : ni marge ni frais n'étaient
> tracés.

- Bonus **de boutique** → `covered_by = 'fastfood'` : le marchand renonce à sa
  course, la plateforme conserve intégralement ce qu'elle avait ajouté.
- Bonus **plateforme** / campagne → `covered_by = 'platform'` : Yaammoo renonce
  à sa marge livraison ; la marge plat (`platform_margin` de base) est conservée.

**Non bloquant** : les commandes existent déjà quand on écrit ici. Un incident
comptable ne doit pas faire échouer une commande payée — il est journalisé
bruyamment.

---

## Quand le règlement se déclenche

**Au passage en `pending`**, c'est-à-dire quand la commande devient réelle
(payée). **Jamais à la mise au panier** : un panier peut encore être vidé.

| Chemin | Point d'entrée | Ce qui arrive |
|---|---|---|
| **Panier** | `updateOrders` — transition `pendingToBuy → pending` | Le lot arrive en **un seul appel** : c'est lui, le panier |
| **Achat direct** | `createOrderService`, si `status === 'pending'` | Une seule commande |

C'est parce que `updateOrders` reçoit le **tableau complet** qu'on peut ne
compter qu'une course par boutique et ne consommer le bonus qu'une fois. Aucun
identifiant de panier n'est nécessaire : le lot **est** le panier.

`POST /transaction`, `mwVerdictService` et le mode Apple Review ne sont **pas
modifiés** : ils appellent déjà ces deux services.

> ⚠️ **Cas résiduel** : si un même paiement contient plusieurs commandes *sans
> `id`* (plusieurs achats directs d'un coup), `mwVerdictService` les crée une par
> une, en appels séparés — chacune comptera sa course. D'après le front, l'achat
> direct ne concerne qu'un plat à la fois.

### Pas de rupture de compatibilité

`orders.delivery` (JSONB) n'est **ni supprimé ni modifié** : les apps en
production le lisent tel quel. `order_deliveries` le **complète**. Le seul ajout
côté réponse est `deliveryOffer`, purement additif et ignoré des anciennes apps.
→ Aucun seuil de version d'app n'est nécessaire ici (cf. CLAUDE.md).

---

## Architecture (fichiers)

```
src/
├── routes/settingsRoutes.js
├── controllers/settings/settings.controller.js      # public restreint + admin
├── services/
│   ├── settings/settings.service.js                 # cache + replis sûrs
│   ├── pricing/
│   │   ├── deliveryPricing.js                       # prix affiché, zones, frais, répartition
│   │   └── deliveryOfferResolver.js                 # arbitrage campagne / bonus
│   ├── fastfood/getFastFoods.js                     # applique les prix affichés
│   └── order/settleDelivery.service.js              # règlement au passage en `pending`
└── repositories/supabase/
    ├── settings.repo.js
    ├── orderSettlements.repo.js                     # l'argent (toute commande)
    └── orderDeliveries.repo.js                      # la course (si livrée)
```

## Migrations

| Fichier | Contenu |
|---|---|
| `019_settings.sql` | table `settings` + valeurs initiales (`ON CONFLICT DO NOTHING`) |
| `020_order_deliveries.sql` | table `order_deliveries` + contraintes + index |
| `021_order_deliveries_group.sql` | `delivery_group_id`, `course_billed`, `items_real`, `items_charged`, `payment_fee` |
| `022_orders_group_id.sql` | `orders.group_id` — commandes d'un même panier (cf. [orders.md](./orders.md)) |
| `023_order_settlements.sql` | table `order_settlements` (l'argent) ; sort les montants globaux de `order_deliveries`, qui ne garde que la course |
| `024_platform_revenues.sql` | grand livre des revenus — **socle, pas encore alimenté** |
| `025_fastfoods_pickup_allowed.sql` | `pickup_only` → `pickup_allowed` : le champ disait l'inverse de son usage |
| `026_order_deliveries_platform_margin.sql` | ajoute `platform_margin` à `order_deliveries` (manquait en prod : `CREATE TABLE IF NOT EXISTS` de la 020 n'altère pas une table existante) |
| `036_settings_apple_review.sql` | `apple_review_mode` + `apple_version_review_mode` — sort le mode Apple Review de `.env` |
