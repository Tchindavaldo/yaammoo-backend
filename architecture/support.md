# Feature — Support (chat client)

Chat entre un client et l'equipe yaammoo, ouvert depuis **Settings → Contactez-nous**
cote frontend. Un fil peut concerner une boutique ou la plateforme.

> **Regle** : `fastfood_id` / `fastFoodId` **NULL = demande adressee a la
> plateforme yaammoo**. Le frontend affiche alors « yaammoo » en titre du fil,
> sinon le nom de la boutique.

Chaque fil renvoye porte **les deux interlocuteurs**, chacun servant de titre de
son cote : `fastFood` (`{ id, nom }` ou `null`) pour le client, et `client`
(`{ id, nom }`, nom reconstitue depuis `users.prenom` + `users.nom`) pour la
boutique. Les deux viennent de jointures dans `THREAD_SELECT`.

## Tables (migrations `034_support_threads.sql` + `035_support_threads_fks.sql`)

> ⚠️ Les jointures `fastfoods` / `users` du repository exigent de **vraies cles
> etrangeres** : sans elles PostgREST renvoie `PGRST200`. C'est l'objet de la
> migration 035, qui termine par `NOTIFY pgrst, 'reload schema'`.

| Table              | Colonnes                                                                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `support_threads`  | `id`, `user_id`, `fastfood_id` (nullable), `topic`, `title`, `status`, `unread_count`, `support_unread_count`, `last_message`, `created_at`, `updated_at` |
| `support_messages` | `id`, `thread_id` (FK cascade), `author`, `text`, `created_at`                                                                                            |

- `topic` : `question` \| `probleme` \| `assistance` \| `suggestion` \| `discussion`
- `status` : `open` \| `pending` \| `closed`
- `author` : `user` \| `support`

## Routes (`/support`)

| Verbe | Path                                           | Role                                                                                        |
| ----- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| GET   | `/support/threads?userId=`                     | Fils d'un client (sans messages), plus recent d'abord                                       |
| GET   | `/support/threads?fastFoodId=`                 | Fils recus par une boutique                                                                 |
| GET   | `/support/threads?scope=platform`              | Fils adresses a la plateforme yaammoo (back-office)                                         |
| POST  | `/support/threads`                             | Cree un fil **et son premier message** (`userId`, `topic`, `text`, `fastFoodId?`, `title?`) |
| GET   | `/support/threads/:id/messages`                | Messages du fil, ordre chronologique                                                        |
| POST  | `/support/threads/:id/messages`                | Message dans un fil existant (`userId`, `text`, `author?`)                                  |
| PATCH | `/support/threads/:id/read?side=user\|support` | Remet a 0 le compteur du cote indique (`user` par defaut)                                   |

`title` est le resume du fil : deduit de la premiere ligne du premier message
(tronquee a 60 caracteres) quand il n'est pas fourni.

## Compteurs de non-lus

Deux compteurs symetriques : `unread_count` (client) et `support_unread_count`
(boutique / back-office). Chaque message incremente celui d'en face et remet a
zero celui de son auteur, qui vient forcement de lire le fil.

| Message de | `unread_count` | `support_unread_count` |
| ---------- | -------------- | ---------------------- |
| `user`     | remis a 0      | +1                     |
| `support`  | +1             | remis a 0              |

## Socket

| Evenement         | Room           | Payload                                     |
| ----------------- | -------------- | ------------------------------------------- |
| `support.message` | `<userId>`     | `{ threadId, thread, message }`             |
| `support.message` | `<fastFoodId>` | idem, seulement si le fil vise une boutique |

Emis a chaque creation de fil et a chaque message (voir
`services/support/emitSupportMessage.js`). Une erreur d'emission est logguee
mais ne fait jamais echouer l'ecriture en base. Les fils sans boutique
(plateforme yaammoo) n'ont pas de room marchand : le back-office lit en HTTP.

## Push notifications

`services/support/notifySupportMessage.js`, appele apres chaque message :

| Message de                | Destinataire                                                |
| ------------------------- | ----------------------------------------------------------- |
| `user`                    | proprietaire de la boutique concernee (`fastfoods.user_id`) |
| `user`, fil sans boutique | personne cote app — le back-office traite ces fils          |
| `support`                 | le client proprietaire du fil                               |

Type `Support`, route `support/<threadId>` pour le deep-linking. Une erreur
d'envoi est logguee sans faire echouer l'ecriture.

## Fichiers

```
src/
├── routes/supportRoutes.js
├── controllers/support/          # get/post threads, get/post messages, markRead
├── services/support/             # un service par operation + emitSupportMessage.js + notifySupportMessage.js
├── repositories/supabase/supportThreads.repo.js
├── interface/supportFields.js    # champs autorises + enums
└── utils/validator/validateSupport.js
```
