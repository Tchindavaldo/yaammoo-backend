# Guide de Test — MobileWallet Integration

## Test 1: Initier un paiement via `/transaction`

### Endpoint
```
POST http://localhost:5000/transaction
```

### Payload
```json
{
  "userId": "user-test-123",
  "amount": 25,
  "currentAmount": 1000,
  "phone": "696080087",
  "network": "Orangemoney",
  "email": "client@example.com",
  "payBy": "mobilemoney",
  "type": "payment",
  "name": "Test payment",
  "mode": "auto"
}
```

### Réponse attendue
```json
{
  "success": true,
  "status": "ussd_sent",
  "message": "Paiement initié",
  "mw_transaction_id": "mw-tx-...",
  "data": {
    "status": "ussd_sent",
    "mw_transaction_id": "mw-tx-..."
  }
}
```

### Logs attendus dans le backend
```
[Transaction] userId=user-test-123 → Création transaction: payBy=mobilemoney, amount=25
[Transaction] → Appel MobileWallet /pay: amount=25, network=Orangemoney, phone=696080087
[MobileWallet API] Orangemoney amount=25 → POST http://localhost:7332/pay (timeout=30s)
[MobileWallet API] ✓ HTTP 200 reçu: status=ussd_sent, tx_id=mw-tx-...
```

### Curl pour tester
```bash
curl -X POST http://localhost:5000/transaction \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-test-123",
    "amount": 25,
    "currentAmount": 1000,
    "phone": "696080087",
    "network": "Orangemoney",
    "email": "client@example.com",
    "payBy": "mobilemoney",
    "type": "payment",
    "name": "Test payment",
    "mode": "auto"
  }' | jq .
```

---

## Test 2: Webhook de verdict

Après que MobileWallet envoie le verdict (via Socket.io ou Webhook HTTP):

### Logs attendus
```
[Webhook Controller] → Webhook reçu de MobileWallet
[Webhook Controller] ✓ Signature HMAC valide
[Webhook MobileWallet] tx=mw-tx-... → Verdict reçu: status=successful
[Webhook MobileWallet] ✓ Réservation réussie
[Webhook MobileWallet] → Émission socket payment.settled vers user:user-test-123
```

---

## Payload /pay envoyé à MobileWallet

Quand `/transaction` appelle MobileWallet:

```json
{
  "amount": 25,
  "phone": "696080087",
  "network": "Orangemoney",
  "email": "client@example.com",
  "mode": "auto"
}
```

Header:
```
X-Admin-Key: sk_test_reNp-dqtFsOSXNDD0QZ_g82GsFr8H1u_
```

---

## Configuration requise (.env)

```env
MOBILEWALLET_URL=http://localhost:7332
MOBILEWALLET_ADMIN_KEY=sk_test_reNp-dqtFsOSXNDD0QZ_g82GsFr8H1u_
MOBILEWALLET_WEBHOOK_SECRET=7Cm_rR-JXqkMe2RILWV4AMWue7w50HqXTzgFoi0XEDE
```

---

## Dépannage

### Erreur: "Signature invalide"
- Vérifier que `MOBILEWALLET_WEBHOOK_SECRET` dans `.env` correspond au secret utilisé pour générer la signature

### Erreur: "X-Admin-Key invalid"
- Vérifier que `MOBILEWALLET_ADMIN_KEY` est correct dans `.env`

### Erreur: "Cannot connect to MobileWallet"
- Vérifier que `MOBILEWALLET_URL` pointe vers un serveur MobileWallet actif
- Par défaut: `http://localhost:7332` (ai_browser2 local)

### Webhook signature invalide
- La signature HMAC est calculée comme: `HMAC-SHA256(secret, "timestamp.rawBody")`
- Le rawBody doit être le JSON exact envoyé (sans espaces/retours à la ligne)
