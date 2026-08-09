# Bonus — définition, autorisation, performance

> **Prérequis** : le modèle et la forme de `criteria` sont dans
> [bonus.md](./bonus.md).

| Besoin                       | Fichier                                              |
| ---------------------------- | ---------------------------------------------------- |
| Modèle de données, routes    | [bonus.md](./bonus.md)                               |
| Réclamation, livraison, code | [bonus-lifecycle.md](./bonus-lifecycle.md)           |
| Livraison offerte            | [bonus-delivery-offer.md](./bonus-delivery-offer.md) |
| Codes d'erreur               | [validation-errors.md](./validation-errors.md)       |

## Validation de la définition (`POST /bonus`)

`src/interface/bonusFields.js` (schéma) + `src/utils/validator/validateBonus.js`
(règles), suivant le pattern des autres domaines. Appelé par `postBonus.service`
**avant** toute écriture → `400` avec la liste des erreurs `{field, message}`.

Règles :

| Règle                         | Détail                                                                                                                                                                                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Champs requis                 | `type`, `name`, `criteria`, `claimDuration`, `usageLimit`                                                                                                                                                                                                                               |
| Champs inconnus               | Rejetés (`Champ non autorisé`) — bloque l'envoi de `bonusStats`, `requestStatus`… qui sont recalculés au GET                                                                                                                                                                            |
| `criteria.kind`               | Doit valoir `order_count` \| `amount_spent` \| `status_view`                                                                                                                                                                                                                            |
| `criteria.period`             | **Toujours requis** (`day` \| `week` \| `month`), y compris pour `status_view`                                                                                                                                                                                                          |
| `criteria.target`             | **Requis** si `order_count`/`amount_spent` ; **doit être null/absent** si `status_view`                                                                                                                                                                                                 |
| `criteria.target`             | > 0 ; entier si `order_count`                                                                                                                                                                                                                                                           |
| `flyerUrl`                    | **Requis** à la création si `criteria.kind = status_view`                                                                                                                                                                                                                               |
| `criteria.schedule`           | Optionnel, `status_view` **uniquement** (rejeté sur les kinds chiffrés). `downloadDate` `YYYY-MM-DD`, `postDate` optionnel (≥ `downloadDate`, défaut J+1), `postWindow.{start,end}` `HH:mm` avec `start < end`, `timezone` valide, créneau non déjà passé. Sous-champs inconnus rejetés |
| `claimDelayHours`             | Optionnel, ≥ 0 (défaut 0). Seul champ numérique qui accepte `0`                                                                                                                                                                                                                         |
| `fastFoodId` / `fastFoodName` | L'un implique l'autre (absents tous deux = bonus plateforme)                                                                                                                                                                                                                            |
| Nombres / chaînes             | `claimDuration`/`usageLimit` > 0 ; chaînes non vides                                                                                                                                                                                                                                    |

> ⚠️ **Pourquoi c'est critique** : sans ce garde-fou, une simple faute de frappe
> (`amount_spend`) entrait en base sans erreur. `isBonusEligible` retombait alors
> sur `target = 0` → `eligible: false` **définitivement**, et le bug n'apparaissait
> qu'à la réclamation, très loin de sa cause.

`active` vaut `true` par défaut si non fourni.

---

## Autorisation (`POST /bonus`)

Route protégée par `firebaseAuth`. Deux cas, contrôlés dans `postBonus.service` :

| Bonus                               | Qui peut créer                                                             | Sinon |
| ----------------------------------- | -------------------------------------------------------------------------- | ----- |
| **Boutique** (`fastFoodId` présent) | le marchand **propriétaire** (`viewerUid === fastfood.userId`) ou un admin | `403` |
| **Plateforme** (sans `fastFoodId`)  | **admin uniquement** (`users.is_admin`)                                    | `403` |

### Résolution de la cible (`fastFoodId` / `fastFoodName`)

`fastFoodId` est **optionnel** à la création :

| Appelant           | `fastFoodId` omis                                                            | `fastFoodId` fourni                    |
| ------------------ | ---------------------------------------------------------------------------- | -------------------------------------- |
| Marchand           | déduit de **sa** boutique (`user.fastFoodId`)                                | doit en être propriétaire, sinon `403` |
| Admin              | **bonus plateforme** — le rôle admin prime, même si le compte a une boutique | bonus de cette boutique                |
| Ni l'un ni l'autre | `403`                                                                        | `403`                                  |

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
