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

Réglages en base : `settings_app.whatsapp_timeout_ms` (15000 par défaut, migration 085),
`settings_app.whatsapp_reminder_minutes` (10 par défaut, 0 = pas de rappel, migration 087).
Test et prod sont indépendants : dans le module, chaque clé API de l'appli Yaammoo a sa
propre URL de relais (`wa_api_keys.webhook_url`) : « clé initiale » (prod, secret
`WHATSAPP_API_KEY` de yaammoo-backend) → `https://yaammoo-backend.fly.dev/whatsapp/webhook`,
« backend de test » (yaammoo-backend-dev) → `https://yaammoo-backend-dev.fly.dev/whatsapp/webhook`.
Un clic ou un statut revient au backend dont la clé a envoyé le message ; un message libre, à
celui qui a écrit en dernier à ce contact. Même secret de signature pour les deux.

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
   - `message` sans bouton : `onText` (« LIVRÉ … », puis l'**agent IA** pour tout autre texte
     d'une boutique, [whatsapp-ai.md](./whatsapp-ai.md)) ; sinon journalisé.
   - Tout message reçu passe d'abord par `onInbound` (journal de conversation de l'agent IA).
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
   livraison (`<id>:delivering`). « Livrée » ne passe pas par un bouton : celui qui livre scanne le
   QR code du client avec l'appareil photo et envoie « LIVRÉ <orderId> <code> » (accepté depuis
   le numéro du livreur assigné à la commande, sinon celui de la boutique ; un code valide
   envoyé par un autre numéro est refusé et signalé) → `confirmDelivery.service`
   ([orders.md](./orders.md), « Validation de livraison par QR code »). La validation verse la
   part du marchand sur son numéro de versement (`PUT /fastfood/:id/payout-number`, admin), ou
   sur le numéro OM / MoMo du **livreur** si la commande lui est confiée ; la réponse dit
   « Versement de X FCFA en cours vers le … », puis un message au verdict (reçu / échoué, à la
   boutique et au livreur) ([wallet.md](./wallet.md), « Versement automatique d'une commande »).
   Livrée par le livreur : la boutique reçoit `yam_commande_livree`.
4. Garde-fous : seul le numéro de la boutique pilote ses commandes (`event.from`), le livreur
   seulement celles qui lui sont confiées ; chaque
   action exige le statut précédent (un double clic ne fait pas avancer deux fois) ; numéros
   toujours envoyés au module en `+237…`.

### Templates hors clic (`merchantTemplates.service.js`)

- **Rappel** : commande payée encore `pending` depuis `whatsapp_reminder_minutes` →
  UN `yam_rappel_commande` (n°, plats, minutes ; boutons Accepter / Refuser, mêmes payloads
  que `yam_nouvelle_commande`). `utils/whatsappReminderJob.js` (1×/min, jusqu'à 24 h) ;
  table `wa_order_reminders` (migration 087), ligne prise avant l'envoi.
- **Livrée depuis l'app** (scan dans l'app, pas « LIVRÉ ») → `yam_commande_livree` (n°, plats).
- **Hors fenêtre de 24 h** : un suivi (référence `order_<id>`) refusé par Meta avec l'erreur
  131047 (statut `failed`, `onSendFailed`) → `yam_statut_commande` (n°, plats ; boutons
  En attente / En cours / Terminée / Livraison en cours / Livrée, payloads `<id>:st_pending|
  st_processing|st_finished|st_delivering|st_delivered`). La commande avance pas à pas
  (`updateOrders`) jusqu'au statut déclaré ; « Livrée » s'arrête à « en livraison » (le QR
  du client valide la remise). Un statut déclaré en retard ne recule rien.

### Demande d'annulation (`merchantCancelRequests.service.js`)

Le client d'une boutique WhatsApp demande l'annulation d'une commande en attente
(`services/order/cancelRequest.service.js`, [order-cancel.md](./order-cancel.md)) :
message libre au marchand (n°, plats, livraison) avec les boutons « Accepter annulation »
(`<id>:cancel_ok`) et « Refuser annulation » (`<id>:cancel_no`), référence `cancelreq_<id>`.
Refusé hors fenêtre de 24 h (131047) -> template `yam_demande_annulation` (bodyParams :
n°, plats ; boutons « Accepter l'annulation » / « Refuser, déjà commencée », mêmes
payloads ; variables vérifiées contre le template soumis). Accepter -> `cancelByUser` (client remboursé) ; Refuser ->
commande maintenue, récapitulatif avec Accepter / Refuser la commande. Demande renvoyée
par le client sans réponse (`cancel_request_resend_minutes`) : même message, préfixé « Relance ». Seul le numéro de la
boutique décide ; l'agent IA propose aussi ces deux actions (`cancel_accept`, `cancel_refuse`).

## Agent IA (texte libre du marchand et des livreurs)

Hors boutons et « LIVRÉ », le marchand qui écrit librement est servi par un agent IA
(OpenRouter) qui voit toute la conversation et ses commandes et propose les actions (avec
confirmation) : [whatsapp-ai.md](./whatsapp-ai.md). Il confie aussi les commandes aux
livreurs de la boutique, qui ont leur propre agent (fiche de course, départ en livraison,
numéro OM / MoMo validé par WhatsApp : « Livreurs » du même fichier). Chaque envoi de
`merchantChannel.send` est journalisé (`conversationLog.js`).

Aiguillage des textes (`onText`, dans l'ordre) : « LIVRÉ … », agent du marchand (numéro
de boutique), agent du livreur (numéro de livreur).

## À venir

QR dans l'app client (frontend, branche `feature/qr-livraison-whatsapp`),
`yam_nouveau_message` : `todo/fastfood/feature/whatsapp-commandes-marchand.md`.

## Fichiers

```
config/whatsapp.js
routes/whatsappWebhookRoutes.js
controllers/whatsapp/webhook.controller.js
services/whatsapp/webhookEvents.service.js     signature, aiguillage, onButton, onText, onSendFailed
services/whatsapp/whatsappModule.client.js     envoi, accusé de lecture
services/whatsapp/merchantChannel.js           envoi commun (numéro boutique, étape suivante, récap, shopsOfPhone)
services/whatsapp/conversationLog.js           journal de conversation (agent IA, whatsapp-ai.md)
services/whatsapp/ai/                          agents IA marchand et livreur (whatsapp-ai.md)
services/whatsapp/driver/                      livreurs : annuaire, ajout, numéro OM / MoMo, courses (whatsapp-ai.md)
services/whatsapp/merchantOrders.service.js    flux marchands (commande, boutons, suivi, « LIVRÉ »)
services/whatsapp/merchantTemplates.service.js rappel, livrée depuis l'app, statut hors fenêtre
services/whatsapp/merchantCancelRequests.service.js demande d'annulation du client (boutons, template)
services/order/cancelRequest.service.js        demande d'annulation (création, acceptation, refus)
services/wallet/orderPayout.service.js         versement automatique à la livraison
utils/whatsappReminderJob.js                   rappel des commandes sans réponse
repositories/supabase/waOrderReminders.repo.js
services/whatsapp/merchantMessages.js          textes des messages marchands
services/whatsapp/merchantShop.service.js      réglage admin boutique WhatsApp
controllers/whatsapp/merchantShop.controller.js
interface/whatsappWebhookFields.js
utils/validator/validateWhatsappEvent.js
schema/migrations/085_whatsapp_settings.sql
schema/migrations/086_order_payout.sql
schema/migrations/087_whatsapp_order_reminders.sql
schema/migrations/091_cancel_request.sql
schema/migrations/092_cancel_request_resend.sql
schema/migrations/093_whatsapp_drivers.sql
```
