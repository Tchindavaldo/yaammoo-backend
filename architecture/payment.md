# Feature — Payments (Paiements MobileWallet)

## Rôle

Intégration avec le backend **MobileWallet** pour les paiements Mobile Money (USSD).
Le frontend appelle `POST /transaction` ; le backend yaammoo **proxie** vers MobileWallet
`POST /pay`, puis attend le verdict du paiement.

> ⚠️ **Point central** : MobileWallet renvoie le verdict d'un paiement par **DEUX canaux
> en parallèle** :
> 1. un **webhook HTTP** (`callback_url` → `POST /transaction/webhook/mobilewallet`)
> 2. un **événement Socket.io** (`transaction.update`, le backend est *client socket* de MobileWallet)
>
> Le backend yaammoo **reçoit et traite les deux**. Les deux convergent vers le même service
> (`webhookMobilewalletService`), qui garantit l'**idempotence** via `reserveSettlement` :
> le premier canal arrivé traite le verdict, le second est détecté comme doublon et ignoré.

---

## Routes

| Méthode | Endpoint | Contrôleur | Rôle |
|---------|----------|-----------|------|
| POST | `/transaction` | `postTransactionController` | Initie une transaction (proxy MobileWallet `/pay` si `payBy=mobilemoney`) |
| POST | `/transaction/webhook/mobilewallet` | `webhookMobilewalletController` | Reçoit le verdict via **webhook HTTP** (callback MobileWallet) |
| GET | `/transaction/:userId` | `getTransactions` | Récupère les transactions d'un user (fallback polling frontend) |

> Le backend est aussi **client Socket.io** de MobileWallet (pas une route) — voir
> `mobilewalletSocketClient.js`, événement `transaction.update`.

---

## Requête frontend → `POST /transaction`

```json
{
  "userId": "user-123",
  "amount": 25000,
  "payBy": "mobilemoney",
  "phone": "677087298",
  "network": "MTN",
  "email": "user@example.com",
  "items": [
    { "fastFoodId": "shop-789", "menu": { "id": "m1", "name": "..." }, "quantity": 2, "total": 12000, "delivery": {}, "status": "pending" },
    { "fastFoodId": "shop-999", "menu": { "id": "m9", "name": "..." }, "quantity": 1, "total": 13000, "delivery": {}, "status": "pending" }
  ]
}
```

> ⚠️ **`items` = tableau de commandes COMPLÈTES** (forme produite par `createOrder()` côté
> frontend), **chacune portant son propre `fastFoodId`**. Au verdict réussi, le backend crée
> **une commande par item** via `createOrderService` :
> - **cas individuel** (`/home`) : un seul item ;
> - **cas panier global** : plusieurs items, potentiellement de fastfoods différents.
>
> Il n'y a **pas** de `fastFoodId` ni `orderId` au niveau racine (ils vivent dans chaque item),
> et l'ancien champ `orderCtx` a été supprimé.

Réponse (200) si initiation OK :

```json
{
  "success": true,
  "status": "ussd_sent",
  "message": "...",
  "mw_transaction_id": "mock_141_1780858395257",
  "payment_number": "123456"
}
```

> ⚠️ MobileWallet renvoie `success=false` même quand l'init est OK. Le backend **ignore le
> flag `success`** et se base sur `status` / `code` (`ussd_sent` = OK ; `error`/`failed` = KO).

---

## Flux complet

### Phase 1 — Initiation

1. **Frontend** → `POST /transaction`
   → `postTransactionController` → `postTransactionService`.
2. **Validation** : `validateTransactionCreation(data)` ; si erreurs → `{ success:false }` (400).
   Pour `mobilemoney`, `phone`/`network`/`items` sont requis et chaque item doit porter un
   `fastFoodId` (voir § Validations).
   Le status HTTP de la réponse suit `response.httpStatus` (400 validation, 409 doublon/stock,
   503 indispo, 502 autre MobileWallet, 500 exception) — plus de 400 forcé.
2bis. **Pré-check stock (avant `/pay`)** : on somme les quantités par `menu.id` (gère le même
   plat en double + restos différents) et on compare au stock brut (`repos.menus.getRawStock`).
   `stock === null` → menu illimité → OK. Si insuffisant → **HTTP 409** `code:'insufficient_stock'`
   **sans débiter** le client. Le check atomique au verdict (create/update) reste le garde-fou final.
