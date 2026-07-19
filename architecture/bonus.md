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
| POST | `/bonus/:id/claim` | `claimBonusController` | **Oui** (`firebaseAuth`) | **Réclame** un bonus (auto-approuvé, palier vérifié backend) → renvoie un **code** |
| POST | `/bonus/redeem` | `redeemBonusController` | **Oui** (`firebaseAuth`) | **Consomme** une utilisation du code (à la commande) |
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
| `bonusStats.{day,week,month}` | `orders` + `bonus_requests` | Agrégation `{count, amount}` des commandes **non annulées** du user pour `fastFoodId` (toutes si bonus plateforme), par fenêtre calendaire UTC, **moins les paliers déjà consommés** (cf. § Décrément). |
| `code` | `bonus_requests` du user | Code de réclamation actif (`extra_data.code`), `null` si non réclamé. |
| `expiresAt` / `expired` | calculé | `claimedAt + claimDuration` jours, et comparaison à `now`. |
| `remainingUses` | calculé | `usageLimit − usageCount`, `null` si pas de limite. |
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
│   ├── claimBonus.service.js                   # réclamation (= activation) + code
│   ├── redeemBonus.service.js                  # consommation d'une utilisation
│   ├── enrichBonusForUser.js                   # fusion définition + user + compteurs
│   ├── bonusStats.util.js                      # bonusStats, décrément, éligibilité
│   └── bonusCode.util.js                       # génération/normalisation du code
└── repositories/supabase/
    ├── bonus.repo.js                           # getAll / getById / create
    └── bonusRequests.repo.js                   # + getByUser, claimCountsByBonus,
                                                #   findByCode, updateExtraData
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

## Décrément du solde (activation)

**L'activation est fusionnée avec la réclamation** : réclamer = activer. Il n'y a
pas d'endpoint `/activate` séparé.

### D'où vient l'information « ce bonus a été activé » ?

Chaque réclamation persiste son palier consommé dans le tableau `status` du
`bonus_request` :

```jsonc
{ "status": "approved", "target": 50000, "period": "month", "createdAt": "2026-07-10T08:00:00Z" }
```

Ces entrées **s'accumulent** : c'est l'historique des activations, et donc la
source de vérité du décrément. **Rien d'autre n'est stocké.**

### Formule (appliquée à chaque GET)

```
solde_affiché = brut(orders) − Σ(target des entrées `approved` de la fenêtre courante)
```

Le brut ne descend jamais (il vient des commandes, immuables) ; c'est la somme
des paliers consommés qui monte. La soustraction produit l'effet « redescend
puis remonte » :

| Commandes | Entrées `approved` | `bonusStats.month.count` |
|---|---|---|
| 5 | — | `5 − 0` = **5** → palier atteint ✅ |
| 5 | `[{target:5}]` | `5 − 5` = **0** ← décrémenté |
| 8 | `[{target:5}]` | `8 − 5` = **3** ← remonte |
| 10 | `[{target:5}]` | `10 − 5` = **5** → ré-atteint ✅ |
| 10 | `[{target:5},{target:5}]` | `10 − 10` = **0** |

### Règles

- ⚠️ **Seules les entrées de la fenêtre courante sont déduites**
  (`createdAt >= windowStart(period)`). Une réclamation de juin ne grève pas le
  solde de juillet, sinon le solde deviendrait négatif au changement de mois.
- Seule la métrique du `criteria.kind` est décrémentée (`order_count` → `count`,
  `amount_spent` → `amount`), et uniquement sur `criteria.period`.
- Jamais en dessous de 0.
- `welcome` → aucun décrément.
- **L'éligibilité s'évalue sur le solde décrémenté** : un palier déjà consommé
  ne peut pas être re-réclamé sans nouvelles commandes.

Implémentation : `bonusStats.util.js` → `consumedInWindow()` + `applyConsumption()`.

---

## Flux redemption (`POST /bonus/redeem`)

À la réclamation, le backend génère un **code** (`bonusCode.util:generateBonusCode`,
ex. `YAM-7K3F9Q`, alphabet sans caractères ambigus). Le user le présente à la
commande ; le front appelle `/bonus/redeem` pour signaler la consommation.

Contrôles, dans l'ordre :

1. Code connu (`findByCode`) → 404 sinon.
2. Code appartenant au user authentifié → 403 sinon.
3. Réclamation `approved` et non entièrement consommée → 400 / 409.
4. Non expiré : `claimedAt + claimDuration` jours → 400 sinon.
5. `usageCount < usageLimit` → 409 sinon.

Puis : `usageCount++`, et `redeemed = true` dès que `usageLimit` est atteint.
Persisté via `bonusRequests.updateExtraData()` (fusionne `extra_data` sans
écraser les autres clés). Une **nouvelle réclamation ouvre un nouveau cycle** :
code neuf, `usageCount` remis à 0.

**Champs ajoutés au `GET /bonus/all`** : `code`, `expiresAt`, `expired`,
`remainingUses`.

---

## TODO (étapes suivantes)

- **Validateur de définition** de bonus (`criteria.kind`, `target`, `period`,
  cohérence `fastFoodId`/`fastFoodName`) + branchement dans `POST /bonus`
  (aujourd'hui `req.body` est écrit en base sans contrôle).
- **Perf** : `totalClaimedCount` (`claimCountsByBonus`) scanne toute la table
  `bonus_requests` à chaque GET — à dénormaliser quand le volume grossira.
