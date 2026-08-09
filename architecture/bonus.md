# Feature — Bonus (hub)

## Où lire quoi

Ce fichier couvre le **modèle de données** et les **routes**. Le reste est dans
les modules dédiés — y aller directement :

| Sujet                                                             | Fichier                                              |
| ----------------------------------------------------------------- | ---------------------------------------------------- |
| Réclamation, livraison manuelle, `rewardCredentials`, solde, code | [bonus-lifecycle.md](./bonus-lifecycle.md)           |
| Livraison offerte : armement, consommation, `deliveryOffer`       | [bonus-delivery-offer.md](./bonus-delivery-offer.md) |
| Validation de la définition, autorisation, performance            | [bonus-definition.md](./bonus-definition.md)         |
| Arbitrage campagne / bonus, réglage `delivery_free_mode`          | [pricing.md](./pricing.md)                           |
| Ce que la gratuité coûte à qui (`covered_by`)                     | [pricing-settlement.md](./pricing-settlement.md)     |
| Vérification serveur au paiement                                  | [payment-amount-check.md](./payment-amount-check.md) |

---

## Rôle

Système de récompenses par **paliers** : un fastfood (ou la plateforme Yaammoo)
propose des bonus (Netflix offert, livraison gratuite, repas offert, réduction…)
débloqués quand le user atteint un quota — nombre de commandes OU montant dépensé —
sur une fenêtre glissante (jour / semaine / mois), ou via une **action externe**
(`status_view` : poster le flyer Yaammoo en statut WhatsApp).

> ⚠️ Doc réécrite pour le nouveau modèle. L'ancien système (codes promo
> `SUMMER2025`, `percentage/fixed`, parrainage) est obsolète.

---

## Routes

| Méthode | Endpoint                                | Contrôleur                         | Protégé                  | Rôle                                                                                                                                                                                                                 |
| ------- | --------------------------------------- | ---------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST    | `/bonus`                                | `postBonusController`              | **Oui** (`firebaseAuth`) | Crée un bonus (définition seule, **validée**, marchand propriétaire ou admin). Émet `bonus.created` (broadcast global, **sans payload**)                                                                             |
| GET     | `/bonus/all`                            | `getBonusController`               | **Oui** (`firebaseAuth`) | Liste les bonus **enrichis pour le user courant**                                                                                                                                                                    |
| POST    | `/bonus/:id/claim`                      | `claimBonusController`             | **Oui** (`firebaseAuth`) | **Réclame** un bonus (auto-approuvé, palier vérifié backend) → renvoie un **code**. **Multipart** (`proofVideo`) pour un bonus `status_view`                                                                         |
| GET     | `/bonus/:id/flyer`                      | `downloadFlyerController`          | **Oui** (`firebaseAuth`) | Renvoie le **flyer** à poster et **démarre le délai** avant claim (`claimDelayHours`)                                                                                                                                |
| POST    | `/bonus/:id/arm`                        | `armBonusController`               | **Oui** (`firebaseAuth`) | **Arme** un bonus livraison pour la prochaine commande éligible — ne consomme rien                                                                                                                                   |
| DELETE  | `/bonus/:id/arm`                        | `disarmBonusController`            | **Oui** (`firebaseAuth`) | Désarme                                                                                                                                                                                                              |
| POST    | `/bonus/verify`                         | `verifyBonusCodeController`        | Non                      | **Vérifie** un code (lecture seule, aucune écriture)                                                                                                                                                                 |
| PATCH   | `/bonus/:id`                            | `patchBonusController`             | **Oui** (`firebaseAuth`) | Modifie un bonus (champs de définition, `active`, `requiresProfile`, `flyerUrl`, `claimDelayHours`…) — marchand propriétaire ou admin. Un changement d'`active` **diffuse** `bonus.activation_changed` + push à tous |
| POST    | `/bonus/request/:id/reward-credentials` | `rewardCredentialsBonusController` | **Oui** (`firebaseAuth`) | **Livre** une réclamation `pending`, ou **corrige** des identifiants déjà livrés — admin ou marchand propriétaire                                                                                                    |
| POST    | `/bonusRequest/:totalBonus`             | `postBonusRequestController`       | —                        | Le user réclame un bonus                                                                                                                                                                                             |
| GET     | `/bonusRequest/status/:id`              | `getBonusRequestStatusController`  | —                        | Statut d'une demande                                                                                                                                                                                                 |

---

## Modèle de données

