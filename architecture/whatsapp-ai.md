# Agent IA des boutiques WhatsApp (OpenRouter)

Le marchand d'une boutique WhatsApp ([whatsapp.md](./whatsapp.md)) n'a pas l'app :
il reçoit ses commandes sur WhatsApp. Les boutons et « LIVRÉ » couvrent le cas simple.
Dès qu'il **écrit librement** (fenêtre de 24 h ouverte par son message), un agent IA
prend le relais. Il voit toute la conversation récente et les commandes de la boutique,
il répond, et il agit par les services existants.

Ses **livreurs** ont leur propre agent (section « Livreurs ») : le marchand leur confie
ses commandes par l'IA, le livreur échange avec l'IA sur ses courses, et la part de la
boutique part sur le numéro Orange Money / MTN MoMo du livreur au scan du QR du client.

## Configuration

| Où | Clé | Rôle |
|---|---|---|
| Secret Fly | `OPENROUTER_API_URL` | `https://openrouter.ai/api/v1` |
| Secret Fly | `OPENROUTER_API_KEY` | clé du compte OpenRouter |
| `settings_app` | `ai_enabled` | `true` = l'agent traite les textes libres (migration : `true`) |
| `settings_app` | `ai_models` | modèles OpenRouter **essayés dans l'ordre** (paramètre `models`, repli automatique). `[]` = IA coupée. `qwen/qwen3.7-flash` puis `z-ai/glm-5.3-flash` (décision du 16/11/2026 : les moins chers qui lisent les images et appellent des outils, le moins cher d'abord ; l'agent envoie surtout des tokens d'entrée) |
| `settings_app` | `ai_timeout_ms` | délai max d'un appel (30000) |
| `settings_app` | `ai_conversation_retention_days` | rétention de la conversation (30) |
| `settings_app` | `ai_history_max_messages` | messages relus à chaque réponse (100) |

