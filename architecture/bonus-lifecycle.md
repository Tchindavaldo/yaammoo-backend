# Bonus — cycle de vie (réclamation, livraison, solde, code)

> **Prérequis** : le modèle de données (`bonus`, `bonus_requests`, `is_current`)
> est dans [bonus.md](./bonus.md). Ne pas lire ce fichier seul.

| Besoin                                       | Fichier                                              |
| -------------------------------------------- | ---------------------------------------------------- |
| Modèle de données, routes, `criteria`        | [bonus.md](./bonus.md)                               |
| Livraison offerte, armement, `deliveryOffer` | [bonus-delivery-offer.md](./bonus-delivery-offer.md) |
| Validation de la définition, autorisation    | [bonus-definition.md](./bonus-definition.md)         |
| Codes d'erreur                               | [validation-errors.md](./validation-errors.md)       |

## Flux réclamation (`POST /bonus/:id/claim`)

Auto-approuvé, avec vérification d'éligibilité côté backend (source de vérité) :

1. `firebaseAuth` → `req.user.uid` ; `:id` = bonusId.
2. Charge la définition (`bonus.getById`) → 404 si absent ; 400 si `active === false`.
3. **Éligibilité** (`bonusStats.util:isBonusEligible`) :
   - `order_count` → `bonusStats[period].count >= criteria.target`.
   - `amount_spent` → `bonusStats[period].amount >= criteria.target`.
   - `status_view` → **toujours éligible** (aucun palier de commandes ; la preuve
     est l'action externe, contrôlée par l'admin avant livraison des accès).
   - sinon → 400 « Palier non atteint (metric/target) ».
