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

**postTransactionService.js** (ou `transactionService.js`)
- `createTransaction(data)` — crée + met à jour balance
- `getTransactions(userId)` — historique user
- `updateTransaction(id, updates)` — change statut
- `calculateBalance(userId)` — solde actuel

**repos.transactions** : Implémentés Firestore/Supabase
- `create(data)`
- `getById(id)`
- `getByUserId(userId)`
- `update(id, data)`

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
  └─→ MobileWallet envoie verdict via 2 CANAUX:
      1. Socket.IO (push temps réel)
      2. Webhook HTTP (callback signé)
      
      Les deux arrivent asynchronement (ordre aléatoire!)
      ↓
      IDEMPOTENCE GARANTIE:
      - Réservation atomique dans BD (transactionSettlements)
      - Un seul chemin (socket OU webhook) traite le verdict
      - L'autre voit "déjà traité" et s'abstient
      ↓
POST /transaction/webhook/mobilewallet (ou Socket.IO)
  ↓
Service valide signature HMAC, réserve verdict
  ↓
Émet Socket "payment.settled" au client
  ↓
Frontend redirige vers /orders, affiche succès/échec
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

Chaque appel MobileWallet est loggé:

```
[Transaction] userId=user-123 → Création transaction: payBy=mobilemoney, amount=15000
[Transaction] userId=user-123 → Appel MobileWallet /pay: amount=15000, network=Orangemoney, phone=674123456
[MobileWallet API] Orangemoney amount=15000 → POST http://localhost:7332/pay (timeout=30s, userId=user-123, phone=674123456)
[MobileWallet API] Orangemoney amount=15000 ✓ HTTP 200 reçu en 1234ms: status=ussd_sent, tx_id=mw-tx-999
[Transaction] userId=user-123 ✓ MobileWallet status=ussd_sent, transaction_id=mw-tx-999

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

---

## Erreurs courantes

- 400 : Montant invalide ou user non trouvé
- 404 : Transaction non trouvée
- 409 : Conflit (transaction déjà remboursée, etc.)
- ❌ Webhook signature invalide : vérifier `MOBILEWALLET_WEBHOOK_SECRET`
- ⚠️ Verdict traité deux fois : idempotence garantie par `transactionSettlements`
