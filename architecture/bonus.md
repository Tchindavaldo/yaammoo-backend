# Feature — Bonus (Système de Fidélité par Paliers)

## Rôle

Système de récompenses par **paliers** : un fastfood (ou la plateforme Yaammoo)
propose des bonus (Netflix offert, livraison gratuite, repas offert, réduction…)
débloqués quand le user atteint un quota — nombre de commandes OU montant dépensé —
sur une fenêtre glissante (jour / semaine / mois), ou d'office (`welcome`).

> ⚠️ Doc réécrite pour le nouveau modèle. L'ancien système (codes promo
> `SUMMER2025`, `percentage/fixed`, parrainage) est obsolète.

---

## Routes

| Méthode | Endpoint | Contrôleur | Protégé | Rôle |
|---------|----------|-----------|---------|------|
| POST | `/bonus` | `postBonusController` | Non | Crée un bonus (définition seule) |
| GET | `/bonus/all` | `getBonusController` | **Oui** (`firebaseAuth`) | Liste les bonus **enrichis pour le user courant** |
| POST | `/bonus/:id/claim` | `claimBonusController` | **Oui** (`firebaseAuth`) | **Réclame** un bonus (auto-approuvé, palier vérifié backend) |
| POST | `/bonusRequest/:totalBonus` | `postBonusRequestController` | — | Le user réclame un bonus |
| GET | `/bonusRequest/status/:id` | `getBonusRequestStatusController` | — | Statut d'une demande |

---

## Modèle de données

### Stockage (table `bonus`)

La table `bonus (id, data JSONB, created_at)` ne stocke **QUE la définition** du
bonus. Aucun champ dépendant du user n'est persisté ici.

**Définition (persistée) :**

```jsonc
{
  "id": "bns_123",
  "type": "netflix",            // chaîne libre : netflix | free_delivery | free_meal | discount | <futur>
  "name": "1 mois Netflix offert",
  "description": "…",
  "criteria": {
    "kind": "amount_spent",     // "welcome" | "order_count" | "amount_spent"
    "target": 50000,            // palier (nb commandes OU montant FCFA) ; absent si welcome
    "period": "month"           // "day" | "week" | "month" ; ignoré si welcome
  },
  "fastFoodId": "ff_42",        // null/absent = bonus plateforme Yaammoo
  "fastFoodName": "Burger Palace", // requis si fastFoodId présent
  "active": true,
  "claimDuration": 30,          // validité du code après réclamation (jours)
  "usageLimit": 3,              // nb d'utilisations autorisées du code
  "createdAt": "2026-06-18T10:00:00.000Z"
}
```

### Champs recalculés au `GET /bonus/all` (jamais persistés dans `bonus`)

Fusionnés dans chaque bonus à la lecture, pour le user authentifié :

| Champ | Source | Calcul |
|---|---|---|
| `bonusStats.{day,week,month}` | table `orders` | Agrégation `{count, amount}` des commandes **non annulées** du user pour `fastFoodId` (toutes si bonus plateforme), par fenêtre calendaire UTC (jour / lundi→ / 1er du mois). |
| `fastFoodBonusCount` | liste `bonus` | Nb de bonus partageant le même `fastFoodId`. |
| `totalClaimedCount` | table `bonus_requests` | Nb total d'entrées de statut accordé (`approved`/`completed`) pour ce bonus, tous users. |
| `userClaimedCount` | `bonus_requests` du user | Nb d'entrées accordées dans la demande du user pour ce bonus. |
| `requestStatus` | `bonus_requests` du user | `none` / `pending` / `approved` (dérivé du tableau `status`). |
| `claimedAt` | `bonus_requests` du user | `createdAt` de la dernière entrée accordée. |
| `usageCount` | `bonus_requests` du user | Depuis `extra_data.usageCount` (flux de redemption à venir), défaut `0`. |
| `redeemed` | `bonus_requests` du user | Depuis `extra_data.redeemed`, défaut `false`. |