3. Si `payBy === 'mobilemoney'` → branche MobileWallet (sinon chemin transaction classique
   : `repos.transactions.create` + socket `newTransaction`).
4. `mobilewalletService.pay()` :
   - construit `callback_url = ${BACKEND_URL}/transaction/webhook/mobilewallet`
   - `POST {MOBILEWALLET_URL}/pay` avec header `Authorization: Bearer MOBILEWALLET_YAAMMOO_KEY`
   - payload : `amount, phone, network, email, mode, end_user_ref=userId, callback_url`
   - gère erreurs : **409** (doublon, `retry_after_s`), **503** (opérateur/réseau indispo), autres.
5. Sur succès, le service **persiste le contexte en BD Supabase** via
   `repos.pendingPayments.save(mw_transaction_id, { userId, items, amount, ... })`
   (`items` = tableau de commandes complètes)
   (table `pending_payments`). Sert à retrouver le contexte de commande quand le verdict arrivera.
   ⚠️ C'est en BD (plus en mémoire) → survit aux redémarrages et au multi-instance.
6. Renvoie `{ success:true, status:'ussd_sent', mw_transaction_id, payment_number }`.
   → Frontend affiche "En attente de paiement" et écoute le socket.

### Phase 2 — Client tape le code USSD

Le client valide `*123*{payment_number}#` sur son téléphone. L'opérateur route vers MobileWallet.

### Phase 3 — Verdict (DOUBLE CANAL, traité par le backend)

MobileWallet émet le verdict via **les deux canaux en parallèle** :

**Canal A — Webhook HTTP**
`POST /transaction/webhook/mobilewallet` → `webhookMobilewalletController` :
- parse le payload, appelle `webhookMobilewalletService(payload, 'webhook')`
- **retourne toujours 200** (même en erreur) pour éviter les retries en boucle.

**Canal B — Socket.io entrant**
`mobilewalletSocketClient.js` (connecté à MobileWallet via `auth.token = MOBILEWALLET_YAAMMOO_KEY`,
reconnexion auto) écoute `transaction.update`, normalise le payload, puis appelle
`webhookMobilewalletService(payload, 'socket')`.

**Traitement commun — `webhookMobilewalletService(payload, source)`**
1. Retrouve le contexte via `repos.pendingPayments.getById(transaction_id)`, fallback
   `getLatestByUser(end_user_ref)` (MobileWallet peut renvoyer un tx_id différent).
2. **Idempotence** : `repos.transactions.reserveSettlement(transaction_id, source, status)`
   réserve atomiquement le verdict (contrainte UNIQUE en BD). Le **1er canal** arrivé réserve
   et continue ; le **2e** échoue la réservation → `skip` (log "déjà traité par webhook/socket").
3. Émet vers le frontend le socket `payment.settled` sur la room `userId`
   (SANS préfixe — c'est la room que le frontend rejoint via `join_user`,
   cf. `socket.js`) `{ status, transaction_id, amount, source }`.
4. Si `status === 'successful'` → **routage par item** (réutilise les services commande
   existants, antérieurs au module paiement) :
   - item **avec `id`** = commande déjà en base (panier `pendingToBuy`) → **`updateOrders`**
     (transition `pendingToBuy → pending` : stock check + rank + notif marchand). Le tableau
     est groupé par fastfood → gère le panier multi-fastfood.
   - item **sans `id`** = commande nouvelle (achat direct) → **`createOrderService`** (INSERT).
   **Échec partiel toléré** : on traite tout ce qui peut l'être, les échecs sont loggués (pas
   de rollback ; le client a payé le total).
   > ⚠️ `createOrderService` fait toujours un INSERT → l'utiliser sur une commande déjà en base
   > (panier) lève `duplicate key ... orders_pkey`. D'où le routage sur la présence d'`id`.
5. `repos.pendingPayments.markSettled(...)` pour l'audit/purge.

> ✅ Comme **webhook et socket appellent le même service**, la confirmation de commande
> fonctionne identiquement quel que soit le canal qui arrive en premier, sans double création
> (garantie par `reserveSettlement`).

### Phase 4 — Frontend reçoit le verdict

