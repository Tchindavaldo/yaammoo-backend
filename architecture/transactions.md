# Feature — Transactions (Historique Paiements & Portefeuille)

## Rôle

Suivi des transactions financières : paiements, remboursements, transferts. Marchand consulte son portefeuille et historique.

---

## Routes

| Méthode | Endpoint | Contrôleur | Rôle |
|---------|----------|-----------|------|
| POST | `/transaction` | `createTransaction` | Crée une transaction (paiement reçu) |
| GET | `/transaction/:userId` | `getTransactions` | Récupère historique user/marchand |
| PUT | `/transaction/:id` | `updateTransaction` | Met à jour statut transaction |
| POST | `/transaction/webhook/mobilewallet` | `webhookMobilewallet` | Reçoit verdict paiement MobileWallet |

---

## Structure de données

```typescript
Transaction {
  id: string                   // UUID
  userId: string               // User qui a payé OU marchand qui reçoit
  type: 'payment' | 'refund' | 'transfer' | 'payout'
  
  // Montants
  amount: number               // Montant (XOF, etc.)
  currentAmount: number        // Solde après transaction (portefeuille marchand)
  remainingAmount: number      // Montant restant à verser (si payout partialisé)
  
  // Métadonnées
  payBy: string                // Méthode : 'mobilewallet', 'card', etc.
  name: string                 // Description (ex: "Paiement commande #123")
  
  // Statuts
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  
  // Tracabilité
  relatedPaymentId?: string    // Référence au payment/order
  relatedOrderId?: string      // Référence commande
  
  createdAt: ISO8601
  updatedAt: ISO8601
}
```

---

## Flux clés

### Paiement client → Marchand

1. Client paie via checkout : POST `/payment`
2. Backend reçoit verdict MobileWallet (webhook)
3. **Crée transaction** : POST `/transaction`
   ```json
   {
     "userId": "marchand-uid",
     "type": "payment",
     "amount": 15000,
     "payBy": "mobilewallet",
     "name": "Paiement commande #order-123",
     "relatedOrderId": "order-123"
   }
   ```
4. Service `postTransactionService()` :
   - Crée doc transaction
   - Mets à jour `currentAmount` du marchand (balance portefeuille)
   - Optionnellement, émet socket `transaction.created`

### Consultation portefeuille

1. Marchand (PorteFeuillePanel) : GET `/transaction/:userId`
2. Backend : retourne tous les transactions du marchand, triées par date DESC
3. Frontend : affiche liste + balance actuelle

### Remboursement

1. Marchand ou admin : PUT `/transaction/:id` avec `status: 'refunded'`
2. Backend :
   - Crée nouvelle transaction inverse (`type: 'refund'`)
   - Mets à jour balance marchand (-amount)
   - Notifie client (socket ou email)

---

## Services & Repositories

**postTransactionService.js**
- `createTransaction(data)` — crée transaction + appelle MobileWallet si `payBy === 'mobilemoney'`
- `getMwTransactionMap()` — mappe `mw_transaction_id` → `userId` pour webhook

**mobilewalletService.js**
- `pay({ amount, phone, network, email, mode })` — appelle POST /pay sur MobileWallet

**webhookMobilewalletService.js**
- `webhookMobilewalletService(payload)` — traite verdict + émet socket

**mobilewalletSocketClient.js**
- `initMobileWalletSocket()` — connexion Socket.io vers MobileWallet
- Écoute `transaction.update` → appelle webhookMobilewalletService

**repos.transactions** : Implémentés Firestore/Supabase
- `create(data)`
- `getById(id)`
- `getByUserId(userId)`
- `update(id, data)`
- `reserveSettlement(tx_id, source, status)` — atomique idempotence

---

## Validations

- montant > 0
- userId : existant
- type : enum valide
- payBy : 'mobilewallet', 'card', etc.

---

## Workflow complet

