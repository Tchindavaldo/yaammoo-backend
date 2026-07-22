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
plat affiché    = ceil( (prix fastfood + livraison LA PLUS CHÈRE + marge) × 1.05 )
extra affiché   = ceil( prix extra   × 1.05 )
boisson affiché = ceil( prix boisson × 1.05 )

montant payé    = SOMME de ce que le user voit
```

> ⚠️ **Aucun frais n'est jamais ajouté à la fin.** Les 5 % sont déjà dans chaque
> prix affiché : le user paie tout sans voir de ligne de frais ni de taxe. Ils
> sont appliqués **une fois par prix**, jamais multipliés par la quantité.

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

### Exemple de référence

Plat 2000, zones 500 / 800 / 1000, marge 100, frais 5 %.

| | Montant |
|---|---|
| Avant frais | 2000 + 1000 + 100 = 3100 |
| **Prix affiché** | `ceil(3100 × 1.05)` = **3255** |
| Le fastfood touche (zone 500) | 2000 + 500 = **2500** |
| Frais prestataire | **155** |
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
base, et `order_deliveries` stocke le réel et le facturé côte à côte.

### Vue marchand

Le propriétaire d'une boutique reçoit ses **prix réels** — plat, extras et
boissons (`pricing.applied: false`) : sinon il ne pourrait plus gérer son
catalogue. Même endpoint, réponse différente selon l'appelant : c'est une
distinction de **rôle**, pas de version d'app.

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

## Réglages (`settings`)

Table clé/valeur (migration 019), lue via `services/settings/settings.service`.

| Clé | Défaut | Rôle |
|---|---|---|
| `platform_margin` | 100 | Marge Yaammoo ajoutée au prix affiché de chaque plat (FCFA) |
| `payment_fee_percent` | 5 | Frais prestataire, en % du montant payé, **arrondi à l'entier supérieur** |
| `delivery_free_mode` | false | Campagne « livraison offerte » globale |

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

## Vérité comptable (`order_deliveries`)

Table 1-1 avec `orders` (migrations 020 et 021), écrite par
`services/order/settleDelivery.service.js`.

| Colonne | Sens | Audience |
|---|---|---|
| `real_price` | prix de la zone choisie | ce que touche le **fastfood** |
| `charged_price` | livraison facturée (la plus chère × quantité) | ce qu'a payé le **user** |
| `platform_margin` | écart + marge plateforme | bénéfice **Yaammoo** |
| `items_real` | plat + extras + boissons, hors livraison et frais | le **fastfood** |
| `items_charged` | total réellement payé hors livraison | le **user** |
| `payment_fee` | les 5 % contenus dans les prix affichés | le **prestataire** |
| `delivery_group_id` | relie les commandes d'un même panier + boutique | — |
| `course_billed` | `true` sur une seule ligne du groupe | comptabilité |
| `delivered` | `false` = à emporter → **marge pure** | comptabilité |
| `free_reason` | `bonus` \| `campaign` \| null | motif de gratuité |
| `covered_by` | `fastfood` \| `platform` | qui renonce au montant |
| `bonus_id` / `bonus_code` | bonus appliqué | suivi |

**`platform_margin` n'est jamais négatif** (contrainte SQL) : une gratuité fait
renoncer à un gain, elle ne crée pas une dépense.

### Panier : une seule course par boutique

Une commande = **un plat**. Un panier de 3 plats fait donc 3 commandes, alors que
le livreur ne se déplace qu'une fois.

Plutôt que de mettre `real_price = 0` sur les commandes non facturées — ce qui
effacerait l'information — **le prix réel de la zone est conservé sur chaque
ligne**, et `course_billed` marque celle qui porte réellement la course.
`delivery_group_id` les relie.

> La comptabilité somme `real_price WHERE course_billed = TRUE`.

Deux boutiques dans un même panier = **deux courses**, chacune facturée une fois.

### À emporter : marge pure

Le supplément livraison est fondu dans le prix du plat **depuis le home**, avant
que le user ait choisi son mode. S'il vient chercher sa commande lui-même, il l'a
donc déjà payé — mais il n'y a **aucune course à verser au fastfood**. Le montant
part intégralement en marge. C'est le modèle économique retenu : le prix affiché
ne baisse jamais.

| | Livré (zone 500) | À emporter |
|---|---|---|
| `charged_price` | 1 000 | 1 000 |
| `real_price` | 500 | **0** |
| `delivered` | `true` | **`false`** |
| `course_billed` | `true` | `false` |
| `platform_margin` | 600 | **1 100** |

`delivered` est un champ **explicite** : déduire le mode d'un `real_price = 0`
serait fragile — 0 vaut aussi pour « boutique sans zone déclarée » ou « course
mutualisée avec une autre commande du panier ».

> Ces commandes étaient auparavant **ignorées** par le règlement : ni marge ni
> frais n'étaient tracés.

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
    └── orderDeliveries.repo.js
```

## Migrations

| Fichier | Contenu |
|---|---|
| `019_settings.sql` | table `settings` + valeurs initiales (`ON CONFLICT DO NOTHING`) |
| `020_order_deliveries.sql` | table `order_deliveries` + contraintes + index |
| `021_order_deliveries_group.sql` | `delivery_group_id`, `course_billed`, `items_real`, `items_charged`, `payment_fee` |
| `022_orders_group_id.sql` | `orders.group_id` — commandes d'un même panier (cf. [orders.md](./orders.md)) |
| `023_order_deliveries_delivered.sql` | `delivered` — livré ou à emporter (marge pure) |
