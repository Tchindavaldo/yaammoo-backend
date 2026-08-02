# Feature — Support (chat client)

Chat entre un client et l'equipe yaammoo, ouvert depuis **Settings → Contactez-nous**
cote frontend. Un fil peut concerner une boutique ou la plateforme.

> **Regle** : `fastfood_id` / `fastFoodId` **NULL = demande adressee a la
> plateforme yaammoo**. Le frontend affiche alors « yaammoo » en titre du fil,
> sinon le nom de la boutique.

## Tables (migration `034_support_threads.sql`)

| Table | Colonnes |
|---|---|
| `support_threads` | `id`, `user_id`, `fastfood_id` (nullable), `topic`, `title`, `status`, `unread_count`, `last_message`, `created_at`, `updated_at` |
| `support_messages` | `id`, `thread_id` (FK cascade), `author`, `text`, `created_at` |

- `topic` : `question` \| `probleme` \| `assistance` \| `suggestion` \| `discussion`
- `status` : `open` \| `pending` \| `closed`
- `author` : `user` \| `support`

## Routes (`/support`)

| Verbe | Path | Role |
|---|---|---|
| GET | `/support/threads?userId=` | Liste des fils du user (sans messages), plus recent d'abord |
| POST | `/support/threads` | Cree un fil **et son premier message** (`userId`, `topic`, `text`, `fastFoodId?`, `title?`) |
| GET | `/support/threads/:id/messages` | Messages du fil, ordre chronologique |
| POST | `/support/threads/:id/messages` | Message dans un fil existant (`userId`, `text`, `author?`) |
| PATCH | `/support/threads/:id/read` | Remet `unread_count` a 0 |

`title` est le resume du fil : deduit de la premiere ligne du premier message
(tronquee a 60 caracteres) quand il n'est pas fourni.

## Compteur de non-lus

`unread_count` s'incremente uniquement sur un message d'`author: 'support'`.
Un message du client le remet a 0 (il vient de lire le fil).

## Socket

| Evenement | Room | Payload |
|---|---|---|
| `support.message` | `<userId>` | `{ threadId, thread, message }` |

Emis a chaque creation de fil et a chaque message (voir
`services/support/emitSupportMessage.js`). Une erreur d'emission est logguee
mais ne fait jamais echouer l'ecriture en base.

## Fichiers

```
src/
├── routes/supportRoutes.js
├── controllers/support/          # get/post threads, get/post messages, markRead
├── services/support/             # un service par operation + emitSupportMessage.js
├── repositories/supabase/supportThreads.repo.js
├── interface/supportFields.js    # champs autorises + enums
└── utils/validator/validateSupport.js
```
