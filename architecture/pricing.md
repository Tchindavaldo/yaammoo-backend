# Feature — Tarification (hub)

## Rôle

Composer le **prix affiché** au client à partir du prix réel du fastfood, de la
livraison et de la marge Yaammoo — sans jamais gonfler un prix en base.

> **Règle centrale : le prix affiché est CALCULÉ, le prix réel est STOCKÉ.**
> Même principe que `isMarchand` : la donnée métier est dérivée à la lecture.

---

## Où lire quoi

Ce fichier ne couvre que la **composition du prix** et les **réglages**. Pour le
reste, aller directement dans le module concerné — ne pas chercher ici :

| Sujet                                                                | Fichier                                                  |
| -------------------------------------------------------------------- | -------------------------------------------------------- |
| Qui livre (`fastfood` / `platform`), arrondi au pas, grille, cascade | [pricing-delivery-modes.md](./pricing-delivery-modes.md) |
| Commission agrégateur, frais de retrait, groupement par boutique     | [pricing-fees.md](./pricing-fees.md)                     |
| `order_settlements` / `order_deliveries`, à emporter, déclenchement  | [pricing-settlement.md](./pricing-settlement.md)         |
| Recalcul serveur du montant payé (`validatePaymentAmount`)           | [payment-amount-check.md](./payment-amount-check.md)     |
| Campagne / bonus livraison offerte                                   | [bonus.md](./bonus.md)                                   |
| Portefeuille marchand, retraits                                      | [wallet.md](./wallet.md)                                 |
| Champs commande, `deliveryGroupId` / `courseBilled`                  | [orders.md](./orders.md)                                 |

---

## Routes

| Méthode | Endpoint            | Contrôleur                   | Protégé         | Rôle                                            |
| ------- | ------------------- | ---------------------------- | --------------- | ----------------------------------------------- |
| GET     | `/settings/pricing` | `getPublicPricingController` | Non             | Réglages tarifaires publics (**sans la marge**) |
| GET     | `/settings`         | `getSettingsController`      | **Oui** — admin | Tous les réglages, avec descriptions            |
| PATCH   | `/settings/:key`    | `patchSettingController`     | **Oui** — admin | Bascule un réglage **à chaud**                  |

---

## Composition du prix affiché

```
base            = prix fastfood + livraison LA PLUS CHÈRE + marge
plat affiché    = ceil( (base + frais de retrait) / (1 − commission) )
extra affiché   = ceil( (prix extra   + frais de retrait) / (1 − commission) )
boisson affiché = ceil( (prix boisson + frais de retrait) / (1 − commission) )
```

### ⚠️ Deux livraisons différentes — ne jamais les confondre

C'est le piège n°1 de cette feature. Il y a **deux** montants de livraison, qui
ne jouent pas le même rôle :

|                                     | Montant                                   | Où il vit                                          | À qui il sert                                                                                |
| ----------------------------------- | ----------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Zone MAX**                        | la plus chère des zones de la boutique    | **fondue dans le prix du plat**, avant la division | matelas : elle couvre n'importe quelle zone, et ce qui n'est pas consommé reste en **marge** |
| **Course réelle** (`delivery.prix`) | le tarif de la zone effectivement choisie | **ajoutée au total**, en clair, après coup         | c'est elle qui est **versée** (au fastfood ou au livreur)                                    |

```
total payé = plat affiché + delivery.prix        (livraison due et NON offerte)
total payé = plat affiché                        (livraison offerte, ou retrait)
```

La zone max est fondue dans le plat parce que, sur le home, le user n'a pas
encore choisi où il se fait livrer — le prix annoncé doit couvrir la zone la plus
chère pour ne jamais manquer. La course réelle, elle, n'est connue qu'à la
commande : elle s'ajoute donc à la fin, sans repasser par `/(1 − commission)`.

Détail du recalcul serveur (offert vs non offert, panier groupé, tous les cas
vérifiés) : **[payment-amount-check.md](./payment-amount-check.md)**.

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
> prix affiché : le user ne voit aucune ligne de frais ni de taxe. Ils sont
> appliqués **une fois par prix**, jamais multipliés par la quantité.

