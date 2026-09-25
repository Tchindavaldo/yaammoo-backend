# Staff — Employés d'une boutique, rôles, permissions

Un propriétaire (ou un admin, ou un employé ayant `staff.manage`) crée des
employés pour SA boutique. Chaque employé a **un rôle**, propre à la boutique,
qui porte une liste de **permissions**.

## Modèle (migration 050)

| Table | Colonnes clés |
|---|---|
| `staff_roles` | `id`, `fastfood_id`, `name` (unique par boutique, casse ignorée), `permissions TEXT[]` |
| `staff_members` | `id`, `fastfood_id`, `role_id`, `phone_number` (E.164, unique par boutique), `user_id` (NULL tant que jamais connecté), `nom`, `prenom`, `active` |

Mappers : `repositories/staffMappers.js` (réexporté par `mappers.js`, qui dépasse
déjà le plafond R3). Repo : `repos.staff`.

## Rôle créé AVEC l'employé

`POST /staff/:fastFoodId/members` accepte :

- `role: { name, permissions }` → rôle **créé** ; si un rôle de ce nom existe
  déjà dans la boutique, il est **réutilisé** (ses permissions ne sont pas
  modifiées) ;
- ou `roleId` → rôle existant.

Pas besoin de créer le rôle à part. `GET /staff/:fastFoodId/roles` liste les
rôles déjà créés (pour les proposer à la création suivante).
`POST /staff/:fastFoodId/roles` existe pour créer un rôle seul, facultatif.

## Connexion de l'employé — OTP, et email + mot de passe en option

`services/staff/staffAccount.service.js` (`resolveStaffAccount`) :

| Cas | Effet |
|---|---|
| Compte existant (numéro, sinon email) | rattaché ; si `email`+`password` fournis et que le compte Auth n'a pas d'email, ils y sont ajoutés (jamais écrasés sinon) |
| Aucun compte + `email` + `password` | compte Firebase créé avec **uid `ph_<numero>`** (celui du parcours OTP) + ligne `users` → les deux connexions ouvrent le même compte |
| Aucun compte, pas d'email | `user_id = NULL`, rattachement à la 1re connexion OTP |

Le mot de passe n'est **jamais stocké** en base (`infos.password = null`) : seul
Firebase Auth le détient. Email déjà pris par un autre compte → 409.

- Le numéro est normalisé en E.164 (`normalizePhoneNumber`).
- Compte déjà existant pour ce numéro (`getUserByAnyPhone`) → `user_id` posé tout de suite.
- Sinon `user_id = NULL` ; à sa **première connexion OTP**, `phoneAuth.service`
  appelle `linkStaffOnLogin` qui rattache tous ses postes. Échec = log, jamais
  bloquant.
- Le front de l'employé lit `GET /staff/me` → `[{ memberId, fastFoodId, fastFoodName, role, permissions[] }]`.

## Permissions (`utils/staffPermissions.js`)

| Clé | Autorise |
|---|---|
| `orders.validate` | `pending → processing` |
| `orders.finish` | `processing → finished` |
| `orders.deliver` | `finished → delivering → delivered`, assignation livreur (`PUT /order` avec `driverId`) |
| `orders.cancel` | `cancelByFastFood` |
| `menus.manage` | `POST /menu`, `PUT /menu/:id`, `DELETE /menu/:id` |
| `fastfood.update` | `POST /fastFood/:id` |
| `notifications.send` | déclarée — **pas encore appliquée** (voir limites) |
| `support.reply` | `POST /support/threads/:id/messages` avec `author: 'support'` |
| `staff.manage` | toutes les routes `/staff/:fastFoodId/*` |

Propriétaire et admin ont implicitement toutes les permissions.
`resolveFastfoodAccess(uid, fastFoodId)` (service) est la source unique.

## Gardes (`middlewares/staffPermissionMiddleware.js`) — toujours après `firebaseAuth`

