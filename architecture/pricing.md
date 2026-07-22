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
prix affiché d'un plat = prix fastfood + livraison LA PLUS CHÈRE + marge plateforme
montant payé           = prix affiché × quantité (+ extras/boissons)
frais de paiement      = ceil(montant payé × payment_fee_percent / 100)
```

**Pourquoi la livraison la plus chère** : une boutique a plusieurs zones à des
prix différents, et le home ne sait pas encore où le user se fera livrer. En
prenant le maximum, le prix annoncé couvre toutes les zones — il ne peut jamais
manquer. Si le user choisit ensuite une zone moins chère, **l'écart reste à la
plateforme**.

### Exemple de référence

Plat 2000, zones 500 / 800 / 1000, marge 100, frais 5 %.

| | Montant |
|---|---|
| Prix affiché | 2000 + 1000 + 100 = **3100** |
| Frais de paiement | `ceil(3100 × 5%)` = **155** → vont au **prestataire**, pas à Yaammoo |
| Le user paie | **3255** |
| Le fastfood touche (zone 500) | 2000 + 500 = **2500** |
| Yaammoo garde | (1000 − 500) + 100 = **600** |

Le user ne voit **jamais** la ligne livraison : elle est déjà fondue dans le
prix du plat.

### Vue marchand

Le propriétaire d'une boutique reçoit ses **prix réels** (`pricing.applied:
false`) : sinon il ne pourrait plus gérer son catalogue. Même endpoint, réponse
différente selon l'appelant — c'est une distinction de **rôle**, pas de version
d'app.

`extra` et `drink` ne sont **pas** majorés : le supplément est porté une seule
fois, par le plat.

### Quantité — asymétrie voulue

Le supplément est porté par le prix **unitaire**, donc facturé sur **chaque
plat**. Le fastfood, lui, ne touche qu'**une seule course** : celle de la zone
choisie, quelle que soit la quantité. Tout l'écart revient à la plateforme —
c'est le levier de marge.

Plat 2000, zones 500/800/1000, marge 100, **quantité 2** :

| | Montant |
|---|---|
| Facturé au user | 2 × 1100 = **2200** de supplément |
| Versé au fastfood | **500** (une seule course) |
| Marge plateforme | **1700** |

`order_deliveries` enregistre exactement cette asymétrie : `charged_price`
multiplié par la quantité, `real_price` compté une fois.

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

Table 1-1 avec `orders` (migration 020), écrite par
`services/order/recordOrderDelivery.js` après création de la commande.

| Colonne | Sens | Audience |
|---|---|---|
| `real_price` | prix de la zone choisie | ce que touche le **fastfood** |
| `charged_price` | livraison facturée (la plus chère) | ce qu'a payé le **user** |
| `platform_margin` | écart + marge plateforme | bénéfice **Yaammoo** |
| `free_reason` | `bonus` \| `campaign` \| null | motif de gratuité |
| `covered_by` | `fastfood` \| `platform` | qui renonce au montant |
| `bonus_id` / `bonus_code` | bonus appliqué | suivi |

**`platform_margin` n'est jamais négatif** (contrainte SQL) : une gratuité fait
renoncer à un gain, elle ne crée pas une dépense.

- Bonus **de boutique** → `covered_by = 'fastfood'` : le marchand renonce à sa
  course, la plateforme conserve intégralement ce qu'elle avait ajouté.
- Bonus **plateforme** / campagne → `covered_by = 'platform'` : Yaammoo renonce
  à sa marge livraison ; la marge plat (`platform_margin` de base) est conservée.

**Non bloquant** : la commande est déjà créée quand on écrit ici. Un incident
comptable ne doit pas faire échouer une commande payée — il est journalisé
bruyamment.

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
│   └── order/recordOrderDelivery.js                 # écrit order_deliveries
└── repositories/supabase/
    ├── settings.repo.js
    └── orderDeliveries.repo.js
```

## Migrations

| Fichier | Contenu |
|---|---|
| `019_settings.sql` | table `settings` + valeurs initiales (`ON CONFLICT DO NOTHING`) |
| `020_order_deliveries.sql` | table `order_deliveries` + contraintes + index |
