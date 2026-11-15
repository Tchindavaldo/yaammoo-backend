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

Réglage en base : `settings_app.whatsapp_timeout_ms` (15000 par défaut, migration 085).
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

## Flux marchands (boutique WhatsApp)

Marchand sans l'app : l'admin crée sa boutique comme les autres, puis
`PATCH /fastfood/:fastFoodId/whatsapp-orders { enabled }` (admin, exige un
`whatsappNumber` valide ; stocké dans `fastfoods.extra_data.whatsappOrders`).
Code : `services/whatsapp/merchantOrders.service.js`, textes `merchantMessages.js`.

1. **Commande payée** (`createOrder`, `updateOrders` `pendingToBuy → pending`, là où part
   `newFastFoodOrders`) → template `yam_nouvelle_commande` au numéro de la boutique : photo
   du plat, n° (fin de l'id), plats, livraison, montant **vue marchand** (`toMerchantView`).
   Un panier (`groupId`) = un message. Boutons : payload `<orderId>:accept|refuse`, ou
   `g:<groupId>:<fastFoodId>:accept|refuse` pour un panier.
2. **Accepter** → `updateOrders` (`pending → processing`) ; **Refuser** → `cancelByFastFood`
   (remboursement du client par `orderCancel.service`, comme dans l'app).
3. **Suivi** : après chaque étape, message libre (fenêtre de 24 h ouverte par le clic, gratuit)
   avec le récapitulatif et UN bouton, l'étape suivante : Terminée (`<id>:finished`), puis En
   livraison (`<id>:delivering`). « Livrée » ne passe pas par un bouton : le marchand scanne le
   QR code du client avec l'appareil photo et envoie « LIVRÉ <orderId> <code> » (accepté depuis
   le numéro de la boutique seulement) → `confirmDelivery.service` ([orders.md](./orders.md),
   « Validation de livraison par QR code »).
4. Garde-fous : seul le numéro de la boutique pilote ses commandes (`event.from`) ; chaque
   action exige le statut précédent (un double clic ne fait pas avancer deux fois) ; numéros
   toujours envoyés au module en `+237…`.

## À venir

Versement automatique à la livraison validée, QR dans l'app client (frontend), rappel sans réponse (`yam_rappel_commande`),
`yam_statut_commande` hors fenêtre, `yam_commande_livree`, demande d'annulation :
`todo/fastfood/feature/whatsapp-commandes-marchand.md` et `todo/user/feature/annulation-sur-demande.md`.

## Fichiers

```
config/whatsapp.js
routes/whatsappWebhookRoutes.js
controllers/whatsapp/webhook.controller.js
services/whatsapp/webhookEvents.service.js     signature, aiguillage, onButton
services/whatsapp/whatsappModule.client.js     envoi, accusé de lecture
services/whatsapp/merchantOrders.service.js    flux marchands (commande, boutons, suivi)
services/whatsapp/merchantMessages.js          textes des messages marchands
services/whatsapp/merchantShop.service.js      réglage admin boutique WhatsApp
controllers/whatsapp/merchantShop.controller.js
interface/whatsappWebhookFields.js
utils/validator/validateWhatsappEvent.js
schema/migrations/085_whatsapp_settings.sql
```
