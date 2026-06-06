# Feature — Bonus & Referrals (Système de Récompenses)

## Rôle

Gestion des bonus (réductions, crédits) et parrainage (referral). Client peut utiliser bonus à la commande, marchand peut distribuer bonus.

---

## Routes

| Méthode | Endpoint | Contrôleur | Rôle |
|---------|----------|-----------|------|
| POST | `/bonus` | `createBonus` | Crée un bonus (admin/marchand) |
| GET | `/bonus` | `getAllBonus` | Liste tous les bonus disponibles |
| GET | `/bonus/:id` | `getBonusById` | Récupère détail d'un bonus |
| POST | `/bonus-request` | `createBonusRequest` | Client réclame un bonus |
| GET | `/bonus-request/:userId` | `getUserBonusRequests` | Historique demandes bonus user |
| PUT | `/bonus-request/:id` | `updateBonusRequest` | Admin approuve/rejette demande |

---

## Structure de données

### Bonus

```typescript
Bonus {
  id: string                    // UUID
  code: string                  // Code promo (ex: "SUMMER2025")
  type: 'percentage' | 'fixed' | 'free_delivery'
  
  // Valeur
  value: number                 // Pourcentage (0-100) ou montant (XOF)
  maxDiscount: number           // Remise max si percentage
  minOrderAmount: number        // Commande minimale pour appliquer
  
  // Validité
  validFrom: ISO8601
  validUntil: ISO8601
  maxUses: number               // Nombre total d'utilisations
  usageCount: number            // Utilisations actuelles
  
  // Restrictions
  applicableToMerchants: string[]  // FastFood IDs (vide = tous)
  applicableToUsers: string[]      // User IDs (vide = tous)
  singleUsePerUser: boolean        // Un seul usage par client?
  
  // Métadonnées
  description: string
  createdBy: string             // Admin/marchand qui a créé
  
  createdAt: ISO8601
  updatedAt: ISO8601
}
```

### Bonus Request

```typescript
BonusRequest {
  id: string                    // UUID
  userId: string                // Client qui demande
  bonusId: string               // Référence bonus
  bonusType: string             // 'referral', 'claim', 'earned'
  
  // Statut
  status: 'pending' | 'approved' | 'rejected' | 'used'
  rejectionReason?: string
  
  // Métadonnées
  referrerId?: string           // Si referral, qui a parrainé
  relatedOrderId?: string       // Si bonus lié à commande
  
  createdAt: ISO8601
  updatedAt: ISO8601
  approvedAt?: ISO8601
}
```

---

## Flux clés

### Referral (Parrainage)

1. **User A** partage code referral "USERA123"
2. **User B** s'enregistre avec code → POST `/bonus-request`
   ```json
   {
     "userId": "user-b-uid",
     "bonusType": "referral",
     "referrerId": "user-a-uid"
   }
   ```
3. Backend : crée BonusRequest, statut `pending`
4. Admin approuve : PUT `/bonus-request/:id` → `status: approved`
5. Systèm crée bonus pour User A ET User B
6. Client utilise bonus : déduit de commande au checkout

### Bonus promotion globale

1. Admin crée bonus : POST `/bonus`
   ```json
   {
     "code": "SUMMER2025",
     "type": "percentage",
     "value": 10,
     "validFrom": "2025-06-01",
     "validUntil": "2025-06-30"
   }
   ```
2. Bonus visible à tous : GET `/bonus`
3. Client panier : rentre code à checkout
4. Frontend valide code → calcule remise
5. POST `/order` avec `appliedBonusId`

---

## Services & Repositories

**bonusService.js**
- `createBonus(data)` — crée bonus admin
- `getAllBonus()` — liste disponibles
- `getBonusById(id)` — détail
- `validateBonus(bonusId, userId, orderAmount)` — vérifie applicabilité
- `applyBonus(bonusId, orderAmount)` — calcule remise

**bonusRequestService.js**
- `createBonusRequest(data)` — client réclame bonus
- `getUserBonusRequests(userId)` — historique
- `approveBonusRequest(id)` — admin approuve
- `rejectBonusRequest(id, reason)` — admin rejette

**repos.bonus** & **repos.bonusRequests** : Firestore/Supabase

---

## Validations

**Bonus**
- code : non-vide, unique
- value : > 0
- validFrom < validUntil
- maxUses >= usageCount

**BonusRequest**
- userId : existant
- bonusId : existant
- bonusType : enum valide

---

## Checkout integration

À l'étape checkout :

```typescript
// Frontend : client rentre code bonus
const bonus = await getBonus(codeEntered);
const discount = await validateBonus(bonus.id, userId, totalAmount);

// Backend calcule discount
if (bonus.type === 'percentage') {
  discount = (totalAmount * bonus.value) / 100;
  discount = Math.min(discount, bonus.maxDiscount);
}

// Crée commande avec appliedBonusId
const order = await createOrder({
  ...orderData,
  appliedBonusId: bonus.id,
  originalTotal,
  discount,
  totalAfterDiscount: originalTotal - discount
});
```

---

## Erreurs courantes

- 400 : Code bonus invalide ou expiré
- 409 : Bonus déjà utilisé (singleUsePerUser)
- 404 : Bonus non trouvé
- 403 : Bonus non applicable (montant min, marchand, etc.)