Tout se change à chaud : `PATCH /settings/<clé>` (ex. `ai_models` = `["…", "…"]`).
Lecture : `settings.service.getAiSettings()` (IA coupée si `ai_models` est vide ou en cas d'échec).

## Flux

1. **Journal** (`services/whatsapp/conversationLog.js`, table `wa_conversation_messages`) :
   tout message reçu du numéro d'une boutique WhatsApp ou d'un de ses livreurs (`onInbound`,
   avant l'aiguillage) et tout envoi de `merchantChannel.send` (templates, suivis, fiches,
   réponses de l'IA). Champ `author` : `merchant`, `driver`, `system` (flux automatiques), `ai`.
2. **Aiguillage** : un bouton va à son flux, et « LIVRÉ <id> <code> » à `onDeliveredText`.
   Tout **autre texte** va à `ai/merchantAgent.service` (dernier abonné `onText`), mais
   seulement si l'IA est active et que le numéro est celui d'une boutique WhatsApp
   (`merchantChannel.shopsOfPhone`, cache d'1 min ; un numéro peut piloter plusieurs boutiques).
   Le traitement tourne en arrière-plan : le module reçoit son `200` tout de suite.
   Les messages d'un même numéro sont traités un par un, dans l'ordre. Si plusieurs
   arrivent pendant une réponse, seul le dernier en déclenche une autre (il voit les
   précédents dans l'historique).
3. **Tour de l'agent** (boucle commune `ai/agentLoop.js`) : accusé de lecture + « en train d'écrire ». Ensuite, message système
   (consignes de `ai/agentPrompt.js` et état JSON : commandes en cours **vue marchand**,
   propositions en attente), puis l'historique (`in` = user,
   `out` = assistant, horodatés, fusionnés par rôle). Boucle modèle → outils (6 tours max),
   puis la réponse finale part en message libre (`author: 'ai'`). Si OpenRouter échoue,
   le marchand reçoit un message de repli qui l'oriente vers les boutons.

## Outils (`ai/agentTools.js`)

| Outil | Effet |
|---|---|
| `list_orders` | commandes des 30 derniers jours (`orders.query` avec `createdAfter`), vue marchand, sans `pendingToBuy` |
| `get_order` | détail d'une commande |
| `list_menus` | plats (nom, catégorie, statut, stock), **sans prix** |
| `propose_action` | crée une proposition et envoie les boutons Confirmer / Annuler |
| `confirm_action` | exécute une proposition confirmée **par écrit** |
| `cancel_action` | annule une proposition |
| `list_drivers` | livreurs de la boutique : nom, téléphone, numéro de paiement validé, commandes confiées |
| `add_driver` | ajoute un livreur par son numéro (compte créé s'il n'existe pas), message de bienvenue |
| `assign_driver` | confie des commandes à un livreur, **directement** (sans boutons) ; fiche envoyée au livreur |
| `message_driver` | relaie un message de la boutique au livreur |

Argent (R22) : l'agent ne voit que `montantMarchandFcfa` (`toMerchantView`, ce que le
marchand encaisse). Il ne voit jamais le prix client, la marge ni les frais. Les données
personnelles du client ne sont pas transmises au modèle.

**Pas d'échange avec le client** (décision du 16/11/2026) : l'agent ne contacte pas le
client et ne donne pas son numéro au marchand ; seul le livreur reçoit les coordonnées du
client, sur sa fiche. Une partie « messages boutique → client » (`/shop-messages`,
`wa_client_messages`) a été retirée avant mise en prod ; à réimplémenter si le besoin revient.

## Confirmation obligatoire (`ai/pendingActions.service.js`, table `wa_ai_pending_actions`)

Aucun statut ne change sans l'accord du marchand.

| Action | Possible si | Exécution |
|---|---|---|
| `accept` | `pending` | `updateOrders` → `processing` |
| `refuse` | `pending` | `updateOrders` `cancelByFastFood` (client remboursé, comme le bouton Refuser) |
| `finished` | rang < `finished` | `updateOrders` pas à pas jusqu'à `finished` |
| `delivering` | rang < `delivering` | pas à pas jusqu'à `delivering` |
| `cancel_accept` | `pending` + demande d'annulation en attente | comme le bouton « Accepter annulation » (`cancelByUser`, client remboursé) |
| `cancel_refuse` | idem | comme « Refuser annulation » (commande maintenue) |

Contrainte `action` de `wa_ai_pending_actions` élargie à ces deux actions par la migration 091.

« Livrée » est exclu : seul le QR du client la valide. Une proposition porte sur UNE
boutique. Boutons `<id>:ai_yes` / `<id>:ai_no` ; une réponse écrite (« oui ») conduit
l'agent à appeler `confirm_action`. La proposition est **close avant d'agir**
(`resolveIfOpen`) : un double clic, ou un clic suivi d'un « oui », n'exécute qu'une fois.
Les statuts sont relus en base et le numéro doit être celui de la boutique. Au-delà
de 24 h, la proposition expire. Après exécution : compte rendu, puis récapitulatif
avec le bouton de l'étape suivante (`replyRecap`).

Les avances pas à pas (propositions, boutons de `yam_statut_commande`, départ du livreur)
passent `expectedStatus` à `updateOrders` : deux actions croisées ne font jamais sauter une
étape (jamais « livrée » sans le QR du client).

## Livreurs (décisions du 16/11/2026)

Un livreur est un user rattaché à la boutique (`driver_applications` `accepted`,
[drivers.md](./drivers.md)), avec ou sans l'app. Code : `services/whatsapp/driver/`.

1. **Ajout** (`add_driver`, `driverAccounts.service`) : compte trouvé par numéro, sinon créé
   (numéro seul, uid `ph_<numéro>` comme `/auth/phone`), puis rattaché (`driverRecruit`
   `add`). Message de bienvenue ; hors fenêtre de 24 h, template `yam_livreur_ajoute`
   (boutique).
2. **Numéro de paiement obligatoire** : un livreur sans numéro OM / MoMo validé
   (`payout_numbers`) ne peut ni recevoir de commande ni partir en livraison. Il donne son
   numéro à l'agent : celui d'où il écrit est validé **sans code** (WhatsApp le prouve ;
   noté aussi WhatsApp validé, `whatsapp_numbers.source = 'inbound'`). Un autre numéro reçoit
   un **code SMS** (`payoutNumber.service`, mêmes envois que `/wallet/payout-number/request`),
   que le livreur renvoie à l'agent (`verify_payout_number`). Frais du SMS (`sms_fee`) :
   débités à la **boutique** du livreur (la plus récente s'il en sert plusieurs,
   `billUserId`), décision du 16/11/2026.
3. **Affectation** (`assign_driver`, `driverDeliveries.assignOrders`) : commandes acceptées
   (en cours, terminées, en livraison) et livrées à domicile ; `driverOrders.assignDriver`
   (sockets `driverOrderAssigned`, `userOrderUpdated`, `fastFoodOrderUpdated` : l'app est à
   jour). Fiche au livreur : n°, boutique, plats, livraison, lien carte (`delivery.location`),
   note, note vocale, **nom et téléphone du client**, **part de la boutique** (vue marchand),
   bouton « Je pars en livraison » (`<id>:drv_go`). Hors fenêtre : template
   `yam_livraison_livreur` (boutique, n°, plats, livraison ; même bouton).
4. **Départ** : bouton ou agent du livreur (`start_delivery`), **tout de suite**, sans
   confirmation. Seulement ses commandes, acceptées ; avance pas à pas jusqu'à « en
   livraison ». La boutique est prévenue.
5. **Remise** : le livreur scanne le QR du client, dans l'app Yaammoo
   (`POST /order/:orderId/confirm-delivery`, livreur assigné) ou avec l'appareil photo :
   WhatsApp s'ouvre avec « LIVRÉ <id> <code secret> », accepté depuis SON numéro
   ([whatsapp.md](./whatsapp.md)). Les deux passent par `confirmDelivery.service`, qui
   n'accepte que **lui** (son compte ou son numéro) : un autre qui scanne ne valide rien et
   n'encaisse rien ; la tentative est tracée et signalée à la boutique et au livreur. Pour une
   boutique WhatsApp, aucun autre chemin ne passe une commande en « livrée » (bouton
   d'avance de l'app refusé, [orders.md](./orders.md)). La part de la boutique part sur son numéro
   OM / MoMo ([wallet.md](./wallet.md), « Versement automatique ») ; boutique et livreur
   sont prévenus du verdict. La boutique reçoit `yam_commande_livree`.
6. **Messages relayés** : `message_driver` (boutique -> livreur) et `message_shop`
   (livreur -> boutique), référence `relay_<numéro de l'expéditeur>` : refusé hors fenêtre
   de 24 h, l'expéditeur est prévenu d'appeler.

### Agent du livreur (`ai/driverAgent.service.js`)

Texte libre d'un numéro de livreur d'une boutique WhatsApp (pas d'un numéro de boutique,
qui reste à l'agent du marchand). Même boucle et même journal que le marchand ; consignes
`ai/driverPrompt.js`. Le modèle voit les commandes confiées (`agentOrders.loadDriverOrders` :
statut, plats, zone et créneau, `partBoutiqueFcfa`), **jamais** les coordonnées du client
ni le prix payé : `send_order_details` envoie la fiche directement.

| Outil (`ai/driverTools.js`) | Effet |
|---|---|
| `list_my_orders` | commandes confiées (30 jours), en cours par défaut |
| `send_order_details` | envoie la fiche complète (coordonnées du client comprises) |
| `start_delivery` | passe les commandes en livraison tout de suite, boutique prévenue |
| `message_shop` | relaie un message à la boutique |
| `register_payout_number` | son numéro OM / MoMo : celui d'où il écrit validé tout de suite, un autre reçoit un code SMS |
| `verify_payout_number` | vérifie le code SMS renvoyé et valide le numéro |

### Templates à créer chez Meta (module rauval-backend)

| Nom | Variables | Bouton |
|---|---|---|
| `yam_livraison_livreur` | 1 boutique, 2 n°, 3 plats, 4 livraison | réponse rapide « Je pars en livraison » (payload `<id>:drv_go`) |
| `yam_livreur_ajoute` | 1 boutique | aucun |

## Rétention (`utils/whatsappAiPurgeJob.js`, 1×/h)

Conversation effacée au-delà de `ai_conversation_retention_days`.
Propositions ouvertes depuis plus de 24 h → `expired`. Propositions plus vieilles que la
rétention → effacées.

## Fichiers

```
config/openrouter.js
services/ai/openrouter.client.js                 appel chat + outils, repli de modèles
services/whatsapp/conversationLog.js             journal (onInbound + merchantChannel.send)
services/whatsapp/ai/agentLoop.js                boucle modèle / outils, file par numéro (commune)
services/whatsapp/ai/merchantAgent.service.js    texte libre du marchand -> agent
services/whatsapp/ai/agentPrompt.js              consignes marchand, état, historique
services/whatsapp/ai/agentTools.js               outils du marchand (commandes, propositions)
services/whatsapp/ai/merchantDriverTools.js      outils du marchand (livreurs)
services/whatsapp/ai/agentOrders.js              commandes vue marchand / livreur, résolution des n°
services/whatsapp/ai/pendingActions.service.js   propositions, boutons Confirmer / Annuler
services/whatsapp/ai/driverAgent.service.js      texte libre du livreur -> agent
services/whatsapp/ai/voiceNotes.js               note vocale (marchand, livreur) -> « écrivez »
services/whatsapp/ai/driverPrompt.js             consignes livreur, état
services/whatsapp/ai/driverTools.js              outils du livreur
services/whatsapp/driver/driverDirectory.js      numéro -> livreur, livreurs d'une boutique
services/whatsapp/driver/driverAccounts.service.js  ajout, numéro OM / MoMo (direct ou code SMS)
services/whatsapp/driver/driverDeliveries.service.js affectation, fiche, départ, relais
services/whatsapp/driver/driverMessages.js       textes envoyés au livreur
utils/whatsappAiPurgeJob.js
repositories/whatsappMappers.js
repositories/supabase/waConversations.repo.js
repositories/supabase/waAiPendingActions.repo.js
schema/migrations/090_whatsapp_ai.sql
schema/migrations/093_whatsapp_drivers.sql
```

## À venir

Images du marchand et du livreur : journalisées seulement (`[image]`), pas envoyées au
modèle (les modèles actuels les lisent : à brancher si besoin). Transcription des notes
vocales : seulement si les marchands en envoient beaucoup (modèle audio le moins cher vu le
17/11/2026 : `qwen/qwen3.8-omni-flash`).

## Notes vocales

Les modèles de l'agent ne lisent pas l'audio. Une note vocale (`audio` / `voice`) d'un numéro
de boutique WhatsApp ou d'un livreur reçoit tout de suite, sans appel au modèle : « Merci
d'écrire votre message : les notes vocales ne sont pas lues. » (`ai/voiceNotes.js`, abonné
par `onMedia` dans `webhookEvents.service`, IA active seulement). La note reste journalisée.