```js
socket.on('payment.settled', (data) => {
  if (data.status === 'successful') navigate('/orders');
  else showError('Paiement échoué');
});
```
Fallback : si aucun événement après ~2 min → polling `GET /transaction/{userId}`.

---

## Schéma (résumé)

```
Frontend ──POST /transaction──► Backend yaammoo ──POST /pay──► MobileWallet
                                      │  (pré-check stock, puis persiste pending_payments)
                                      ▼
                          (attend le verdict)
                                      ▲
              ┌───────────────────────┴───────────────────────┐
   Canal A    │  webhook HTTP                  Canal B  socket │
 POST /transaction/webhook/mobilewallet     transaction.update │
              └───────────────┬───────────────────────────────┘
                              ▼
              webhookMobilewalletService(payload, source)
                 → reserveSettlement (idempotence : 1 seul traite)
                 → emit 'payment.settled' vers user:${userId}
                 → si successful, par item : id → updateOrders (pendingToBuy→pending)
                                             sinon → createOrderService (nouvelle commande)
```

---

## Points clés

### MobileWallet notifie via webhook ET socket
- Les deux peuvent arriver dans n'importe quel ordre (ou un seul si l'autre est indispo).
- Le backend gère **les deux réponses reçues de MobileWallet** ; `reserveSettlement` garantit
  qu'**un seul** déclenche l'émission `payment.settled` et la confirmation de commande.
- Le paramètre `source` (`'webhook'` / `'socket'`) sert au logging/debug.

### Contexte de paiement persisté en BD
- Table Supabase `pending_payments` (`repos.pendingPayments`) — remplace l'ancienne Map en mémoire.
- Survit aux redémarrages et fonctionne en multi-instance.
- Migrations : `002_pending_payments.sql` (création), `003_drop_unused_pending_columns.sql`
  (retrait des colonnes `order_id`/`fastfood_id`/`order_ctx`, désormais inutilisées : le
  contexte vit dans `items`).

### Clé API MobileWallet
- `MOBILEWALLET_YAAMMOO_KEY` (env var), **jamais exposée au frontend**.
- Utilisée à la fois pour `Authorization: Bearer` (HTTP `/pay`) et `auth.token` (socket client).
- `MOBILEWALLET_URL` et `BACKEND_URL` sont aussi en env var.

### payment_number ≠ numéro de livraison
- **payment_number** : généré par MobileWallet, unique par transaction, affiché au client pour l'USSD.
- **Numéro livraison** : numéro OM de la boutique (stocké dans fastfood), identique pour toutes les commandes.

### Format numéro de téléphone — `/pay` vs `/payout`
- **`/pay` (paiement entrant)** : le `phone` est passé tel quel depuis le frontend. MobileWallet gère le format côté USSD — **aucune normalisation backend**.
- **`/payout` (retrait sortant)** : MobileWallet attend **obligatoirement** le format `237XXXXXXXXX` (indicatif Cameroun sans `+`). Le backend normalise automatiquement dans `mobilewalletService.payout()` : strip tout préfixe (`+237`, `00237`) puis préfixe `237`. Le frontend peut donc envoyer `677087298`, `+237677087298` ou `00237677087298` — le résultat sera toujours `237677087298`.

---

## Services & fichiers

- **`postTransaction.service.js`** — `postTransactionService(data)` (validation + **pré-check
  stock** via `repos.menus.getRawStock` + proxy `/pay` + persistance contexte via
  `repos.pendingPayments.save`).
- **`repos.menus`** (`supabase/menus.repo.js`) — `getRawStock(id)` : stock brut (null = illimité)
  pour le pré-check.
- **`repos.pendingPayments`** (`supabase/pendingPayments.repo.js`) — `save`, `getById`,
  `getLatestByUser`, `markSettled`.
- **`mobilewalletService.js`** — `pay({ amount, phone, network, email, mode, userId })` :
  appel HTTP `/pay`, gestion 409/503 (payload imbriqué sous `detail`), construction `callback_url`.
- **`webhookMobilewallet.service.js`** — `webhookMobilewalletService(payload, source)` :
  traitement commun des deux canaux, idempotence, émission `payment.settled`, puis **routage par
  item** : item avec `id` → `updateOrders` (transition `pendingToBuy → pending`) ; item sans `id`
  → `createOrderService` (nouvelle commande). Échec partiel toléré.
