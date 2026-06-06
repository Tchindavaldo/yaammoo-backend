# Feature — Deliveries (Suivi Livraison)

## Rôle

Suivi des livraisons : assignation livreur, tracking progression, notifications client/marchand.

---

## Routes

| Méthode | Endpoint | Contrôleur | Rôle |
|---------|----------|-----------|------|
| POST | `/delivery` | `createDelivery` | Crée livraison (commande → livreur) |
| GET | `/delivery/:orderId` | `getDeliveryByOrder` | Récupère statut livraison |
| PUT | `/delivery/:id/status` | `updateDeliveryStatus` | Livreur met à jour progression |
| PUT | `/delivery/:id/location` | `updateDeliveryLocation` | Livreur envoie localisation GPS |
| GET | `/delivery/livreur/:livreurId` | `getLivreurDeliveries` | Livraisons assignées à livreur |

---

## Structure de données

```typescript
Delivery {
  id: string                     // UUID
  orderId: string                // Référence commande
  fastFoodId: string             // Boutique qui livre
  userId: string                 // Client qui reçoit
  
  // Livreur
  livreurId: string              // UID du livreur assigné
  livreurPhone: string           // Contact livreur
  livreurName: string            // Nom livreur
  
  // Adresse livraison
  deliveryAddress: string        // Adresse complète client
  deliveryLat: number            // Latitude
  deliveryLng: number            // Longitude
  
  // Localisation en temps réel
  currentLat: number             // Position actuelle livreur
  currentLng: number             // Position actuelle livreur
  lastLocationUpdate: ISO8601
  
  // Progression
  status: 'pending' | 'assigned' | 'picked_up' | 'on_the_way' | 'arrived' | 'delivered' | 'failed'
  statusHistory: {
    status: string
    timestamp: ISO8601
    notes: string
  }[]
  
  // Timing
  estimatedDeliveryTime: number  // Minutes avant arrivée
  actualDeliveryTime?: ISO8601
  
  // Métadonnées
  notes: string                  // Notes spéciales (ex: "Interphone cassé")
  
  createdAt: ISO8601
  updatedAt: ISO8601
}
```

---

## Flux clés

### Création livraison (automatique)

1. Commande confirmée + payée
2. Backend (order service) : crée delivery automatiquement
   ```json
   {
     "orderId": "order-123",
     "fastFoodId": "...",
     "userId": "...",
     "deliveryAddress": "Rue XYZ, Apt 456",
     "deliveryLat": 14.6789,
     "deliveryLng": -17.1234,
     "status": "pending"
   }
   ```
3. Socket : émet `newDeliveryPending` → rooms livreurs/marchand

### Assignation livreur (Dispatch)

1. Dispatcher/Marchand : assigne livreur à delivery
   ```
   PUT /delivery/:id
   {
     "livreurId": "livreur-uid",
     "livreurName": "Ahmed",
     "livreurPhone": "77123456"
   }
   ```
2. Backend :
   - Mets à jour delivery
   - Émet socket `deliveryAssigned` → room `livreur:${livreurId}`
   - Notifie client : "Votre livreur X arrive"

### Progression livraison (Livreur app)

1. Livreur reçoit delivery notification
2. Livreur clique "Commencer"
   ```
   PUT /delivery/:id/status
   { "status": "picked_up" }
   ```
3. Livreur met à jour location en route
   ```
   PUT /delivery/:id/location
   { "currentLat": 14.68, "currentLng": -17.12 }
   ```
   (envoyé régulièrement via GPS polling)

4. Client reçoit notifications :
   - "Livreur a quitté le restaurant"
   - Position live sur map

5. Livreur arrive
   ```
   PUT /delivery/:id/status
   { "status": "arrived" }
   ```
6. Client reçoit : "Livreur est arrivé"

7. Échange = code de livraison
   ```
   PUT /delivery/:id/status
   { "status": "delivered", "deliveryCode": "ABC123" }
   ```
8. Backend → mise à jour order status `delivered`
9. Socket : `order.status_changed` → rooms user + marchand

### Historique progression

À chaque changement statut, ajouter à `statusHistory` :
```json
{
  "status": "on_the_way",
  "timestamp": "2025-06-06T15:30:45Z",
  "notes": "En route depuis restaurant"
}
```

---

## Services & Repositories

**deliveryService.js**
- `createDelivery(data)` — crée livraison
- `getDeliveryByOrder(orderId)` — récupère livraison d'une commande
- `assignLivreur(deliveryId, livreurData)` — assigne livreur
- `updateDeliveryStatus(id, status)` — change statut + historique
- `updateDeliveryLocation(id, lat, lng)` — met à jour GPS
- `getLivreurDeliveries(livreurId)` — livraisons assignées
- `calculateETA(currentLat, currentLng, deliveryLat, deliveryLng)` — calcule temps arrivée

**repos.deliveries** : Firestore/Supabase

---

## Real-time tracking

**Frontend (Client app)** :
- Souscrit à `delivery:${deliveryId}` updates
- Reçoit location updates du livreur via socket
- Affiche map avec marker livreur + route

**Livreur app** :
- Émet location toutes les 30s (ou moins)
- Écoute socket pour nouvelles assignations

---

## Validations

- orderId : existant
- livreurId : utilisateur existant (avec rôle livreur?)
- deliveryAddress : non-vide
- status : enum valide

---

## Erreurs courantes

- 404 : Delivery non trouvée
- 400 : Adresse invalide ou livreur inexistant
- 409 : Delivery déjà assignée
