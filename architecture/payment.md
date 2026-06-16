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
  "orderId": "order-456",
  "fastFoodId": "shop-789",
  "items": [ ... ]
}
```

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
3. Si `payBy === 'mobilemoney'` → branche MobileWallet (sinon chemin transaction classique
   : `repos.transactions.create` + socket `newTransaction`).
4. `mobilewalletService.pay()` :
   - construit `callback_url = ${BACKEND_URL}/transaction/webhook/mobilewallet`
   - `POST {MOBILEWALLET_URL}/pay` avec header `Authorization: Bearer MOBILEWALLET_YAAMMOO_KEY`
   - payload : `amount, phone, network, email, mode, end_user_ref=userId, callback_url`
   - gère erreurs : **409** (doublon, `retry_after_s`), **503** (opérateur/réseau indispo), autres.
5. Sur succès, le service **persiste le contexte en BD Supabase** via
   `repos.pendingPayments.save(mw_transaction_id, { userId, orderId, fastFoodId, items, amount, ... })`
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
4. Si `status === 'successful'` → **confirme la commande via `createOrderService`**
   (service existant, qui gère stock check + rank + transaction + notif marchand). On passe
   `orderCtx` si fourni, sinon `{ id: orderId, userId, fastFoodId, items }`.
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
                                      │  (persiste pending_payments)
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
                 → si successful: createOrderService (confirme la commande)
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
- Migration : `schema/migrations/002_pending_payments.sql`.

### Clé API MobileWallet
- `MOBILEWALLET_YAAMMOO_KEY` (env var), **jamais exposée au frontend**.
- Utilisée à la fois pour `Authorization: Bearer` (HTTP `/pay`) et `auth.token` (socket client).
- `MOBILEWALLET_URL` et `BACKEND_URL` sont aussi en env var.

### payment_number ≠ numéro de livraison
- **payment_number** : généré par MobileWallet, unique par transaction, affiché au client pour l'USSD.
- **Numéro livraison** : numéro OM de la boutique (stocké dans fastfood), identique pour toutes les commandes.

---

## Services & fichiers

- **`postTransaction.service.js`** — `postTransactionService(data)` (validation + proxy `/pay` +
  persistance contexte via `repos.pendingPayments.save`).
- **`repos.pendingPayments`** (`supabase/pendingPayments.repo.js`) — `save`, `getById`,
  `getLatestByUser`, `markSettled`.
- **`mobilewalletService.js`** — `pay({ amount, phone, network, email, mode, userId })` :
  appel HTTP `/pay`, gestion 409/503, construction `callback_url`.
- **`webhookMobilewallet.service.js`** — `webhookMobilewalletService(payload, source)` :
  traitement commun des deux canaux, idempotence, émission `payment.settled`, (TODO) commande.
- **`webhookMobilewallet.controller.js`** — endpoint webhook HTTP (retourne toujours 200).
- **`mobilewalletSocketClient.js`** — client Socket.io vers MobileWallet (`transaction.update`),
  reconnexion auto ; `initMobileWalletSocket()` / `closeMobileWalletSocket()`.
- **`repos.transactions`** — `create()`, `reserveSettlement(transactionId, source, status)` (atomique).

---

## Validations

- montant > 0 ; `userId`, `phone`, `network` requis pour `payBy=mobilemoney`.
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

- [x] **Création de commande** branchée sur paiement réussi via `createOrderService`
      (`webhookMobilewallet.service.js`).
- [x] **Contexte de paiement persisté** en BD Supabase (`pending_payments`), fin de la Map mémoire.

## TODO / Améliorations futures

- [ ] Vérification de signature sur le webhook entrant.
- [ ] Retry logic si MobileWallet timeout côté `/pay`.
- [ ] Purge périodique des `pending_payments` réglés/anciens (cron).
