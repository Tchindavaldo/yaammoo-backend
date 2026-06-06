# Feature — Payments (Paiements MobileWallet)

## Rôle

Intégration avec le backend MobileWallet pour les paiements USSD. Frontend affiche overlay avec numéro de paiement unique, client tape code USSD, backend reçoit webhook de confirmation.

---

## Routes

| Méthode | Endpoint | Contrôleur | Rôle |
|---------|----------|-----------|------|
| POST | `/payment` | `createPayment` | Initie un paiement (MobileWallet) |
| POST | `/payment/webhook` | `paymentWebhook` | Reçoit verdict de paiement (callback MobileWallet) |
| GET | `/payment/:transactionId` | `getPaymentStatus` | Récupère statut d'un paiement |

---

## Structure de données

```typescript
Payment {
  id: string                   // UUID transaction
  userId: string               // Client qui paie
  fastFoodId: string           // Boutique pour laquelle on paie
  orderId: string              // Commande associée
  
  // Montants
  amount: number               // Montant total (XOF, etc.)
  
  // MobileWallet
  paymentNumber: string        // Numéro unique AFFICHÉ au client
                               // Généré par le backend MobileWallet
                               // ≠ de livraison number
  externalTransactionId: string // ID MobileWallet de suivi
  
  // Statuts
  status: 'pending' | 'completed' | 'failed' | 'cancelled'
  paidAt: ISO8601              // Quand le paiement a été reçu
  
  // Métadonnées
  paymentMethod: 'mobilewallet' // Pour futures intégrations
  createdAt: ISO8601
  updatedAt: ISO8601
}
```

---

## Flux paiement

### Phase 1 : Initiation

1. **Frontend** (CheckoutSheet ou CartCheckoutSheet) :
   - Valide stock : `validateStock()`
   - Valide livraison : `validateDelivery()`
   - Crée/met à jour commande : POST `/order` ou PUT `/order/tabs/:userId`
   - Récupère `orderId`

2. **Frontend** → POST `/payment` :
   ```json
   {
     "userId": "uid",
     "fastFoodId": "...",
     "orderId": "order-123",
     "amount": 15000
   }
   ```

3. **Backend** : `createPaymentService()` :
   - Crée doc transaction/payment
   - **Appelle MobileWallet API** : `POST https://api.mobilewallet/create-transaction`
     - Envoie clé API yaammoo + montant + callbackUrl
     - Reçoit `paymentNumber` (ex: "123456") unique
   - Stocke payment avec `paymentNumber`, `externalTransactionId`
   - Return : `{ paymentNumber, externalTransactionId }`

4. **Frontend** :
   - Affiche overlay "En attente de paiement"
   - Affiche `paymentNumber` : "Tapez *123*123456#"
   - Écoute Socket.io pour verdict

### Phase 2 : Client envoie code USSD

- Client tape `*123*123456#` sur son téléphone
- Opérateur route vers MobileWallet

### Phase 3 : Webhook de confirmation

1. **MobileWallet** → POST `/payment/webhook` (callback) :
   ```json
   {
     "transactionId": "external-tx-id",
     "externalId": "...",
     "status": "completed" | "failed",
     "timestamp": "ISO8601"
   }
   ```

2. **Backend** : `paymentWebhookHandler()` :
   - Valide signature du webhook (clé secrète)
   - Récupère payment par `externalTransactionId`
   - Mets à jour statut
   - **Émet Socket.io** : `payment.settled` → rooms `user:${userId}`
   - Met à jour commande : `status: 'completed'` (?) si succès

3. **Frontend** (via Socket.io) :
   - Reçoit `payment.settled` → affiche succès/échec
   - Redirige vers commandes

---

## Points clés

### Numéro de paiement ≠ Numéro de livraison

- **Numéro paiement** : Généré par MobileWallet, affiché au client pour USSD
  - Unique par transaction
  - Ex: `123456`
- **Numéro livraison** : Numéro OM de la boutique, stocké dans fastfood
  - Même pour toutes les commandes
  - Ex: `78976543` (OM du marchand)
- **Numéro livraison du livreur** : Celui qui effectue la livraison (future feature?)

Donc le client voit : "Tapez *123*{paymentNumber}#" où `{paymentNumber}` est unique.

### Clé API MobileWallet

- Configurée en env var du backend yaammoo
- **JAMAIS exposée au frontend**
- Tous les appels `/payment` passent par le backend yaammoo qui proxies vers MobileWallet
- Protégée comme secret `.env` gitignoré

### 2 points d'entrée checkout

1. **CheckoutSheet** (home) : après "Buy" sur un menu individuel
2. **CartCheckoutSheet** (panier) : après "Buy" sur le panier complet

Tous deux appellent POST `/payment` mais avec des données de commande différentes.

---

## Services & Repositories

**paymentService.js**
- `createPayment(data)` — appel MobileWallet + création transaction
- `handlePaymentWebhook(payload)` — update statut + emit socket
- `getPaymentStatus(transactionId)` — récupère statut

**repos.payments** : Implémentés en Firestore/Supabase
- `create(data)`
- `getById(id)`
- `update(id, data)`

---

## Validations

- montant > 0
- userId, fastFoodId, orderId : existants
- paymentMethod : 'mobilewallet' (pour future extensibilité)

---

## Erreurs couantes

- 400 : Montant invalide ou commande non trouvée
- 402 : Appel MobileWallet échoué (serveur indisponible, credentials invalides)
- 404 : Paiement non trouvé
- 401 : Webhook signature invalide

---

## TODO / Améliorations futures

- [ ] Retry logic si MobileWallet timeout
- [ ] Polling côté frontend en fallback du socket
- [ ] PCI compliance audit (clé API + secrets)
- [ ] Test d'intégration MobileWallet sandbox
