# Agent IA des boutiques WhatsApp (OpenRouter)

Le marchand d'une boutique WhatsApp ([whatsapp.md](./whatsapp.md)) n'a pas l'app :
il reçoit ses commandes sur WhatsApp. Les boutons et « LIVRÉ » couvrent le cas simple.
Dès qu'il **écrit librement** (fenêtre de 24 h ouverte par son message), un agent IA
prend le relais. Il voit toute la conversation récente et les commandes de la boutique,
il répond, et il agit par les services existants.

## Configuration

| Où | Clé | Rôle |
|---|---|---|
| Secret Fly | `OPENROUTER_API_URL` | `https://openrouter.ai/api/v1` |
| Secret Fly | `OPENROUTER_API_KEY` | clé du compte OpenRouter |
| `settings_app` | `ai_enabled` | `true` = l'agent traite les textes libres (migration : `true`) |
| `settings_app` | `ai_models` | modèles OpenRouter **essayés dans l'ordre** (paramètre `models`, repli automatique). `[]` = IA coupée. Migration : `anthropic/claude-haiku-5.5`, `google/gemini-3.1-flash-lite`, `deepseek/deepseek-v4.1-flash` |
| `settings_app` | `ai_timeout_ms` | délai max d'un appel (30000) |
| `settings_app` | `ai_conversation_retention_days` | rétention conversation + messages au client (30) |
| `settings_app` | `ai_history_max_messages` | messages relus à chaque réponse (100) |

