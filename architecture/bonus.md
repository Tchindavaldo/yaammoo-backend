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
| POST | `/bonus` | `postBonusController` | **Oui** (`firebaseAuth`) | Crée un bonus (définition seule, **validée**, marchand propriétaire ou admin) |
| GET | `/bonus/all` | `getBonusController` | **Oui** (`firebaseAuth`) | Liste les bonus **enrichis pour le user courant** |
| POST | `/bonus/:id/claim` | `claimBonusController` | **Oui** (`firebaseAuth`) | **Réclame** un bonus (auto-approuvé, palier vérifié backend) → renvoie un **code** |
| POST | `/bonus/:id/arm` | `armBonusController` | **Oui** (`firebaseAuth`) | **Arme** un bonus livraison pour la prochaine commande éligible — ne consomme rien |
| DELETE | `/bonus/:id/arm` | `disarmBonusController` | **Oui** (`firebaseAuth`) | Désarme |
| POST | `/bonus/verify` | `verifyBonusCodeController` | Non | **Vérifie** un code (lecture seule, aucune écriture) |
| POST | `/bonus/redeem` | `redeemBonusController` | **Oui** (`firebaseAuth`) | **Consomme** une utilisation du code — saisie manuelle par le marchand |
| PATCH | `/bonus/:id` | `patchBonusController` | **Oui** (`firebaseAuth`) | Modifie un bonus (champs de définition, `active`, `requiresProfile`…) — marchand propriétaire ou admin |
| POST | `/bonus/request/:id/reward-credentials` | `rewardCredentialsBonusController` | **Oui** (`firebaseAuth`) | **Livre** une réclamation `pending`, ou **corrige** des identifiants déjà livrés — admin ou marchand propriétaire |
| POST | `/bonusRequest/:totalBonus` | `postBonusRequestController` | — | Le user réclame un bonus |
| GET | `/bonusRequest/status/:id` | `getBonusRequestStatusController` | — | Statut d'une demande |

---

## Modèle de données

### Stockage (table `bonus`)

La table `bonus` ne stocke **QUE la définition** du bonus. Aucun champ dépendant
du user n'est persisté ici.

**Colonnes structurées** (migration 014) : `type`, `name`, `description`,
`criteria`, `fastfood_id` (FK → `fastfoods`, `ON DELETE CASCADE`),
`fastfood_name`, `active`, `claim_duration`, `usage_limit`, `created_by`.

> Auparavant tout vivait dans un `data JSONB` libre (reliquat de la reprise
> Firestore) : ni filtrage SQL, ni index, ni intégrité référentielle.
> `criteria` **reste en JSONB** — sous-objet cohérent `{kind, target, period}`,
> toujours lu d'un bloc, jamais filtré champ par champ.
>
> Contraintes en base : `fastfood_id` et `fastfood_name` sont tous deux nuls ou
> tous deux renseignés (miroir SQL du validateur applicatif).

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
  "requiresRewardCredentials": true, // claim non auto-approuvé : reste `pending` jusqu'à livraison manuelle
  "requiresProfile": true,      // accès via profil nominatif + son code → `profile {name, code}` exigé à la livraison
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
├── routes/bonusRoute.js                       # toutes les routes /bonus (firebaseAuth)
├── controllers/bonus/
│   ├── getBonus.controller.js                  # extrait req.user.uid → service
│   ├── postBonus.controller.js                 # création
│   ├── patchBonus.controller.js                # modification partielle
│   ├── claimBonus.controller.js                # réclamation
│   ├── redeemBonus.controller.js               # consommation d'un code (marchand)
│   ├── armBonus.controller.js                  # arm / disarm
│   ├── verifyBonusCode.controller.js           # vérification lecture seule
│   └── rewardCredentialsBonus.controller.js    # livraison/correction des accès
├── services/bonus/
│   ├── getBonus.service.js                     # orchestration (charge + enrichit)
│   ├── postBonus.service.js                    # création (autorisation + cible)
│   ├── patchBonus.service.js                   # modification (mêmes autorisations)
│   ├── claimBonus.service.js                   # réclamation (= activation) + code
│   ├── redeemBonus.service.js                  # consommation manuelle (marchand)
│   ├── armBonus.service.js                     # armement + offres armées d'un user
│   ├── verifyBonusCode.service.js              # vérification LECTURE SEULE
│   ├── applyDeliveryBonus.service.js           # resolve (avant) / consume (après commande)
│   ├── deliveryOffer.js                        # forme unique `deliveryOffer` + contrôles
│   ├── rewardCredentialsBonus.service.js       # livraison manuelle + validation `profile`
│   ├── emitBonusStats.js                       # émet `bonus.stats_updated`
│   ├── enrichBonusForUser.js                   # fusion définition + user + compteurs
│   ├── bonusStats.util.js                      # bonusStats, décrément, éligibilité
│   └── bonusCode.util.js                       # génération/normalisation du code
├── interface/bonusFields.js                    # schéma de la définition
├── utils/validator/validateBonus.js            # règles de validation
└── repositories/supabase/
    ├── bonus.repo.js                           # getAll / getById / create / update
    └── bonusRequests.repo.js                   # + getByUser, claimCountsByBonus,
                                                #   findByCode, codeExists,
                                                #   getArmedByUser, updateUsage
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