> **Une réclamation = une LIGNE de `bonus_requests`** (migration 029). Un même
> couple (user, bonus) peut donc en avoir plusieurs : chaque claim ouvre un
> nouveau cycle sans écraser le précédent, qui reste consultable en base.
>
> La réclamation **courante** est marquée **`is_current`** — c'est elle qui porte
> le `code`, `usage_count` et `armed` affichés au user. Un **index unique partiel**
> (`idx_bonus_requests_current`) garantit qu'il n'y en a jamais deux : les lectures
> filtrent (`findByUserBonus`, `getArmedByUser`, `findByCode` côté repo ;
> `pickCurrentRequest` / `indexCurrentRequestsByBonus` côté service) sans jamais
> avoir à trier ni à arbitrer.
>
> Le claim passe par `createCurrent` : il **démote** le cycle précédent
> (`is_current = false`) avant d'insérer le nouveau. Les deux écritures sont
> **atomiques** via la RPC `bonus_request_open_cycle` (migration 030) — sans
> elle, un crash entre les deux laisserait le (user, bonus) sans ligne courante.
>
> ⚠️ Les lectures qui doivent voir TOUTES les lignes (historique inclus) sont
> volontaires : `getByUser` (pot commun + `userClaimedCount`), `getById` (cible
> un id précis), `claimCountsByBonus` / `codeExists` (portée globale). Ne pas y
> ajouter de filtre `is_current`.
>
> Le tableau `status` d'une ligne ne contient plus qu'**une seule entrée** : la
> sienne. L'historique se lit en listant les lignes, plus en dépliant du JSONB.

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
  "type": "netflix", // chaîne libre : netflix | free_delivery | free_meal | discount | <futur>
  "name": "1 mois Netflix offert",
  "description": "…",
  "criteria": {
    "kind": "amount_spent", // "order_count" | "amount_spent" | "status_view"
    "target": 50000, // palier (nb commandes OU montant FCFA) ; null/absent si status_view
    "period": "month", // "day" | "week" | "month" — toujours requis
  },
  "fastFoodId": "ff_42", // null/absent = bonus plateforme Yaammoo
  "fastFoodName": "Burger Palace", // requis si fastFoodId présent
  "active": true,
  "requiresRewardCredentials": true, // claim non auto-approuvé : reste `pending` jusqu'à livraison manuelle
  "requiresProfile": true, // accès via profil nominatif + son code → `profile {name, code}` exigé à la livraison
  "flyerUrl": "https://…/flyer.png", // flyer à poster (requis si kind = status_view)
  "claimDelayHours": 22, // heures entre téléchargement du flyer et claim ; 0 = instantané
  "claimDuration": 30, // validité du code après réclamation (jours)
  "usageLimit": 3, // nb d'utilisations autorisées du code
  "createdAt": "2026-06-18T10:00:00.000Z",
}
```

### `criteria.kind = "status_view"` — bonus sans palier de commandes

Bonus **plateforme** obtenu par une action externe : le user poste le flyer Yaammoo
en **statut WhatsApp**. Aucune commande n'est requise, donc :

- `criteria.target` = `null` (obligatoire — un nombre serait un palier que rien ne mesure) ;
- `criteria.period` reste requis (`day` = un cycle par jour) ;
- `isBonusEligible` retourne `eligible: true` d'office (aucun palier à mesurer) ;
- **aucun décrément** du solde : `measureConsumption` renvoie 0, `consumedOrderIds` vide ;
- combiné à `requiresRewardCredentials: true`, la demande reste `pending` : c'est
  **l'admin qui vérifie la preuve** (vidéo du statut) avant de livrer les identifiants.
  Le refus se matérialise en ne livrant pas.

**Deux colonnes dédiées (migration 031)** :

| Colonne             | Champ API         | Rôle                                                                                                                                                                                                                                                                                         |
| ------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flyer_url`         | `flyerUrl`        | Flyer à poster, servi par `GET /bonus/:id/flyer`. **Requis** à la création d'un bonus `status_view` (sinon rien à publier). **Jamais exposé au `GET /bonus/all`.**                                                                                                                           |
| `claim_delay_hours` | `claimDelayHours` | Heures à attendre après la **fin du créneau de publication** avant de pouvoir claim (ex. **22**). `0` = instantané, valeur par défaut de tous les autres bonus. Modifiable à chaud via `PATCH /bonus/:id` — **pas d'env**, donc pas de redéploiement. **Jamais exposé au `GET /bonus/all`.** |