```
Client paie (commande)
  ↓
POST /transaction (frontend → backend)
  ↓
Backend appelle MobileWallet /pay
  ↓
  ├─→ Réponse immédiate: status=ussd_sent, transaction_id
  │   (Frontend reçoit et affiche code USSD)
  │
  └─→ MobileWallet envoie verdict via 2 CANAUX EN PARALLÈLE:
      
      CANAL 1: Socket.IO (push temps réel)
      ────────────────────────────────────
      • Backend = client Socket.io (connecté à MobileWallet)
      • Écoute événement 'transaction.update' sur room app:{app_id}
      • Payload:
        {
          "type": "transaction.successful",
          "data": {
            "transaction_id": "...",
            "status": "successful|failed|cancelled",
            "end_user_ref": "user_id",
            "amount": 10000,
            ...
          }
        }
      
      CANAL 2: Webhook HTTP (callback signé)
      ───────────────────────────────────────
      • POST /transaction/webhook/mobilewallet
      • Header: X-MobileWallet-Signature: t=<ts>,v1=<hmac>
      • Payload: {type, data} (même format Socket.io)
      
      Les deux arrivent asynchronement (ordre aléatoire!)
      ↓
      IDEMPOTENCE GARANTIE:
      - Réservation atomique dans BD (transactionSettlements)
      - Un seul chemin (Socket.IO OU Webhook HTTP) traite le verdict
      - L'autre voit "déjà traité" (UNIQUE constraint) et s'abstient
      ↓
webhookMobilewalletService() — Traitement du verdict (idempotent)
  ↓
Émet Socket "payment.settled" au client (room user:{userId})
  ↓
Frontend redirige vers /orders, affiche succès/échec
```

---

## Backend comme Client Socket.io (MobileWallet)

**Fichier:** `src/services/transaction/mobilewalletSocketClient.js`

Le backend yaammoo se connecte **en tant que client** à MobileWallet via Socket.io pour recevoir les verdicts de paiement en temps réel.

### Flux de connexion

1. **Initialisation** (`server.js` au démarrage)
   - `initMobileWalletSocket()` crée une connexion Socket.io
   - Auth : header `auth: { token: MOBILEWALLET_API_KEY }`
   - Target : `MOBILEWALLET_SOCKET_URL` (env var)

2. **Authentification**
   - MobileWallet valide la clé API
   - Si valide : backend entre dans les rooms :
     - `app:{APP_ID}` → reçoit les transactions de l'app
     - `dev:{developer_id}` → reçoit les événements du compte

3. **Écoute d'événements**
   - Écoute `transaction.update` sur la room `app:{APP_ID}`
   - Format payload : voir section "Workflow complet" ci-dessus

### Reconnexion automatique