> Le solde a **déjà** été décrémenté au claim : la livraison ne touche pas aux
> `consumedOrderIds`.

### Correction d'une livraison déjà faite

Le même endpoint accepte une réclamation **déjà `approved`** : il remplace alors
`rewardCredentials` au lieu de livrer. Utile quand un bonus passe `requiresProfile`
après coup et que d'anciennes livraisons n'ont pas de `profile` — sans quoi il
faudrait re-livrer et invalider le code du user.

Dans ce mode :
- `code` et `claimedAt` d'origine sont **conservés** ;
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

À la réclamation, le backend génère un **code** (`bonusCode.util`, ex.
`YAM-7K3F9QW2`, alphabet sans caractères ambigus). `/bonus/redeem` sert désormais
à la **saisie manuelle par le marchand** : pour la livraison offerte, c'est
`POST /order` qui consomme (cf. [Livraison offerte](#livraison-offerte-armement--consommation)).

> **Longueur du code : 8 caractères** (31⁸ ≈ 852 milliards). À 6, on tombait à
> ~887 millions : avec 1M de codes vivants, ~0,1% de collision par génération —
> soit un échec d'insert (index unique) remonté au user. `generateUniqueBonusCode()`
> ajoute en plus un pré-contrôle avec retry (5 tentatives).

Contrôles, dans l'ordre :

1. Code connu (`findByCode`) → 404 sinon.
2. Code appartenant au user authentifié → 403 sinon.
3. Réclamation `approved` et non entièrement consommée → 400 / 409.
4. Non expiré : `claimedAt + claimDuration` jours → 400 sinon.
5. `usageCount < usageLimit` → 409 sinon.

Puis : `usageCount++`, et `redeemed = true` dès que `usageLimit` est atteint.
Persisté via `bonusRequests.updateUsage()`. Une **nouvelle réclamation ouvre un
nouveau cycle** : code neuf, `usageCount` remis à 0.

`code`, `usage_count` et `redeemed` sont des **colonnes réelles** (migration 014),
avec un index **unique** sur `code` : `findByCode` scannait auparavant toute la
table via `extra_data->>'code'`.

**Champs ajoutés au `GET /bonus/all`** : `code`, `expiresAt`, `expired`,
`remainingUses`.

---

## Livraison offerte : armement & consommation

Bonus de `type: "free_delivery"`. Deux notions **distinctes** :

| | Quoi | Persisté ? | Consomme ? |
|---|---|---|---|
| **Réclamation** | `POST /bonus/:id/claim` — décrémente le solde, délivre un code | oui | non |
| **Armement** | le user déclare que le bonus s'applique à sa prochaine commande | *selon l'origine* | **non** |
| **Consommation** | `usageCount++` | oui | **oui** |

### Deux origines d'armement

- **Page bonus → armement GLOBAL, persisté.** `POST /bonus/:id/arm` écrit
  `armed = true` (colonne, migration 018). Il doit survivre à la fermeture de
  l'app : au retour, `GET /fastfood/all` renvoie `deliveryOffer` sur les
  boutiques concernées. `DELETE /bonus/:id/arm` désarme — toujours autorisé,
  même sur un bonus expiré, sinon il resterait armé indéfiniment.
- **Écran de commande → armement LOCAL, non persisté.** Le front arme tout seul ;
  il valide juste le code via `POST /bonus/verify` (lecture seule) pour son
  rendu, puis envoie `bonusCode` dans `POST /order`.

**Exclusivité** : armer un bonus désarme automatiquement tout autre bonus armé
qui le **recouvre** (même boutique, ou l'un des deux plateforme) — sinon l'offre
applicable serait ambiguë. Les bonus désarmés sont renvoyés dans
`data.disarmedBonusIds`.

### Consommation — uniquement à `POST /order`

`applyDeliveryBonus.service` découpe en deux temps :

1. **`resolveDeliveryBonus`, AVANT création** — un `bonusCode` fourni mais
   invalide fait échouer la commande en 400 (le user croit bénéficier de la
   gratuité, l'ignorer silencieusement serait trompeur). Sans `bonusCode`, on
   retombe sur l'armement global ; son absence est normale, pas une erreur.
2. **`consumeDeliveryBonus`, APRÈS création réussie** — `usageCount++`,
   `redeemed` si limite atteinte, et **`armed = false`** systématiquement.
   L'armement vaut pour UNE commande : sinon le bonus s'appliquerait à son insu
   aux commandes suivantes.

> C'est tout l'intérêt du découpage : **pas de commande = pas de consommation**.
> Le user peut quitter l'écran de commande sans rien perdre.

### `deliveryOffer` — objet unique partagé

Même forme partout (`GET /fastfood/all`, `POST /bonus/verify`, `POST /bonus/:id/arm`,
commande créée). Il porte des **données**, jamais une consigne d'affichage :

```jsonc
{
  "active": true,
  "reason": "bonus",            // "campaign" = mode gratuité globale plateforme
  "coveredBy": "fastfood",      // qui renonce au montant : "fastfood" | "platform"
  "bonusId": "b_12",
  "bonusCode": "YAM-7K3F9QW2",
  "bonusName": "Livraison offerte",
  "fastFoodId": "ff_42"         // null = bonus plateforme, valable partout
}
```

`null` quand aucune offre ne s'applique — ou, sur `/fastfood/all`, quand
l'appelant n'est pas authentifié.

> ⚠️ **Les montants de livraison ne sont JAMAIS forcés à 0.** `delivery.prix`
> reste au prix réel ; `deliveryOffer` dit seulement que la livraison est
> offerte, et le front décide du rendu (prix barré, libellé…).

**Portée** : un bonus de boutique ne vaut que chez elle ; un bonus plateforme
(`fastFoodId: null`) vaut partout. Un bonus de boutique prime sur un bonus
plateforme quand les deux s'appliquent.

**Propriété du code non vérifiée** : `/bonus/verify` et `POST /order` acceptent
un code qui n'appartient pas à l'appelant — un code peut circuler entre users. Le
code fait foi. (`/bonus/redeem`, lui, garde son contrôle de propriété.)

### `GET /fastfood/all` — auth facultative

La route est **publique**, mais `deliveryOffer` dépend du user. D'où
`optionalFirebaseAuth` : token valide → `req.user` renseigné ; token absent **ou
invalide** → on sert quand même la route, sans `deliveryOffer`. Les bonus armés
sont lus **une seule fois** pour toute la liste (`getArmedByUser`, index partiel
migration 018) — pas de N+1.

---

## Validation de la définition (`POST /bonus`)

`src/interface/bonusFields.js` (schéma) + `src/utils/validator/validateBonus.js`
(règles), suivant le pattern des autres domaines. Appelé par `postBonus.service`
**avant** toute écriture → `400` avec la liste des erreurs `{field, message}`.

Règles :

| Règle | Détail |
|---|---|
| Champs requis | `type`, `name`, `criteria`, `claimDuration`, `usageLimit` |
| Champs inconnus | Rejetés (`Champ non autorisé`) — bloque l'envoi de `bonusStats`, `requestStatus`… qui sont recalculés au GET |
| `criteria.kind` | Doit valoir `welcome` \| `order_count` \| `amount_spent` |
| `criteria.target` / `period` | **Requis** si `order_count`/`amount_spent` ; **interdits** si `welcome` |
| `criteria.target` | > 0 ; entier si `order_count` |
| `fastFoodId` / `fastFoodName` | L'un implique l'autre (absents tous deux = bonus plateforme) |
| Nombres / chaînes | `claimDuration`/`usageLimit` > 0 ; chaînes non vides |

> ⚠️ **Pourquoi c'est critique** : sans ce garde-fou, une simple faute de frappe
> (`amount_spend`) entrait en base sans erreur. `isBonusEligible` retombait alors
> sur `target = 0` → `eligible: false` **définitivement**, et le bug n'apparaissait
> qu'à la réclamation, très loin de sa cause.

`active` vaut `true` par défaut si non fourni.

---

## Autorisation (`POST /bonus`)

Route protégée par `firebaseAuth`. Deux cas, contrôlés dans `postBonus.service` :

| Bonus | Qui peut créer | Sinon |
|---|---|---|
| **Boutique** (`fastFoodId` présent) | le marchand **propriétaire** (`viewerUid === fastfood.userId`) ou un admin | `403` |
| **Plateforme** (sans `fastFoodId`) | **admin uniquement** (`users.is_admin`) | `403` |

### Résolution de la cible (`fastFoodId` / `fastFoodName`)

`fastFoodId` est **optionnel** à la création :

| Appelant | `fastFoodId` omis | `fastFoodId` fourni |
|---|---|---|
| Marchand | déduit de **sa** boutique (`user.fastFoodId`) | doit en être propriétaire, sinon `403` |
| Admin | **bonus plateforme** — le rôle admin prime, même si le compte a une boutique | bonus de cette boutique |
| Ni l'un ni l'autre | `403` | `403` |

`fastFoodName` est **toujours résolu par le serveur** ; l'envoyer est rejeté
(`400`) — un nom fourni par le client pourrait ne pas correspondre au `fastFoodId` :

- bonus de boutique → `fastfoods.name` lu en base ;
- bonus **plateforme** → env **`PLATFORM_NAME`** (ex. `yaammoo`), pour que le
  front affiche toujours un émetteur.

En base, `fastfood_name` est donc **toujours renseigné** (contrainte
`bonus_fastfood_name_chk`), tandis que `fastfood_id` reste `NULL` pour la
plateforme. Idem pour `createdBy` (uid du créateur), renseigné par le backend.
Un `fastFoodId` inconnu → `404`.

> Le contrôle « propriétaire » réutilise le pattern déjà en place dans
> `getFastFoodDeliveryStats.service.js` (`viewerUid === ff.userId`).

**Rôle admin** : colonne `users.is_admin` (migration 013), exposée en `isAdmin`
par le mapper. Contrairement à `isMarchand` (dérivé de `fastFoodId`), le rôle
admin est **stocké**, jamais calculé. Il s'active manuellement en base :

```sql
UPDATE users SET is_admin = TRUE WHERE id = '<uid>';
```

---

## Performance

`totalClaimedCount` est agrégé **côté Postgres** via la fonction
`bonus_claim_counts(claimed_statuses)` (migration 013) : elle déplie le tableau
JSONB `status` et renvoie **une ligne par bonus**, au lieu de rapatrier toute la
table `bonus_requests` à chaque GET. Un index GIN sur `status` accélère le
filtrage.

`claimCountsByBonus()` **replie** automatiquement sur le comptage applicatif si
la fonction SQL est absente (migration non encore appliquée) — le endpoint
continue de fonctionner, avec un `console.warn`.

---

## TODO (étapes suivantes)

- Appliquer les **migrations 013, 014 et 015** en prod (éditeur SQL Supabase),
  dans l'ordre, et désigner les premiers admins.
- Définir **`PLATFORM_NAME`** côté Fly : `flyctl secrets set PLATFORM_NAME=yaammoo`.