> **Montant encaissé** : `amount` est fourni par le front. En cas de gratuité
> (campagne / bonus livraison), **le front retire lui-même la livraison** du total
> avant d'envoyer le paiement — le backend ne recalcule ni ne déduit rien.

Les prix RÉELS des menus sont dans **`prices[]`** (`{price, description}`), pas
dans `prix1/prix2/prix3` — ces colonnes existent dans le mapper mais sont NULL
sur toute la base.

**Le supplément livraison + marge n'est porté que par le plat.** Extras et
boissons ne portent que leurs propres frais — sinon chaque supplément ajouterait
une livraison de plus.

> ⚠️ **`pickupAllowed` n'entre pas dans le calcul.** Ce champ dit que le client
> _peut venir récupérer sur place_, pas que la boutique refuse de livrer. Une
> boutique qui ne livre pas ne déclare simplement aucune zone → supplément à 0.
> (Il s'appelait `pickupOnly`, ce qui laissait croire l'inverse et annulait à
> tort le supplément de boutiques qui livrent.)

### Exemple de référence — régime `fastfood`

Plat brut 2000, zones 500 / 800 / 1000, marge 100, commission 5 %, retrait MTN 54.
Le user choisit la zone à **500**.

| Étape                             | Montant                                 |
| --------------------------------- | --------------------------------------- |
| base                              | 2000 + **1000** (zone max) + 100 = 3100 |
| + frais de retrait                | 3154                                    |
| **Plat affiché**                  | `ceil(3154 / 0,95)` = **3320**          |
| + course réelle (`delivery.prix`) | **500**                                 |
| **Le client paie**                | **3820**                                |

Répartition de ce qui est encaissé :

|                                            | Montant  |
| ------------------------------------------ | -------- |
| Commission agrégateur (5 % de 3820)        | 191      |
| Frais de retrait                           | 54       |
| **Le fastfood touche** (2000 + course 500) | **2500** |
| **Yaammoo garde**                          | **1075** |

Les 1075 : zone max 1000 + marge 100 − 25 (commission prise sur la course).
La course encaissée finance exactement la course versée ; l'écart de zone
(1000 − 500) et la marge restent entiers.

### Express ou périodique — deux tarifs par lieu

Un même lieu a **deux prix** : `periodicZones` et `expressZones`. « Bonanjo »
peut valoir 500 en périodique et 900 en express.

| Usage                        | Liste consultée                                                  |
| ---------------------------- | ---------------------------------------------------------------- |
| Prix **affiché** (home)      | max des **deux** listes — le user n'a pas encore choisi son mode |
| `real_price` (à la commande) | la liste du **type réellement choisi** (`orders.delivery.type`)  |

Sans ce filtre, une course express était créditée au tarif périodique et l'écart
tombait dans la marge plateforme.

### Ne jamais inverser le calcul

L'arrondi au supérieur rend l'opération **non réversible** : plat 25 → affiché
`ceil(1125 × 1.05)` = 1182 ; l'inverse donne `1182 ÷ 1.05 − 1100` = **25,71**.

Le prix réel n'est donc **jamais recalculé** : il est servi tel quel depuis la
base, et le réel comme le facturé sont stockés côte à côte
(`order_settlements`, `order_deliveries` — voir
[pricing-settlement.md](./pricing-settlement.md)).

---

## Réglages (`settings`)

Table clé/valeur (migration 019), lue via `services/settings/settings.service`.