#### Campagne datée (`criteria.schedule`)

Un bonus `status_view` n'est pas permanent : il porte une **campagne**, décrite
dans `criteria.schedule`. Comme `criteria` est déjà du JSONB, **aucune migration**
n'est nécessaire, et la campagne se modifie via `PATCH /bonus/:id`.

```jsonc
"criteria": {
  "kind": "status_view",
  "target": null,
  "period": "day",
  "schedule": {
    "downloadDate": "2026-08-05",                    // jour PRÉCIS de retrait du flyer
    "postDate": "2026-08-06",                        // optionnel, défaut = downloadDate + 1
    "postWindow": { "start": "18:00", "end": "21:00" }, // créneau de publication
    "timezone": "Africa/Douala"                      // optionnel, défaut Africa/Douala
  }
}
```

| Étape                 | Quand                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------- |
| Retrait du flyer      | le jour `downloadDate`, jusqu'à 23:59 locales — **autant de fois que voulu**              |
| Publication du statut | le jour `postDate` (défaut : **lendemain** du retrait), entre `postWindow.start` et `end` |
| Claim possible        | `postWindow.end` **+ `claimDelayHours`**                                                  |

> ⚠️ Le délai part de la **fin** du créneau, pas du téléchargement ni de son début.
> Le backend ne sait pas à quelle minute le user a réellement posté : prendre le
> point le plus tardif garantit que le statut a tenu la durée annoncée quelle que
> soit l'heure du post. Télécharger le flyer à 8h ou à 22h ne change donc rien.

Les dates sont interprétées dans le **fuseau du bonus** (`schedule.timezone`,
défaut `Africa/Douala`) : « le 5 août à 18h » tombe à 18h pour le user. Le fuseau
sert au calcul côté backend et n'est **pas** renvoyé au front — les instants
exposés sont déjà absolus.
Implémentation : `services/bonus/statusViewSchedule.util.js`.

**Exposition selon le rôle** (`GET /bonus/all`) — une seule forme, jamais les deux,
pour que le front ne reçoive pas deux fois la même information :

| Appelant                     | Reçoit                                                                   | Pourquoi                                                            |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| **Admin** (`users.is_admin`) | `criteria.schedule` **brut** (`campaignSchedule: null`)                  | c'est ce qu'il édite et renvoie en PATCH                            |
| **User**                     | `campaignSchedule` (dates résolues), `schedule` **retiré** de `criteria` | il affiche des dates, il n'a que faire de la règle J+1 ni du fuseau |

**Qui peut modifier la campagne** : un bonus `status_view` est un bonus
**plateforme** (`fastFoodId` null), donc `PATCH /bonus/:id` est réservé aux
**admins** (`patchBonus.service.js` — contrôle déjà en place, aucune règle
spécifique au schedule).

**PATCH réellement partiel** : `criteria` est un JSONB écrit en bloc, donc
`patchBonus.service.js` le **fusionne** avec l'existant (`mergeCriteria`) sur
trois niveaux — `criteria`, `criteria.schedule`, `criteria.schedule.postWindow`.
Décaler la seule date de publication se fait donc ainsi :

```jsonc
PATCH /bonus/:id
{ "criteria": { "schedule": { "postDate": "2026-08-09" } } }
```

`kind`, `period`, `target`, `downloadDate` et `postWindow` sont conservés. Envoyer
`"schedule": null` supprime explicitement la campagne (pas de fusion sur `null`).
La validation s'applique **après** fusion : c'est le `criteria` résultant qui doit
être cohérent.

> ⚠️ **Verrou optimiste sur `criteria`** : la fusion part d'une lecture, donc un
> autre admin peut avoir réécrit la colonne entre-temps — sa modification serait
> perdue sans bruit. `bonus.update()` reçoit alors `expectedCriteria` et
> conditionne l'`UPDATE` (`.eq('criteria', …)`) : si la valeur a bougé, aucune
> ligne n'est touchée et le service renvoie **409** « rechargez puis réessayez ».
> Les autres champs sont des colonnes indépendantes, écrites sans verrou.

**Rétrocompatibilité** : `schedule` est optionnel. Sans lui, l'ancien comportement
s'applique (délai compté depuis le téléchargement) — les bonus déjà en base ne
deviennent pas inréclamables.

