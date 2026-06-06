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
MobileWallet webhook → /transaction/webhook/mobilewallet
  ↓
POST /transaction (créé par backend automatiquement)
  ↓
Marchand voit transaction dans PorteFeuillePanel
  ↓
Solde marchand mis à jour (+amount)
```

---

## Erreurs courantes

- 400 : Montant invalide ou user non trouvé
- 404 : Transaction non trouvée
- 409 : Conflit (transaction déjà remboursée, etc.)
