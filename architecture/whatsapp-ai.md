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
| `settings_app` | `ai_orders_page_size` | commandes en cours montrées d'office au modèle, et commandes par page de `list_orders` / `list_my_orders` (20, migration 094) |
| `settings_app` | `ai_daily_menu_hour` | heure (Cameroun) du menu du jour envoyé aux boutiques, `-1` = coupé (8, migration 097) |
| `settings_app` | `ai_default_menu_image_url` | image des plats créés par l'agent avant la photo du marchand ; vide = `<BACKEND_URL>/assets/menu-default.png` ; jamais une image du storage du projet (ignorée : la corbeille l'effacerait) |
| `settings_app` | `ai_admin_phones` | numéros WhatsApp (E.164) des super-administrateurs : alertes, agent admin (`[]`, migration 098 ; posés en base, jamais dans le dépôt) |
| `settings_app` | `ai_audio_models` | modèles OpenRouter qui **transcrivent** les notes vocales, essayés **un par un** dans l'ordre (migration 099) : `google/gemini-3.5-flash-lite`, `google/gemini-2.5-flash-lite`, `qwen/qwen3.8-omni-flash` (décision du 18/11/2026). `[]` = notes vocales non écoutées |
| `settings_app` | `ai_audio_max_seconds` | durée maximale écoutée (60) ; au-delà, l'agent demande un message plus court. `0` = non écoutées |
| `settings_app` | `wa_reserved_phones` | numéros des super-admins de l'AUTRE environnement (prod <-> test), refusés ici comme boutique WhatsApp ou livreur. Saisis en base seulement. `[]` = aucun |

Tout se change à chaud : `PATCH /settings/<clé>` (ex. `ai_models` = `["…", "…"]`). Types
vérifiés par `services/settings/patchSetting.service.js` : `ai_models` et `ai_admin_phones`
tableaux de chaînes (`ai_audio_models` aussi), `ai_enabled` booléen, `ai_daily_menu_hour` entier de -1 à 23,
`ai_default_menu_image_url` texte. ⚠️ Corrigé le 18/11/2026 : `ai_models` et `ai_enabled`
étaient validés comme des nombres, le PATCH annoncé ici était refusé.
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
   (consignes de `ai/agentPrompt.js` et état JSON : les `ai_orders_page_size` commandes en
   cours les plus récentes **vue marchand** et leur nombre total, propositions en attente),
   puis l'historique (`in` = user,
   `out` = assistant, horodatés, fusionnés par rôle). Boucle modèle → outils (6 tours max),
   puis la réponse finale part en message libre (`author: 'ai'`). Si OpenRouter échoue,
   le marchand reçoit un message de repli qui l'oriente vers les boutons.

## Outils (`ai/agentTools.js`)