- **`webhookMobilewallet.controller.js`** — endpoint webhook HTTP (retourne toujours 200).
- **`mobilewalletSocketClient.js`** — client Socket.io vers MobileWallet (`transaction.update`),
  reconnexion auto ; `initMobileWalletSocket()` / `closeMobileWalletSocket()`.
- **`repos.transactions`** — `create()`, `reserveSettlement(transactionId, source, status)` (atomique).

---

## Validations

- Toujours requis : `userId`, `amount`, `payBy`.
- **Validation conditionnelle `payBy === 'mobilemoney'`** : `phone`, `network`, `items` (non vide)
  sont **obligatoires**, et **chaque item doit porter un `fastFoodId`**. Sinon → **HTTP 400** avant
  tout appel MobileWallet.
  > ⚠️ Raison : sans `items` (commandes complètes), un paiement peut réussir sans qu'aucune
  > commande soit créée → **paiement orphelin**. La validation bloque ce cas à la source.
- Voir `src/utils/validator/validateTransactionCreation.js`.

---

## Erreurs courantes (depuis MobileWallet `/pay`)

> ⚠️ MobileWallet (FastAPI) **imbrique** la charge d'erreur sous la clé `detail` :
> `{ "detail": { "error": "retry_too_soon", "message": "...", "retry_after_s": 789, "last_status": "cancelled" } }`.
> `mobilewalletService.pay()` normalise via `const detail = data?.detail || data` (anti-corruption
> layer) puis propage `code`, `message`, `retry_after_s`, `last_status` au frontend.

- **409** : doublon (`pending_exists`, `retry_too_soon`) → renvoie `code`, `message`,
  `retry_after_s`, `last_status`. Le backend répond **HTTP 409** (plus 400).
- **503** : opérateur/réseau indisponible → backend répond **HTTP 503**.
- Autres → `code: server_error`, backend répond **HTTP 502**.

Le **status HTTP** indique la catégorie ; le **body** (`code`/`message`/`retry_after_s`) est la
source de vérité que le frontend lit explicitement (ex. `if (code === 'retry_too_soon')` →
afficher un compte à rebours basé sur `retry_after_s`).

Réponse type renvoyée au frontend pour un `retry_too_soon` (HTTP 409) :

```json
{
  "success": false,
  "status": "error",
  "code": "retry_too_soon",
  "message": "Une transaction récente sur le numéro 696080087 n'a pas abouti (annulée). Réessayez dans 13 min 9 s.",
  "retry_after_s": 789,
  "last_status": "cancelled"
}
```

---

## Fait récemment

- [x] **Confirmation de commande** au verdict : `items` (tableau de commandes complètes), routage
      par item — `id` → `updateOrders` (panier `pendingToBuy → pending`), sinon `createOrderService`
      (achat direct). Gère le panier multi-fastfood. Échec partiel toléré.
- [x] **Pré-check stock avant `/pay`** (somme par `menu.id`, stock null = illimité) → 409
      `insufficient_stock` sans débiter le client.
- [x] **Erreur MobileWallet** : lecture du payload imbriqué `detail`, propagation
      `code`/`message`/`retry_after_s`/`last_status` + status HTTP réel (409/503/502).
- [x] **Contexte de paiement persisté** en BD Supabase (`pending_payments`), fin de la Map mémoire.

## TODO / Améliorations futures

- [ ] Vérification de signature sur le webhook entrant.
- [ ] Retry logic si MobileWallet timeout côté `/pay`.
- [ ] Purge périodique des `pending_payments` réglés/anciens (cron).
- [ ] **Échec commande APRÈS paiement réussi** (stock vidé entre pré-check et verdict, ou erreur
      DB) : aujourd'hui seulement loggué, le client a payé sans commande. À durcir (alerte /
      remboursement / marquage à retraiter).
- [ ] **Replay/retry même `transaction_id`** : `reserveSettlement` skiperait en croyant « déjà
      traité » même si aucune commande n'a été créée. Vérifier le statut réel avant skip.
- [ ] Aligner la sémantique « stock null = illimité » entre `updateOrders` (via `getById`,
      null→0) et `create_order_with_stock_check` (SQL, null = illimité).
