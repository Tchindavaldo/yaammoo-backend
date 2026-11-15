# WhatsApp — marchands qui n'utilisent pas l'app

Yaammoo n'appelle pas Meta directement : il passe par le **module WhatsApp de
rauval-backend** (`rauval-backend/architecture/whatsapp.md`), où il est l'appli
« Yaammoo ». Le numéro rattaché est +237 698 087 460 en attendant un numéro dédié :
changer de numéro se fait dans le module, sans toucher au code de Yaammoo.

Le client final n'est pas concerné : il passe toujours par l'app. WhatsApp sert
de passerelle avec les marchands qui ne veulent pas de l'app.

## Configuration

| Secret Fly | Rôle |
|---|---|
| `WHATSAPP_MODULE_URL` | base de l'API du module, `https://rauval-backend.fly.dev/whatsapp` |
| `WHATSAPP_API_KEY` | clé `x-api-key` de l'appli Yaammoo (montrée une seule fois à la création) |
| `WHATSAPP_WEBHOOK_SECRET` | secret de relais : vérifie la signature des événements reçus |

Réglage en base : `settings_app.whatsapp_timeout_ms` (15000 par défaut, migration 080).
Dans le module, l'URL de relais de l'appli Yaammoo doit pointer sur
`https://<backend>/whatsapp/webhook` (test ou prod, une seule à la fois).

## Envoi — `services/whatsapp/whatsappModule.client.js`

| Fonction | Appel module |
|---|---|
| `sendMessage(body)` | `POST /messages` : `{ to, type, reference?, replyTo?, text \| template \| interactive \| image … }` |
| `markRead(messageId, typing)` | `POST /messages/:id/read` |

Ne lève jamais : `{ ok, status, data }`, échec journalisé. Hors fenêtre de 24 h
(aucun message du marchand depuis 24 h), seul un template approuvé passe.

## Réception — `POST /whatsapp/webhook`

Route montée **avant** `express.json` (`routes/whatsappWebhookRoutes.js`) : la
signature porte sur le corps brut.

1. `X-Rauval-Signature` = `sha256=` + HMAC-SHA256(`WHATSAPP_WEBHOOK_SECRET`,
   `` `${X-Rauval-Timestamp}.${corps}` ``). Absente, fausse ou timestamp de plus
   de 5 min → `401`.
2. JSON invalide ou champ requis absent → `400` (`utils/validator/validateWhatsappEvent.js`,
   champs dans `interface/whatsappWebhookFields.js`). Un champ inconnu est toléré.
3. `services/whatsapp/webhookEvents.service.js` :
   - `message` avec bouton : payload `<ref>:<action>` (posé par Yaammoo à l'envoi),
     transmis au flux abonné par `onButton(action, fn)` ; sans flux abonné, journalisé.
   - `message` sans bouton : journalisé.
   - `status` `failed` : journalisé en erreur.
4. `200 { success, handled }` ; erreur d'un flux → `500` (le module ne renvoie pas).

## À venir

Flux marchands (nouvelle commande, acceptation, suivi des statuts, rappel,
demande d'annulation) : `todo/fastfood/feature/whatsapp-commandes-marchand.md`
et `todo/user/feature/annulation-sur-demande.md`.

## Fichiers

```
config/whatsapp.js
routes/whatsappWebhookRoutes.js
controllers/whatsapp/webhook.controller.js
services/whatsapp/webhookEvents.service.js     signature, aiguillage, onButton
services/whatsapp/whatsappModule.client.js     envoi, accusé de lecture
interface/whatsappWebhookFields.js
utils/validator/validateWhatsappEvent.js
schema/migrations/080_whatsapp_settings.sql
```