| Outil | Effet |
|---|---|
| `list_orders` | commandes **en cours** seulement (`orders.searchForAgent`), filtre de statuts en cours, `page` ; `ai_orders_page_size` par page, `pageSuivante` ; vue marchand |
| `get_order` | détail d'une commande : parmi celles chargées, sinon cherchée en base par son n° (`orders.findByIdSuffix`), sans limite de date (litige, vérification) |
| `day_summary` | bilan d'un jour (aujourd'hui par défaut) : nombre de commandes passées ce jour-là par statut, somme vue marchand des livrées (`montantMarchandLivreesFcfa`) |
| `list_menus` | plats : id, nom, catégorie, **prix de la boutique** (`prices[]` brut, ce qu'elle encaisse), disponible, stock, photo `provisoire` / `ok` |
| `send_menu_list` | envoie la liste des plats avec prix et disponibilité (comme le menu du jour) |
| `propose_menu_availability` | proposition `menu_availability` (boutons) : plats disponibles / indisponibles, stock du jour |
| `propose_menu_create` | proposition `menu_create` (boutons) : nom, prix (taille), stock, catégorie ; prix contrôlés AVANT (`validateMenuPrices`) |
| `set_menu_photo` | pose une photo envoyée par CE numéro (3 derniers jours) sur un plat, tout de suite |
| `propose_push` | proposition `push_customers` (boutons) : push aux clients ou à une ville desservie, plan et quota de la boutique |
| `alert_admin` | alerte WhatsApp aux super-administrateurs (problème grave, décision Yaammoo) |
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

## Commandes vues par l'agent (décision du 17/11/2026)

L'agent gère les commandes **en cours** ; il ne lit pas l'historique, pour ne pas dépenser
de tokens sans besoin (une boutique à 100 commandes par jour en a environ 3 000 sur
30 jours). À chaque message, le backend ne charge que les commandes en cours
(`agentOrders.loadShopOrders` / `loadDriverOrders`). Le modèle en voit d'office les
`ai_orders_page_size` (20) plus récentes, et leur nombre total réparti par jour de
livraison prévu (`delivery.date`, sinon jour de la commande) : aujourd'hui, à venir,
passées non traitées (jour dépassé, toujours en cours) ; les autres par
`list_orders` / `list_my_orders`, 20 par page, la suite seulement sur demande. Sur
demande aussi : une commande par son numéro, même ancienne (`get_order`, litige), et le
bilan d'un jour (`day_summary` : quelques lignes au lieu de la liste). Liste des commandes
livrées ou annulées, historique, export : **pas sur WhatsApp**, l'agent renvoie vers
l'application Yaammoo. La conversation garde 30 jours (`ai_conversation_retention_days`),
au plus 100 messages relus.

## Menu du jour et plats (décisions du 18/11/2026, migration 097)

1. **Envoi quotidien** (`utils/whatsappDailyMenuJob.js`, toutes les 5 min) : à partir de
   `ai_daily_menu_hour` (heure du Cameroun), chaque boutique WhatsApp est prise une fois par
   jour (`wa_daily_menu_sends`, prise AVANT l'envoi) et reçoit
   (`menu/dailyMenu.service.js`) :
   - fenêtre de 24 h ouverte (dernier message reçu de son numéro < 24 h - 10 min) : la liste
     de ses plats, **prix de la boutique** et stock, disponibles puis indisponibles, et la
     question « qu'est-ce qui est disponible aujourd'hui ? » (découpée sous 3 500 caractères) ;
   - fenêtre fermée : template `yam_menu_du_jour` (boutique ; bouton « Voir mon menu »,
     payload `<fastFoodId>:menu_list`) ; le clic envoie la liste. Liste refusée par Meta
     (131047, référence `menu_<id>`) : template à la place, une fois par 10 min.
   - boutique sans plat : demande de ses plats, prix et quantités, par message ou photo de
     sa carte.
2. **Réponse** : l'agent compare avec `list_menus` et propose `menu_availability` (boutons) ;
   après confirmation, `ai/menuActions.js` passe chaque plat en `available` / `unavailable`
   par `updateMenuService` (stock forcé à 0 si indisponible ; un plat à stock 0 rendu
   disponible exige le stock du jour) puis renvoie la liste à jour. Rien à changer : pas de
   proposition. Sans réponse : rien ne change.
3. **Création** : `menu_create` après confirmation, par `postMenuService` (contrôles de prix,
   sockets) avec l'**image provisoire** (couverture + 3 images). Puis l'agent demande la
   photo d'**un plat à la fois** en le nommant ; une photo reçue en réponse à une demande, ou
   citée par le marchand avec le nom d'un plat (réponse à la photo), est posée par
   `set_menu_photo`. Prix d'un plat existant, suppression : pas sur WhatsApp.
4. **Photos reçues** (`ai/merchantImages.js`) : une image du numéro d'une boutique est
   téléchargée (`GET /media/:id` du module, `downloadMedia`), rangée dans le storage
   (`uploadImageToSupabase`), son adresse ajoutée à sa ligne du journal
   (`[image https://…]`), puis l'agent répond : les photos reçues depuis la dernière réponse
   (4 au plus) sont jointes au dernier message `user` (`image_url`). Carte du menu : l'agent
   lit plats et prix et propose `menu_create` (n'invente aucun prix illisible).
   Réponse à un message précis (`replyTo`) : le journal garde « (en réponse à : …) ».

## Push d'une boutique WhatsApp (migration 098)

`propose_push` -> `push_customers` (boutons) -> `ai/shopPushActions.js` ->
`sendBroadcast` avec le plan et le quota de la boutique (forfait gratuit :
[notifications-broadcast.md](./notifications-broadcast.md)), expéditeur = propriétaire.

## Agent admin et alertes (décisions du 18/11/2026, migration 098)

Super-administrateurs = numéros de `ai_admin_phones`. Code : `services/whatsapp/admin/`.

1. **Alertes** (`adminAlerts.service.alertAdmins`, table `wa_admin_alerts`) :
   - `alert_admin` des agents boutique et livreur (`ai/escalationTool.js`) : problème grave
     ou décision Yaammoo ;
   - message d'un utilisateur au support de la **plateforme** (fil sans boutique,
     `support/notifySupportMessage.js`).
   Fenêtre ouverte avec l'administrateur : détail en message libre ; sinon template
   `yam_alerte_admin` (qui, problème ; bouton « Voir », payload `<alertId>:adm_alert`).
2. **Agent admin** (`admin/adminAgent.service.js`, texte libre d'un numéro admin, AVANT
   l'agent des boutiques) : outils de lecture (`list_alerts`, `close_alert`,
   `support_threads`, `support_messages`, `support_stats` par catégorie, `find_shop`,
   `find_order` sur toutes les boutiques, `list_settings`) et **super-actions toujours
   confirmées** (`propose_admin_action` -> boutons `<id>:adm_yes|adm_no`, table
   `wa_admin_actions`, close avant d'agir, 24 h max) :

| Action | Exécution |
|---|---|
| `support_reply` | `postSupportMessageService` auteur `support` (push + socket à l'utilisateur) |
| `reply_alert` | message libre au marchand / livreur de l'alerte, seulement si sa fenêtre est ouverte ; alerte close |
| `push_shop_customers` | `sendBroadcast` au nom de la boutique, audience clients, **sans plan ni quota** (`admin: true`, plan `admin` enregistré) |
| `push_city` | `broadcastFanout.fanOutPlatform` : au nom de **Yaammoo** (type `platform_broadcast`), utilisateurs de la ville, bilan renvoyé à l'admin |
| `shop_visibility` | ajoute / retire la boutique de `hidden_fastfood_ids` (`patchSetting`) |
| `shop_whatsapp` | `setWhatsappOrders` |
| `order_status` | avance pas à pas (`pendingActions.advance`), jamais « livrée » |
| `order_cancel` | `cancelByFastFood` : client remboursé en entier, frais réels débités de la boutique (décision du 18/11/2026) |
| `setting` | `patchSetting(key, value)` (même contrôle de type que `PATCH /settings`) |

Le journal de conversation garde aussi les messages des administrateurs (`author: 'admin'`).

3. **Numéros fixés** (18/11/2026) : Yaammoo prod et test partagent le même numéro WhatsApp,
   et le module relaie un message reçu au backend qui a écrit en dernier au contact. Vécu : un
   admin prévu en prod tombait sur le test (boutique de test), un admin prévu en test tombait
   sur la prod (ignoré). Chaque backend fixe donc ses `ai_admin_phones` sur SA clé du module
   (`PUT /contact-routes`, migration 007 de rauval-backend) au démarrage puis toutes les 15 min
   (`utils/whatsappContactRoutesJob.js`). Un clic de bouton reste au backend qui a envoyé le message.
   Pour qu'aucun clic ne bascule d'une base à l'autre, un backend n'écrit jamais aux admins de
   l'autre : `wa_reserved_phones` (migration 101, `whatsapp/reservedPhones.js`) les refuse comme
   numéro WhatsApp de boutique (création, `PUT /fastfood`) et comme livreur (demande, acceptation,
   recrutement, invitation acceptée), erreur 400 « Ce numéro est réservé à l'administration
   Yaammoo… » (toast de l'app). Les clients ne reçoivent jamais de WhatsApp : rien à bloquer.
4. **Admin qui a aussi une boutique WhatsApp** (migration 100, `ai/handoffTool.js`) : deux
   agents, **admin par défaut**. Outil `handoff` : à sa demande (« passe la main à la boutique »,
   « à l'admin »), ou après avoir proposé de passer la main pour une demande qui n'est pas de
   son ressort, l'agent change l'agent actif (`wa_agent_modes`) et l'autre répond au même
   message (`event.handedOff` : pas de second passage). Le choix reste jusqu'au prochain
   changement ; sans ligne, agent admin.

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

Contrainte `action` de `wa_ai_pending_actions` élargie à ces deux actions par la migration 091,
puis à `menu_availability`, `menu_create` (097, détail dans `payload`, `ai/menuActions.js`) et
`push_customers` (098, `ai/shopPushActions.js`).

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
`ai/driverPrompt.js`. Le modèle voit les commandes confiées en cours (`agentOrders.loadDriverOrders`, même règle que le marchand :
statut, plats, zone et créneau, `partBoutiqueFcfa`), **jamais** les coordonnées du client
ni le prix payé : `send_order_details` envoie la fiche directement.

| Outil (`ai/driverTools.js`) | Effet |
|---|---|
| `list_my_orders` | commandes confiées **en cours**, par pages (comme `list_orders`) |
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
| `yam_menu_du_jour` | 1 boutique | réponse rapide « Voir mon menu » (payload `<fastFoodId>:menu_list`) |
| `yam_alerte_admin` | 1 qui, 2 problème | réponse rapide « Voir » (payload `<alertId>:adm_alert`) |

## Rétention (`utils/whatsappAiPurgeJob.js`, 1×/h)

Conversation et alertes admin effacées au-delà de `ai_conversation_retention_days`.
Actions admin : mêmes règles que les propositions (expirées à 24 h).
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
services/whatsapp/ai/voiceNotes.js               note vocale (boutique, livreur, admin) : transcrite, Confirmer / Corriger
services/ai/transcribeAudio.js                   transcription OpenRouter, modèles un par un
utils/oggOpusSeconds.js                          durée d'une note vocale Ogg Opus
services/whatsapp/ai/driverPrompt.js             consignes livreur, état
services/whatsapp/ai/driverTools.js              outils du livreur
services/whatsapp/driver/driverDirectory.js      numéro -> livreur, livreurs d'une boutique
services/whatsapp/driver/driverAccounts.service.js  ajout, numéro OM / MoMo (direct ou code SMS)
services/whatsapp/driver/driverDeliveries.service.js affectation, fiche, départ, relais
services/whatsapp/driver/driverMessages.js       textes envoyés au livreur
services/whatsapp/ai/merchantMenuTools.js       outils plats du marchand, push
services/whatsapp/ai/menuActions.js              disponibilité, création (image provisoire)
services/whatsapp/ai/shopPushActions.js          push de la boutique (plan, quota)
services/whatsapp/ai/merchantImages.js           photos reçues : storage, journal, modèle
services/whatsapp/ai/escalationTool.js           alert_admin (boutique, livreur)
services/whatsapp/menu/dailyMenu.service.js      liste du jour, template, bouton Voir mon menu
services/whatsapp/admin/adminAlerts.service.js   alertes, numéros admin, fenêtre de 24 h
services/whatsapp/admin/adminAgent.service.js    agent admin (consignes, état)
services/whatsapp/admin/adminTools.js            outils de l'agent admin
services/whatsapp/admin/adminActions.service.js  super-actions confirmées
services/whatsapp/ai/handoffTool.js              passage de main admin <-> boutique (admin qui a une boutique)
utils/whatsappContactRoutesJob.js                numéros admin fixés sur la clé du backend (module)
repositories/supabase/waAgentModes.repo.js       agent actif d'un admin qui a une boutique
schema/migrations/100_wa_agent_modes.sql
services/settings/patchSetting.service.js        réglage à chaud (PATCH /settings, agent admin)
utils/whatsappAiPurgeJob.js
utils/whatsappDailyMenuJob.js
public/assets/menu-default.png                   image provisoire (servie sous /assets)
repositories/whatsappMappers.js
repositories/supabase/waConversations.repo.js
repositories/supabase/waAiPendingActions.repo.js
schema/migrations/090_whatsapp_ai.sql
schema/migrations/093_whatsapp_drivers.sql
schema/migrations/094_ai_orders_page_size.sql
schema/migrations/097_wa_daily_menu.sql
schema/migrations/098_wa_admin_agent.sql
schema/migrations/099_ai_voice_notes.sql
repositories/supabase/waDailyMenuSends.repo.js
repositories/supabase/waAdminAlerts.repo.js
repositories/supabase/waAdminActions.repo.js
```

## À venir

L'IA prend le relais quand une action fixe échoue (« LIVRÉ » au code faux, commande
inconnue…) : tâche `todo/fastfood/feature/ia-relais-echec-action-fixe.md`.

Images du livreur : journalisées seulement (`[image]`), pas envoyées au modèle (celles du
marchand le sont, section « Menu du jour et plats »).

## Notes vocales (décisions du 18/11/2026, migration 099)

Les modèles des agents (`ai_models`) n'écoutent pas l'audio : la note est **d'abord
transcrite**, puis l'agent travaille sur le texte avec ses modèles habituels.

1. **Qui** : numéro d'un super-administrateur, d'une boutique WhatsApp ou d'un de ses
   livreurs, IA active (`ai/voiceNotes.js`, abonné `onMedia`). Traitement en arrière-plan.
2. **Contrôles** : téléchargement (`downloadMedia`), type `audio/*`. Durée lue dans le
   fichier Ogg Opus (format des notes WhatsApp, `utils/oggOpusSeconds.js`) ; autre format :
   taille plafonnée à `ai_audio_max_seconds` × 32 ko. Trop longue : « Votre note vocale dure
   … : j'écoute au plus 1 min », journal `[vocal trop long, non écouté]`.
3. **Transcription** (`services/ai/transcribeAudio.js`) : `chat/completions` avec un
   `input_audio` (base64, `ogg` / `mp3` / `m4a` / `aac` / `wav` / `flac`), modèles de
   `ai_audio_models` **un par un** : le suivant si l'un échoue, refuse le format ou répond
   vide. Mot pour mot, langue parlée gardée, langue locale traduite entre parenthèses,
   `[inaudible]`. Rien de compris : « Je n'ai pas compris… », journal `[vocal non compris]`.
   Tous en échec : « Je n'ai pas pu écouter… ».
4. **Confirmation** : la ligne du journal devient `[vocal à confirmer] <texte>` et Yaammoo
   envoie « J'ai compris : « … » C'est bien ça ? » avec **Confirmer** / **Corriger**
   (payload `<id du message vocal>:vo_yes|vo_no`). Seul le numéro qui a envoyé la note peut
   cliquer ; la ligne est changée sous condition (`swapBodyByMessageId`) : un double clic
   n'agit qu'une fois.
   - Confirmer : `[vocal] <texte>`, puis le texte part aux flux texte
     (`webhookEvents.dispatchText`) : agent admin, boutique ou livreur, comme un message écrit.
   - Corriger : `[vocal rejeté] …`, « Renvoyez votre note vocale, ou écrivez votre message ».
5. **Consignes** (`agentPrompt.VOICE_RULE`, reprise par les trois agents) : `[vocal]` = message
   confirmé ; `[vocal à confirmer]` : rien sans confirmation écrite ; les autres sont ignorées.

`ai_audio_models` vide ou `ai_audio_max_seconds` à 0 : réponse fixe, sans appel au modèle,
« Merci d'écrire votre message : les notes vocales ne sont pas lues. ».

Coût estimé (prix OpenRouter du 18/11/2026, à revérifier) : pour 1 000 notes d'une minute,
≈ 1,1 $ avec Gemini 3.5 Flash-Lite, ≈ 0,66 $ avec Gemini 2.5 Flash-Lite. Comparés et
écartés : ElevenLabs Scribe v3 (≈ 3,3 $, clé à part), Groq Whisper (clé à part), GPT Audio
(≈ 20 fois plus cher), Claude (n'écoute pas l'audio), Wispr Flow (API réservée aux entreprises).