Tout se change à chaud : `PATCH /settings/<clé>` (ex. `ai_models` = `["…", "…"]`).
Lecture : `settings.service.getAiSettings()` (IA coupée si `ai_models` est vide ou en cas d'échec).

## Flux

1. **Journal** (`services/whatsapp/conversationLog.js`, table `wa_conversation_messages`) :
   tout message reçu du numéro d'une boutique WhatsApp (`onInbound`, avant l'aiguillage)
   et tout envoi de `merchantChannel.send` (templates, suivis, réponses de l'IA). Champ
   `author` : `merchant`, `system` (flux automatiques), `ai`.
2. **Aiguillage** : un bouton va à son flux, et « LIVRÉ <id> <code> » à `onDeliveredText`.
   Tout **autre texte** va à `ai/merchantAgent.service` (dernier abonné `onText`), mais
   seulement si l'IA est active et que le numéro est celui d'une boutique WhatsApp
   (`merchantChannel.shopsOfPhone`, cache d'1 min ; un numéro peut piloter plusieurs boutiques).
   Le traitement tourne en arrière-plan : le module reçoit son `200` tout de suite.
   Les messages d'un même numéro sont traités un par un, dans l'ordre. Si plusieurs
   arrivent pendant une réponse, seul le dernier en déclenche une autre (il voit les
   précédents dans l'historique).
3. **Tour de l'agent** : accusé de lecture + « en train d'écrire ». Ensuite, message système
   (consignes de `ai/agentPrompt.js` et état JSON : commandes en cours **vue marchand**,
   propositions en attente, messages au client), puis l'historique (`in` = user,
   `out` = assistant, horodatés, fusionnés par rôle). Boucle modèle → outils (6 tours max),
   puis la réponse finale part en message libre (`author: 'ai'`). Si OpenRouter échoue,
   le marchand reçoit un message de repli qui l'oriente vers les boutons.

## Outils (`ai/agentTools.js`)

| Outil | Effet |
|---|---|
| `list_orders` | commandes des 30 derniers jours (`orders.query` avec `createdAfter`), vue marchand, sans `pendingToBuy` |
| `get_order` | détail + messages déjà échangés avec le client |
| `list_menus` | plats (nom, catégorie, statut, stock), **sans prix** |
| `propose_action` | crée une proposition et envoie les boutons Confirmer / Annuler |
| `confirm_action` | exécute une proposition confirmée **par écrit** |
| `cancel_action` | annule une proposition |
| `ask_client` / `notify_client` | message de la boutique au client (question / information) |

Argent (R22) : l'agent ne voit que `montantMarchandFcfa` (`toMerchantView`, ce que le
marchand encaisse). Il ne voit jamais le prix client, la marge ni les frais. Les données
personnelles du client ne sont pas transmises au modèle.

## Confirmation obligatoire (`ai/pendingActions.service.js`, table `wa_ai_pending_actions`)

Aucun statut ne change sans l'accord du marchand.

| Action | Possible si | Exécution |
|---|---|---|
| `accept` | `pending` | `updateOrders` → `processing` |
| `refuse` | `pending` | `updateOrders` `cancelByFastFood` (client remboursé, comme le bouton Refuser) |
| `finished` | rang < `finished` | `updateOrders` pas à pas jusqu'à `finished` |
| `delivering` | rang < `delivering` | pas à pas jusqu'à `delivering` |

« Livrée » est exclu : seul le QR du client la valide. Une proposition porte sur UNE
boutique. Boutons `<id>:ai_yes` / `<id>:ai_no` ; une réponse écrite (« oui ») conduit
l'agent à appeler `confirm_action`. La proposition est **close avant d'agir**
(`resolveIfOpen`) : un double clic, ou un clic suivi d'un « oui », n'exécute qu'une fois.
Les statuts sont relus en base et le numéro doit être celui de la boutique. Au-delà
de 24 h, la proposition expire. Après exécution : compte rendu, puis récapitulatif
avec le bouton de l'étape suivante (`replyRecap`).

## Messages boutique → client (`ai/clientMessages.service.js`, table `wa_client_messages`)

- Envoi (`ask_client` / `notify_client`) : ligne `{ text, expectsAnswer }`, socket fiable
  `shop.message { data: ShopMessage }` vers la room `<userId>`, push `type: 'ShopMessage'`,
  `route: 'shop-message/<id>'`, expéditeur = la boutique (`shopSender`).
- `GET /shop-messages?orderId=` (Bearer) : messages du client connecté, plus récents d'abord.
- `POST /shop-messages/:id/answer { answer }` (Bearer, 1000 caractères max ;
  `interface/shopMessageFields.js`) : `404` si le message n'est pas à lui, `400` s'il n'attend
  pas de réponse, `409` s'il a déjà répondu. La réponse est relayée au marchand sur WhatsApp
  (« Réponse du client (commande n°X) à « … » : … ») et poussée par `shop.messageUpdated { data }`.

`ShopMessage` = `{ id, orderId, orderRef, fastFoodId, fastFood: { id, name, image }, userId,
text, expectsAnswer, answer, status: open|answered|closed, createdAt, answeredAt }`.

## Rétention (`utils/whatsappAiPurgeJob.js`, 1×/h)

Conversation et messages au client effacés au-delà de `ai_conversation_retention_days`.
Propositions ouvertes depuis plus de 24 h → `expired`. Propositions plus vieilles que la
rétention → effacées.

## Fichiers

```
config/openrouter.js
services/ai/openrouter.client.js                 appel chat + outils, repli de modèles
services/whatsapp/conversationLog.js             journal (onInbound + merchantChannel.send)
services/whatsapp/ai/merchantAgent.service.js    texte libre -> boucle modèle / outils, file par numéro
services/whatsapp/ai/agentPrompt.js              consignes, état, historique
services/whatsapp/ai/agentTools.js               définitions + exécution des outils
services/whatsapp/ai/agentOrders.js              commandes vue marchand, résolution des n°
services/whatsapp/ai/pendingActions.service.js   propositions, boutons Confirmer / Annuler
services/whatsapp/ai/clientMessages.service.js   messages boutique -> client, réponse
controllers/whatsapp/shopMessages.controller.js
routes/shopMessageRoutes.js
interface/shopMessageFields.js
utils/validator/validateShopMessage.js
utils/whatsappAiPurgeJob.js
repositories/whatsappMappers.js
repositories/supabase/waConversations.repo.js
repositories/supabase/waAiPendingActions.repo.js
repositories/supabase/waClientMessages.repo.js
schema/migrations/090_whatsapp_ai.sql
```

## À venir

Écran frontend des messages de la boutique (liste + réponse, sockets `shop.message` /
`shop.messageUpdated`, push `ShopMessage`). Notes vocales et images du marchand : pour
l'instant journalisées seulement (`[audio]`), pas traitées par l'agent.