**Validation** (`validateBonus.js`) : `downloadDate` au format `YYYY-MM-DD`,
`postDate` optionnel (même format, jamais antérieur à `downloadDate`),
`postWindow.start`/`end` au format `HH:mm` avec `start < end`, `timezone` connu
d'`Intl`, créneau de publication non déjà passé, champs inconnus rejetés.
`schedule` est refusé sur les kinds chiffrés (`order_count`, `amount_spent`).

#### Parcours complet

1. **`GET /bonus/:id/flyer`** → renvoie `flyerUrl` **et horodate** le téléchargement
   dans `bonus_flyer_downloads` (une ligne par `(user, bonus)`).
   Refus **400** si : bonus inactif, ou `downloadDate` passée (`download_closed`).
   Le user peut re-télécharger **autant de fois qu'il veut** dans la journée
   (`downloadedAt` reste figé au premier, `downloadCount` s'incrémente) : seule la
   date ferme le retrait. La réponse porte `claimableAt` (= `postWindow.end + claimDelayHours`)
   et `postWindow` `{date, start, end, timezone}` en ISO, pour le compte à rebours front.
   Socket : `bonus.flyer_downloaded` sur la room du user.
2. Le user poste le flyer en statut le lendemain, dans le créneau, et l'y laisse.
3. **`POST /bonus/:id/claim`** en **multipart** avec le fichier `proofVideo`
   (vidéo du statut posté). Refus **400** si : flyer jamais téléchargé, délai non
   écoulé (message + `data.claimableAt`), ou vidéo absente. La vidéo est uploadée
   dans le bucket Supabase (dossier `bonusProofs`) et son URL est stockée dans
   l'entrée `status[].proofVideoUrl` de la réclamation. Le claim renvoie et émet
   `proofVideoUrl` dans `bonus.claimed`.
   La ligne de téléchargement est **marquée** (`proof_uploaded_at`, `proof_video_url` —
   migration 032), jamais supprimée : la trace du retrait et de la preuve envoyée
   survit au claim. C'est ce marqueur qui interdit une seconde réclamation sur le
   même retrait ; le cycle suivant se rouvre au prochain `GET /bonus/:id/flyer`
   (`record()` remet le marqueur à zéro et repart de `downloadedAt = now`).

   > **Rejouer un test** : remettre le marqueur à `NULL` rouvre l'upload sans
   > toucher au reste du cycle.
   >
   > ```sql
   > UPDATE bonus_flyer_downloads SET proof_uploaded_at = NULL
   > WHERE user_id = '<uid>' AND bonus_id = '<bonusId>';
   > ```

4. La demande reste `pending` (`requiresRewardCredentials`) → l'admin visionne la
   preuve puis livre les accès via
   `POST /bonus/request/:id/reward-credentials` (flux inchangé).

> ⚠️ Les contrôles (téléchargement + délai) sont faits **avant** l'upload : on ne
> stocke jamais le fichier d'un claim qui sera refusé.

### Champs recalculés au `GET /bonus/all` (jamais persistés dans `bonus`)

Fusionnés dans chaque bonus à la lecture, pour le user authentifié :

| Champ                         | Source                                                            | Calcul                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canDownload`                 | `bonus` (définition)                                              | `true` si le flyer peut **encore** être retiré : bonus actif et `downloadDate` non passée. Toujours `false` pour un bonus sans `flyerUrl`. Ne dépend **pas** du user : le retrait est illimité dans la journée.                                                                                                                                                  |
| `canUpload`                   | `criteria.schedule` + `claimDelayHours` + `bonus_flyer_downloads` | `true` quand **les trois** conditions du claim sont réunies : délai post-publication écoulé (`postWindowEnd + claimDelayHours`), flyer téléchargé, et téléchargement pas encore consommé (`proof_uploaded_at IS NULL`). Le front active son bouton d'envoi de la **vidéo preuve** sans risquer un 400. Le claim (`checkProofDelay`) reste seul juge en écriture. |
| `campaignSchedule`            | `criteria.schedule`                                               | **User non-admin uniquement.** Calendrier de la campagne : `{downloadDate, postDate, postWindowStart, postWindowEnd}`. Les deux bornes du créneau sont des **instants absolus ISO**, déjà résolus dans le fuseau du bonus — le front les rend directement, sans rejouer la règle du J+1 ni convertir un fuseau. `null` pour un admin ou un bonus sans campagne.  |
| `bonusStats.{day,week,month}` | `orders` + `bonus_requests`                                       | Agrégation `{count, amount}` des commandes **non annulées** du user pour `fastFoodId` (toutes si bonus plateforme), par fenêtre calendaire UTC, **moins les paliers déjà consommés** (cf. § Décrément).                                                                                                                                                          |
| `requestId`                   | `bonus_requests` du user                                          | Id de la réclamation **courante** (`is_current`). `null` si aucune n'est active. Sert au front à cibler une ligne précise (ex. livraison des accès).                                                                                                                                                                                                             |
| `code`                        | `bonus_requests` du user                                          | Code de réclamation actif, `null` si non réclamé.                                                                                                                                                                                                                                                                                                                |
| `expiresAt` / `expired`       | calculé                                                           | `startsAt + claimDuration` jours, et comparaison à `now`.                                                                                                                                                                                                                                                                                                        |
| `remainingUses`               | calculé                                                           | `usageLimit − usageCount`, `null` si pas de limite.                                                                                                                                                                                                                                                                                                              |
| `fastFoodBonusCount`          | liste `bonus`                                                     | Nb de bonus partageant le même `fastFoodId`.                                                                                                                                                                                                                                                                                                                     |
| `totalClaimedCount`           | table `bonus_requests`                                            | Nb total d'entrées de statut accordé (`approved`/`completed`) pour ce bonus, tous users.                                                                                                                                                                                                                                                                         |
| `userClaimedCount`            | `bonus_requests` du user                                          | Nb de réclamations accordées de ce user pour ce bonus — compté sur **toutes ses lignes** (une par cycle).                                                                                                                                                                                                                                                        |
| `requestStatus`               | `bonus_requests` du user                                          | `none` / `pending` / `approved` (dérivé du tableau `status`).                                                                                                                                                                                                                                                                                                    |
| `claimedAt`                   | `bonus_requests` du user                                          | `createdAt` de la dernière entrée accordée.                                                                                                                                                                                                                                                                                                                      |
| `startsAt`                    | calculé                                                           | Départ de la fenêtre de validité, **porte `expiresAt`**. Vaut `claimedAt`, SAUF pour un bonus `requiresRewardCredentials` : alors la date de **livraison des accès** (`status[].validityStartsAt`). Voir § Départ de validité.                                                                                                                                   |
| `usageCount`                  | `bonus_requests` du user                                          | Depuis `extra_data.usageCount` (flux de redemption à venir), défaut `0`.                                                                                                                                                                                                                                                                                         |
| `redeemed`                    | `bonus_requests` du user                                          | Depuis `extra_data.redeemed`, défaut `false`.                                                                                                                                                                                                                                                                                                                    |

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
│   ├── armBonus.controller.js                  # arm / disarm
│   ├── verifyBonusCode.controller.js           # vérification lecture seule
│   └── rewardCredentialsBonus.controller.js    # livraison/correction des accès
├── services/bonus/
│   ├── getBonus.service.js                     # orchestration (charge + enrichit)
│   ├── postBonus.service.js                    # création (autorisation + cible)
│   ├── patchBonus.service.js                   # modification (mêmes autorisations)
│   ├── claimBonus.service.js                   # réclamation (= activation) + code
│   ├── armBonus.service.js                     # armement + offres armées d'un user
│   ├── verifyBonusCode.service.js              # vérification LECTURE SEULE
│   ├── applyDeliveryBonus.service.js           # resolve (avant) / consume (après commande)
│   ├── deliveryOffer.js                        # forme unique `deliveryOffer` + contrôles
│   ├── rewardCredentialsBonus.service.js       # livraison manuelle + validation `profile`
│   ├── emitBonusStats.js                       # émet `bonus.stats_updated`
│   ├── enrichBonusForUser.js                   # fusion définition + user + compteurs
│   ├── bonusStats.util.js                      # bonusStats, décrément, éligibilité
│   ├── statusViewSchedule.util.js              # campagne status_view : dates, fuseau,
│   │                                           #   canDownload / canUpload / claimableAt
│   └── bonusCode.util.js                       # génération/normalisation du code
├── interface/bonusFields.js                    # schéma de la définition
├── utils/validator/validateBonus.js            # règles de validation
└── repositories/supabase/
    ├── bonus.repo.js                           # getAll / getById / create / update
    └── bonusRequests.repo.js                   # + getByUser, claimCountsByBonus,
                                                #   findByCode, codeExists,
                                                #   getArmedByUser, updateUsage,
                                                #   createCurrent (RPC atomique)
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