- En cas de déconnexion : reconnexion auto avec délai exponential
- Reconnexion infinie (jamais d'abandon)
- Logs détaillés : `[MobileWallet Socket]` dans les traces

### Variables d'env requises

```env
MOBILEWALLET_SOCKET_URL=http://localhost:7332  # URL Socket.io du serveur MobileWallet
MOBILEWALLET_API_KEY=sk_...                    # Clé API pour authentification
APP_ID=app_xyz123                              # ID de l'app (reçu de MobileWallet)
```

---

## Idempotence: Socket + Webhook

**Problème:** MobileWallet peut envoyer le verdict par 2 canaux différents:
- **Socket.IO** : push temps réel (si WebSocket ouvert)
- **Webhook HTTP** : callback signé (fallback fiable)

Ces signaux peuvent arriver dans n'importe quel ordre, même en parallèle!

**Solution:** Table `transactionSettlements` garantit atomicité:

```javascript
// Avant de traiter un verdict :
const reserved = await repos.transactions.reserveSettlement(
  transaction_id,
  'webhook',  // ou 'socket'
  status
);

if (!reserved) {
  // L'autre chemin a déjà traité → skip
  return;
}

// Traiter le verdict (une seule fois garanti)
io.to(`user:${userId}`).emit('payment.settled', { status, transaction_id });
```

**Flux de réservation (atomique):**
1. Webhook arrive → essaie INSERT dans `transactionSettlements`
2. Si succès (INSERT réussit) → c'est le premier, traite le verdict
3. Si échec (UNIQUE constraint) → Socket a déjà traité, abandon
4. Socket arrive → même logique (ne traite que s'INSERT réussit)

---

## Logs détaillés

### Initiation du paiement

```
[Transaction] userId=user-123 → Création transaction: payBy=mobilemoney, amount=15000
[Transaction] userId=user-123 → Appel MobileWallet /pay: amount=15000, network=Orangemoney, phone=674123456
[MobileWallet API] Orangemoney amount=15000 → POST http://localhost:7332/pay (timeout=30s, userId=user-123, phone=674123456)
[MobileWallet API] Orangemoney amount=15000 ✓ HTTP 200 reçu en 1234ms: status=ussd_sent, tx_id=mw-tx-999
[Transaction] userId=user-123 ✓ MobileWallet status=ussd_sent, transaction_id=mw-tx-999
```

### Réception du verdict via Socket.io (CANAL 1 — plus rapide généralement)

```
[MobileWallet Socket] transaction.update → Événement reçu: type=transaction.successful, tx_id=mw-tx-999, status=successful
[MobileWallet Socket] → Appel webhookMobilewalletService...
[Webhook MobileWallet] tx=mw-tx-999 → Verdict reçu: status=successful, amount=15000
[Webhook MobileWallet] tx=mw-tx-999 userId=user-123
[Webhook MobileWallet] tx=mw-tx-999 Tentative réservation du verdict en BD...
[Webhook MobileWallet] tx=mw-tx-999 ✓ Réservation réussie (socket = premier chemin)
[Webhook MobileWallet] tx=mw-tx-999 → Émission socket payment.settled vers user:user-123
[Webhook MobileWallet] tx=mw-tx-999 ✓ Socket émis
[Webhook MobileWallet] tx=mw-tx-999 ✓ Webhook traité avec succès
[MobileWallet Socket] ✓ Événement traité
```

### OU Réception du verdict via Webhook HTTP (CANAL 2 — fallback fiable)

```
[Webhook Controller] → Webhook reçu de MobileWallet
[Webhook Controller] ✓ Signature HMAC valide
[Webhook Controller] Payload: type=transaction.successful, tx_id=mw-tx-999, status=successful
[Webhook MobileWallet] tx=mw-tx-999 → Verdict reçu: status=successful, amount=15000
[Webhook MobileWallet] tx=mw-tx-999 userId=user-123
[Webhook MobileWallet] tx=mw-tx-999 Tentative réservation du verdict en BD...
[Webhook MobileWallet] tx=mw-tx-999 ✓ Réservation réussie (webhook = premier chemin)
[Webhook MobileWallet] tx=mw-tx-999 → Émission socket payment.settled vers user:user-123
[Webhook MobileWallet] tx=mw-tx-999 ✓ Socket émis
[Webhook MobileWallet] tx=mw-tx-999 ✓ Webhook traité avec succès
```

### Cas: Webhook arrive après Socket (idempotence en action)

```
[Webhook Controller] → Webhook reçu de MobileWallet
[Webhook Controller] ✓ Signature HMAC valide
[Webhook MobileWallet] tx=mw-tx-999 Tentative réservation du verdict en BD...
[Webhook MobileWallet] tx=mw-tx-999 ✓ Verdict déjà traité par socket (ou un autre webhook) → skip
```

---

## Erreurs courantes

- 400 : Montant invalide ou user non trouvé
- 404 : Transaction non trouvée
- 409 : Conflit (transaction déjà remboursée, etc.)
- ❌ Webhook signature invalide : vérifier `MOBILEWALLET_WEBHOOK_SECRET`
- ⚠️ Verdict traité deux fois : idempotence garantie par `transactionSettlements`