4. **Anti-doublon** : 409 si une réclamation est déjà `pending` ou `approved` non consommée.
5. Ajoute une entrée `{status:'approved', target, period, createdAt}` dans le
   `bonus_request`. Nouvelle demande →
   `create` avec `usageCount:0, redeemed:false`.
   ⚠️ Si le bonus est `requiresRewardCredentials`, l'entrée reste `pending` :
   cf. [Flux livraison manuelle](#flux-livraison-manuelle-post-bonusrequestidreward-credentials).
6. Notifie le user (best-effort, non bloquant).

> Réponse : `{ success, message, data:{ bonusId, requestStatus, claimedAt, userClaimedCount } }`.

## Flux livraison manuelle (`POST /bonus/request/:id/reward-credentials`)

Pour les bonus `requiresRewardCredentials` (Netflix, clé de jeu…), le claim n'est
pas auto-approuvé : il reste `pending` jusqu'à ce qu'un **admin** (bonus plateforme)
ou le **marchand propriétaire** (bonus de boutique) fournisse les identifiants.

⚠️ `:id` = id du **bonus_request**, pas du bonus.

1. Charge la réclamation + le bonus → 404 si absents.
2. **Autorisation** : admin, ou propriétaire de la boutique du bonus. Un bonus
   plateforme (`fastFoodId` null) exige `isAdmin` → sinon 403.
3. **Validation du profil** (cf. ci-dessous) → 400 si incomplet.
4. Cible : dernière entrée `pending` ; à défaut, dernière entrée `approved`
   (**correction** d'accès déjà livrés — cf. ci-dessous). 409 si aucune des deux.
5. L'entrée passe `approved` + `rewardCredentials`, `credentialsSentAt`,
   `credentialsSentBy` ; le code est généré s'il n'existe pas encore.
6. Notifie le user : socket `bonus.reward_credentials` (room `<userId>`) + push.

> **Relance hors ligne** : cet event passe par **`reliableEmit`** (persisté dans
> `outbox_events`, rejoué au prochain `join_user`). C'est le moment où le bonus
> devient réellement utilisable : un user hors ligne à la livraison resterait
> sinon sur une réclamation `pending` jusqu'à son prochain `GET /bonus/all`.
> Le payload rejoué porte `__eventId` et `__replay: true` — le front **doit ACK**
> (callback socket.io) pour que l'event cesse d'être rejoué.
>
> Les autres events du parcours (`bonus.claimed`, `bonus.flyer_downloaded`) restent
> en émission simple : ils confirment une action que le user vient de faire, donc
> il est en ligne par construction. `bonus.activation_changed` est un **broadcast
> global**, hors du mécanisme de rejeu qui est par user.

> Le solde a **déjà** été décrémenté au claim : la livraison ne touche pas aux
> `consumedOrderIds`.

### Correction d'une livraison déjà faite

Le même endpoint accepte une réclamation **déjà `approved`** : il remplace alors
`rewardCredentials` au lieu de livrer. Utile quand un bonus passe `requiresProfile`
après coup et que d'anciennes livraisons n'ont pas de `profile` — sans quoi il
faudrait re-livrer et invalider le code du user.

Dans ce mode :

- `code` et `claimedAt` d'origine sont **conservés** ;
- `startsAt` / `expiresAt` sont **inchangés** : `validityStartsAt` reste figé à la
  première livraison, une correction ne prolonge pas la validité ;
- `usageCount` / `redeemed` sont **préservés** (les remettre à zéro rendrait au
  user des utilisations déjà consommées) ;
- le socket `bonus.reward_credentials` est **réémis** avec les nouveaux identifiants ;
- la notification dit « Bonus mis à jour » et non « disponible » ;
- la réponse renvoie `Identifiants mis à jour avec succès.`

### Forme de `rewardCredentials`

Objet **libre** (stocké en JSONB dans l'entrée `status`) : la forme varie selon le
type de bonus — login/password, clé, lien… Il est renvoyé tel quel dans la réponse,
dans le payload socket, et dans `GET /bonus/all` (via `deriveRequestState`).

**Bonus à profil** — bonus dont la colonne **`requires_profile`** vaut `true`
(migration 017) : l'accès passe par un profil nominatif protégé par son propre code
(Netflix : compte partagé, un profil + un code par utilisateur). `profile` y est donc
**obligatoire**, avec `name` ET `code` en chaînes non vides :

```json
{
  "login": "compte@netflix.com",
  "password": "s3cr3t",
  "profile": { "name": "Profil 3", "code": "4821" }
}
```

Sans `profile.name` / `profile.code` → **400** : les identifiants de compte seuls ne
permettent pas d'entrer sur le profil, on refuse de livrer des accès inutilisables.
Les bonus `requires_profile = false` (livraison offerte, réduction…) ne sont pas concernés.

> L'exigence est **une donnée du bonus**, pas une liste de types codée en dur ni une
> variable d'environnement : marquer un nouveau bonus comme « à profil » se fait via
> `PATCH /bonus/:id` (`requiresProfile: true`) ou directement en base, **sans
> redéploiement**. Le champ est indépendant de `type`, qui reste une chaîne libre.

> Les autres clés (`login`, `password`…) sont **libres et non validées** : elles
> transitent telles quelles. Seul `profile` fait l'objet d'un contrat.

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

| Commandes | Entrées `approved`        | `bonusStats.month.count`            |
| --------- | ------------------------- | ----------------------------------- |
| 5         | —                         | `5 − 0` = **5** → palier atteint ✅ |
| 5         | `[{target:5}]`            | `5 − 5` = **0** ← décrémenté        |
| 8         | `[{target:5}]`            | `8 − 5` = **3** ← remonte           |
| 10        | `[{target:5}]`            | `10 − 5` = **5** → ré-atteint ✅    |
| 10        | `[{target:5},{target:5}]` | `10 − 10` = **0**                   |

### Règles

- ⚠️ **Seules les entrées de la fenêtre courante sont déduites**
  (`createdAt >= windowStart(period)`). Une réclamation de juin ne grève pas le
  solde de juillet, sinon le solde deviendrait négatif au changement de mois.
- Seule la métrique du `criteria.kind` est décrémentée (`order_count` → `count`,
  `amount_spent` → `amount`), et uniquement sur `criteria.period`.
- Jamais en dessous de 0.
- `status_view` → **aucun décrément** : sans `target`, `measureConsumption()`
  renvoie 0 et le claim ne dépense aucune commande.
- **L'éligibilité s'évalue sur le solde décrémenté** : un palier déjà consommé
  ne peut pas être re-réclamé sans nouvelles commandes.

Implémentation : `bonusStats.util.js` → `consumedInWindow()` + `applyConsumption()`.

---

## Code bonus & consommation

À la réclamation, le backend génère un **code** (`bonusCode.util`, ex.
`YAM-7K3F9QW2`, alphabet sans caractères ambigus). Il identifie la réclamation ;
il n'existe **aucun endpoint de redemption manuelle** (`POST /bonus/redeem` a été
supprimé — il n'était appelé par personne).

> **Longueur du code : 8 caractères** (31⁸ ≈ 852 milliards). À 6, on tombait à
> ~887 millions : avec 1M de codes vivants, ~0,1% de collision par génération —
> soit un échec d'insert (index unique) remonté au user. `generateUniqueBonusCode()`
> ajoute en plus un pré-contrôle avec retry (5 tentatives).

### Un seul chemin de consommation (`usageCount++`)

| Déclencheur                     | Service                | Fichier                                                                             |
| ------------------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| Commande avec livraison offerte | `consumeDeliveryBonus` | `services/bonus/applyDeliveryBonus.service.js` (appelé par `settleDeliveryService`) |

Puis : `usageCount++`, et `redeemed = true` dès que `usageLimit` est atteint.
Persisté via `bonusRequests.updateUsage()`. Une **nouvelle réclamation ouvre un
nouveau cycle** : code neuf, `usageCount` remis à 0.

**Les bonus `requiresRewardCredentials` (Netflix, clé…) ne consomment rien** :
leur contrepartie est la **livraison des identifiants**
(`POST /bonus/request/:id/reward-credentials`), qui notifie par le socket
`bonus.reward_credentials` + push. Leur cycle se ferme à l'expiration
(`startsAt + claimDuration`), pas par un compteur.

### Départ de validité (`startsAt`)

`expiresAt` se calcule depuis **`startsAt`**, jamais depuis `claimedAt` :

| Cas                               | `startsAt`                      |
| --------------------------------- | ------------------------------- |
| Bonus normal                      | `claimedAt` (date du claim)     |
| Bonus `requiresRewardCredentials` | date de **livraison** des accès |

Pourquoi : l'entrée d'un bonus Netflix est créée `pending` au claim et n'est
honorée qu'à la livraison par l'admin/marchand. Compter depuis `claimedAt` ferait
perdre au user tous les jours d'attente — il pouvait même recevoir des accès déjà
expirés.

La date est persistée dans `status[].validityStartsAt` (JSONB, pas de migration) et
**figée à la première livraison** : corriger/compléter des identifiants ensuite
(`isCorrection`) réécrit `credentialsSentAt` mais **ne prolonge pas** la fenêtre.

Tant que la réclamation est `pending`, `startsAt` et `expiresAt` valent `null` :
rien n'expire avant d'avoir été livré. Implémenté par `deriveRequestState` /
`computeExpiresAt` (`services/bonus/enrichBonusForUser.js`) — tous les call-sites
(`claimBonus`, `deliveryOffer`, `rewardCredentialsBonus`) passent `startsAt`.

**Socket `bonus.redeemed`** (room `<userId>`, via `reliableEmit`) : émis à chaque
consommation par `consumeDeliveryBonus`. Payload :
`{ data: { bonusId, code, usageCount, usageLimit, remainingUses, redeemed } }`.
C'est le seul event qui suit le compteur d'utilisations ; tous les appareils du user
restent ainsi synchronisés sans re-GET.

`code`, `usage_count` et `redeemed` sont des **colonnes réelles** (migration 014),
avec un index **unique** sur `code` : `findByCode` scannait auparavant toute la
table via `extra_data->>'code'`.

**Champs ajoutés au `GET /bonus/all`** : `code`, `expiresAt`, `expired`,
`remainingUses`.

---