| Clé                                                | Défaut              | Rôle                                                                                                                                              |
| -------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform_margin`                                  | 100                 | Marge Yaammoo ajoutée au prix affiché de chaque plat (FCFA)                                                                                       |
| `payment_fee_percent`                              | 5                   | Commission de l'**agrégateur de paiement** (MobileWallet), en % du montant payé, **arrondi à l'entier supérieur**                                 |
| `delivery_free_mode`                               | false               | Campagne « livraison offerte » globale                                                                                                            |
| `apple_review_mode`                                | false               | Mode Apple Review exposé au frontend (migration 036) — voir [payment.md](./payment.md)                                                            |
| `apple_version_review_mode`                        | `""`                | Version d'app exacte en review ; déclenche le bypass paiement (migration 036) — voir [payment.md](./payment.md)                                   |
| `withdrawal_fee_mtn_*` / `withdrawal_fee_orange_*` | 4200 / 54 / 1.2 / 4 | Barème de retrait par **opérateur mobile** : `threshold`, `flat`, `percent`, `addend` (migration 037) — voir [pricing-fees.md](./pricing-fees.md) |
| `price_rounding_step`                              | 500                 | Pas d'arrondi du prix affiché, en livraison PLATEFORME (migration 037)                                                                            |
| `driver_amortization_max`                          | 100                 | Ce que la course peut absorber pour arrondir vers le bas (migration 037)                                                                          |

> ⚠️ `payment_fee_percent` et `withdrawal_fee_*` sont **deux frais distincts** :
> le premier est prélevé par l'agrégateur sur ce qu'il encaisse, le second par
> l'opérateur mobile quand l'argent **sort** du portefeuille. Ne pas appeler le
> premier « commission MTN ».

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

| Situation                        | `deliveryOffer.reason` | Bonus consommé ? |
| -------------------------------- | ---------------------- | ---------------- |
| Campagne active                  | `campaign`             | **Non**          |
| Pas de campagne, bonus armé/code | `bonus`                | Oui              |
| Ni l'un ni l'autre               | `null`                 | —                |

**La campagne prime et laisse le bonus intact.** Brûler le bonus d'un user
pendant une période où la livraison est de toute façon offerte à tout le monde
serait une perte sèche pour lui.

> ⚠️ **Les prix de livraison ne sont JAMAIS forcés à 0**, campagne ou pas. Ce qui
> change, c'est que `delivery.prix` n'est plus **ajouté au total** (cf. la section
> « deux livraisons » plus haut) ; la course due est alors absorbée selon
> `covered_by` — voir [pricing-settlement.md](./pricing-settlement.md).

Forme de `deliveryOffer` : voir [bonus-delivery-offer.md](./bonus-delivery-offer.md#deliveryoffer--objet-unique-partagé).

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
│   │   ├── withdrawalFees.js                        # barème de retrait par opérateur
│   │   ├── deliveryGroupKey.js                      # clé « un départ »
│   │   └── deliveryOfferResolver.js                 # arbitrage campagne / bonus
│   ├── fastfood/getFastFoods.js                     # applique les prix affichés
│   └── order/settleDelivery.service.js              # règlement au passage en `pending`
└── repositories/supabase/
    ├── settings.repo.js
    ├── orderSettlements.repo.js                     # l'argent (toute commande)
    └── orderDeliveries.repo.js                      # la course (si livrée)
```

## Migrations

| Fichier                                    | Contenu                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `019_settings.sql`                         | table `settings` + valeurs initiales (`ON CONFLICT DO NOTHING`)                                                                            |
| `020_order_deliveries.sql`                 | table `order_deliveries` + contraintes + index                                                                                             |
| `021_order_deliveries_group.sql`           | `delivery_group_id`, `course_billed`, `items_real`, `items_charged`, `payment_fee`                                                         |
| `022_orders_group_id.sql`                  | `orders.group_id` — commandes d'un même panier (cf. [orders.md](./orders.md))                                                              |
| `023_order_settlements.sql`                | table `order_settlements` (l'argent) ; sort les montants globaux de `order_deliveries`, qui ne garde que la course                         |
| `024_platform_revenues.sql`                | grand livre des revenus — **socle, pas encore alimenté**                                                                                   |
| `025_fastfoods_pickup_allowed.sql`         | `pickup_only` → `pickup_allowed` : le champ disait l'inverse de son usage                                                                  |
| `026_order_deliveries_platform_margin.sql` | ajoute `platform_margin` à `order_deliveries` (manquait en prod : `CREATE TABLE IF NOT EXISTS` de la 020 n'altère pas une table existante) |
| `036_settings_apple_review.sql`            | `apple_review_mode` + `apple_version_review_mode` — sort le mode Apple Review de `.env`                                                    |
| `037_delivery_by_platform.sql`             | `fastfoods.delivery_by`, `platform_delivery_zones`, barèmes de retrait, pas d'arrondi                                                      |