| Garde | Usage |
|---|---|
| `requireFastfoodPermission(p)` | boutique dans l'URL : `/staff/*`, `POST /fastFood/:id` |
| `authorize(resolver)` | cible déduite de la requête : menus, commandes, support |

`authorize` : chaque vérification passe si l'appelant est **admin**, OU fait
partie de `selfUids` (client de la commande, livreur assigné, client du fil),
OU a la `permission` sur la boutique (`'*'` = n'importe quel accès boutique).

> ⚠️ **Faille fermée** : menus (écriture), commandes et support étaient
> **publics** — sans compte, on pouvait modifier un menu, faire avancer ou
> annuler une commande, lire les messages d'un client, écrire au nom d'une
> boutique. Ils exigent désormais le Bearer (l'app l'envoie déjà : routes
> `POST /fastFood/:id`, `/menu/:id/rating`, `/driver/:id` déjà protégées).

| Route | Qui passe (hors admin) |
|---|---|
| `POST/PUT/DELETE /menu` | `menus.manage` sur la boutique du menu |
| `POST /order` | `userId` de chaque commande = appelant |
| `PUT /order/tabs/:userId` | par commande : transition client → son client ; livraison → `orders.deliver` ou livreur assigné ; autres → permission de la transition |
| `PUT /order` | `driverId` : `orders.deliver` ou livreur assigné qui avance ; `status` : idem transition ; sinon client ou accès boutique |
| `PUT /order/update-field` | client de chaque commande ou accès boutique |
| `PUT /order/update-rank-by-date/:fastFoodId`, `GET /order/all/:fastFoodId` | accès boutique |
| `GET /order/user/all/:userId`, `GET /order/driver/:driverId` | l'uid de l'URL |
| `GET /support/threads` | `?userId` = soi ; `?fastFoodId` → `support.reply` ; `?scope=platform` → admin |
| `POST /support/threads` | `userId` = soi |
| `GET/PATCH /support/threads/:id/*`, `POST …/messages` | client du fil, ou `support.reply` ; écrire avec `author: 'support'` exige `support.reply` (fil plateforme : admin) |

Transition de commande → permission : déduite du statut **en base** (même
machine à états que `updateOrders`), jamais du statut envoyé, sauf pour
`cancelByFastFood`. `pendingToBuy → pending` (paiement client) et `cancelByUser`
ne demandent aucune permission.

## Routes

| Verbe | Path | Garde |
|---|---|---|
| GET | `/staff/permissions` | public |
| GET | `/staff/me` | `firebaseAuth` |
| GET/POST | `/staff/:fastFoodId/members` | `staff.manage` |
| PATCH/DELETE | `/staff/:fastFoodId/members/:memberId` | `staff.manage` (`active: false` = suspension) |
| GET/POST | `/staff/:fastFoodId/roles` | `staff.manage` |
| PATCH/DELETE | `/staff/:fastFoodId/roles/:roleId` | `staff.manage` (DELETE refusé 409 si attribué) |

Payloads : `interface/staffFields.js`. Codes : 400 payload, 403 permission,
404 boutique/rôle/employé, 409 doublon.

## Limites connues

- `notifications.send` : `POST /notification*` ne porte pas la boutique
  émettrice (`fastFoodId` y désigne le destinataire) — rien pour appliquer la
  permission sans risquer de bloquer un employé agissant comme client.
- Un employé est aussi un user normal : il peut commander ailleurs, rien ne change pour lui côté client.

## Fichiers

```
schema/migrations/050_fastfood_staff.sql
src/interface/staffFields.js
src/utils/staffPermissions.js
src/repositories/staffMappers.js
src/repositories/supabase/staff.repo.js
src/services/staff/staff.service.js
src/middlewares/staffPermissionMiddleware.js
src/controllers/staff/staff.controller.js
src/routes/staffRoutes.js            # app.use('/staff')
```