> ⚠️ **Décrémentation du solde** : le payload prévoit que `bonusStats` se
> décrémente de `criteria.target` à chaque bonus activé. Cette logique relève du
> **flux d'ACTIVATION** (à implémenter) et n'est **pas** faite au GET : ici on ne
> calcule que la progression **brute** depuis les commandes.

---

## Architecture (fichiers)

```
src/
├── routes/bonusRoute.js                       # GET /bonus/all protégé (firebaseAuth)
├── controllers/bonus/getBonus.controller.js   # extrait req.user.uid → service
├── services/bonus/
│   ├── getBonus.service.js                     # orchestration (charge + enrichit)
│   ├── enrichBonusForUser.js                   # fusion définition + user + compteurs
│   └── bonusStats.util.js                      # calcul bonusStats depuis orders
└── repositories/supabase/
    ├── bonus.repo.js                           # getAll / getById / create
    └── bonusRequests.repo.js                   # + getByUser, claimCountsByBonus
```

**Flux `GET /bonus/all` :**

1. `firebaseAuth` valide le Bearer → `req.user.uid`.
2. `getBonusService(userId)` charge en parallèle : définitions bonus, commandes du
   user (`orders.getByUser`), demandes du user (`bonusRequests.getByUser`),
   compteurs globaux de réclamations (`bonusRequests.claimCountsByBonus`).
3. Pour chaque bonus, `enrichBonusForUser` fusionne définition + `bonusStats`
   (via `computeBonusStats`) + compteurs + état de la demande.
4. Réponse : `{ success, message, data: [ …bonus enrichis… ] }`.

---

## Règles de calcul `bonusStats`

- **Statuts exclus** : `cancelByUser`, `cancelByFastFood` (commande annulée ne
  compte pas). Cf. `bonusStats.util.js:EXCLUDED_STATUSES`.
- **Fenêtres (UTC, calendaires)** :
  - `day` : depuis minuit UTC du jour courant.
  - `week` : depuis lundi 00:00 UTC de la semaine courante.
  - `month` : depuis le 1er du mois 00:00 UTC.
- **`count`** = nb de commandes qualifiantes ; **`amount`** = somme de `total`.
- Bonus plateforme (`fastFoodId` null) : agrégation sur **toutes** les commandes
  du user, tous fastfoods confondus.

---

## Erreurs

- 401 : Token manquant ou invalide (`GET /bonus/all`).
- 500 : Erreur serveur lors de la récupération.
- Liste vide → `200` avec `data: []` (pas de 404).

---

## Flux réclamation (`POST /bonus/:id/claim`)

Auto-approuvé, avec vérification d'éligibilité côté backend (source de vérité) :

1. `firebaseAuth` → `req.user.uid` ; `:id` = bonusId.
2. Charge la définition (`bonus.getById`) → 404 si absent ; 400 si `active === false`.
3. **Éligibilité** (`bonusStats.util:isBonusEligible`) :
   - `welcome` → toujours éligible.
   - `order_count` → `bonusStats[period].count >= criteria.target`.
   - `amount_spent` → `bonusStats[period].amount >= criteria.target`.
   - sinon → 400 « Palier non atteint (metric/target) ».
4. **Anti-doublon** : 409 si une réclamation est déjà `pending` ou `approved` non consommée.
5. Ajoute une entrée `{status:'approved', target, period, createdAt}` dans le
   `bonus_request` (bonus_type = `loyalty`, isolé du legacy). Nouvelle demande →
   `create` avec `usageCount:0, redeemed:false`.
6. Notifie le user (best-effort, non bloquant).

> Réponse : `{ success, message, data:{ bonusId, requestStatus, claimedAt, userClaimedCount } }`.

## TODO (étapes suivantes)

- Flux **activation** avec décrémentation du solde `bonusStats` de `criteria.target`.
- Flux **redemption** (`usageCount`, `usageLimit`, `redeemed`, `claimDuration`).
- Validateur de définition de bonus (`criteria.kind`, `target`, `period`, cohérence
  `fastFoodId`/`fastFoodName`).
