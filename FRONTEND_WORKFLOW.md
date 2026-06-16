# Frontend Workflow — Paiement MobileWallet

Le paiement se fait en **2 temps** :
1. **Réponse immédiate** (synchrone) à `POST /transaction` → indique si le code USSD a été envoyé.
2. **Verdict final** (asynchrone) via **socket** → indique si le client a réellement payé.

> ⚠️ La réponse de l'étape 1 (`ussd_sent`) **n'est PAS** le résultat du paiement.
> Le vrai résultat (payé / échoué) arrive **uniquement** par le socket `payment.settled`.

---

## 1️⃣ Envoyer la requête de paiement

```javascript
POST /transaction
{
  userId:     "user-123",        // requis
  amount:     25000,             // requis, > 0
  payBy:      "mobilemoney",     // requis pour déclencher MobileWallet
  phone:      "677087298",       // requis (sans +237)
  network:    "Orangemoney",     // "Orangemoney" ou "MTN" (défaut: Orangemoney)
  email:      "user@example.com",// optionnel
  orderId:    "order-456",       // contexte commande (créée au paiement réussi)
  fastFoodId: "shop-789",        // idem
  items:      [ ... ]            // idem (articles commandés)
}
```

---

## 2️⃣ Réponse immédiate — 3 cas

Le backend renvoie **la même réponse que MobileWallet**. Se baser sur `success` + `status`.

### Cas A — USSD envoyé (HTTP 200)
```javascript
{
  success: true,
  status: "ussd_sent",
  message: "Composez #150*50# sur votre téléphone pour valider la transaction Orange Money.",
  transaction_id: "IN960#260613155908",
  code: 200,
  payment_number: "..."
}
```
➡️ Afficher l'overlay « En attente de paiement » + afficher `message` (il contient le code
USSD exact à composer). Puis **écouter le socket** (étape 3).

### Cas B — Erreur / doublon / opérateur indisponible (HTTP 400)
```javascript
{
  success: false,
  status: "error",
  message: "Paiement en cours ou trop rapproché",
  code: "retry_too_soon",
  retry_after_s: 30   // présent uniquement sur certaines erreurs
}
```
➡️ Afficher `message` en erreur.

### Cas C — Validation backend échouée (HTTP 400)
```javascript
{ success: false, message: [ { field: "phone", message: "..." } ] }
```
➡️ `message` est un tableau de champs invalides.

---

## 3️⃣ Verdict final via Socket (arrive plus tard)

Après que le client a composé son code USSD (30 s à quelques minutes) :

```javascript
socket.on('payment.settled', (data) => {
  // data = { status, transaction_id, amount, source }
  if (data.status === 'successful') {
    // ✅ payé → la commande est créée côté backend automatiquement
    navigate('/orders');
  } else {
    // ❌ status 'failed' ou 'cancelled'
    showError('Paiement échoué');
  }
});
```

---

## 4️⃣ Fallback (optionnel)

Si aucun `payment.settled` après ~2 min → polling :

```javascript
GET /transaction/{userId}
```

---

## Résumé des rendus frontend

| Étape | Signal                       | `status`                | Rendu frontend                              |
|-------|------------------------------|-------------------------|---------------------------------------------|
| 2     | réponse HTTP 200             | `ussd_sent`             | Overlay « composez le code » + `message`    |
| 2     | réponse HTTP 400             | `error`                 | Message d'erreur                            |
| 3     | socket `payment.settled`     | `successful`            | ✅ succès → redirige vers les commandes      |
| 3     | socket `payment.settled`     | `failed` / `cancelled`  | ❌ erreur paiement                           |

**C'est tout.** Le backend gère la création de commande et l'idempotence (webhook + socket).
