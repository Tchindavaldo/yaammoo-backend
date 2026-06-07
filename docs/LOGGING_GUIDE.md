# Guide Logs — MobileWallet Integration

Tous les appels MobileWallet et les verdicts de paiement sont loggés en détail pour faciliter le debugging.

## Structure des logs

Les logs utilisent ce format:

```
[Module] [Info spécifique] → Action | ✓ Succès | ❌ Erreur
```

### Exemples

```
[Transaction] userId=user-123 → Création transaction: payBy=mobilemoney, amount=15000
[MobileWallet API] Orangemoney amount=15000 → POST http://localhost:7332/pay
[MobileWallet API] Orangemoney amount=15000 ✓ HTTP 200 reçu en 1234ms
[Webhook Controller] ✓ Signature HMAC valide
[Webhook MobileWallet] tx=mw-tx-999 ✓ Réservation réussie
```

---

## Flux complet d'un paiement (logs dans l'ordre)

### 1. Client initie paiement (POST /transaction)

```
[Transaction] userId=user-123 → Création transaction: payBy=mobilemoney, amount=15000
```

**Signification:** User user-123 crée une transaction de paiement Mobile Money pour 15 000 XAF.

### 2. Backend appelle MobileWallet

```
[Transaction] userId=user-123 → Appel MobileWallet /pay: amount=15000, network=Orangemoney, phone=674123456
[MobileWallet API] Orangemoney amount=15000 → POST http://localhost:7332/pay (timeout=30s, userId=user-123, phone=674123456)
```

**Signification:**
- Backend fait la requête HTTP vers MobileWallet
- URL cible: http://localhost:7332/pay
- Timeout: 30 secondes
- Réseau: Orangemoney
- Téléphone: 674123456

### 3. MobileWallet répond

```
[MobileWallet API] Orangemoney amount=15000 ✓ HTTP 200 reçu en 1234ms: status=ussd_sent, tx_id=mw-tx-999
[Transaction] userId=user-123 ✓ MobileWallet status=ussd_sent, transaction_id=mw-tx-999
[Transaction] userId=user-123 Mappé mw_tx=mw-tx-999 → userId=user-123
```

**Signification:**
- HTTP 200 reçu en 1.2 secondes
- Status: ussd_sent (USSD envoyé au téléphone du client)
- Transaction ID MobileWallet: mw-tx-999
- On mappe mw-tx-999 → userId pour retrouver le user lors du webhook

### 4. Frontend affiche code USSD

Frontend reçoit la réponse avec `status=ussd_sent` et affiche:
```
"Tapez *123*123456#"
```

### 5. MobileWallet envoie verdict (webhook)

Quand le client appuie sur la touche verte (succès) ou rouge (échec):

```
[Webhook Controller] → Webhook reçu de MobileWallet
[Webhook Controller] ✓ Signature HMAC valide
[Webhook Controller] Payload: type=transaction.successful, tx_id=mw-tx-999, status=successful
[Webhook Controller] → Appel webhookMobilewalletService...
```

**Signification:**
- Webhook arrivé de MobileWallet
- Signature HMAC validée (vérifie que c'est bien MobileWallet)
- Payload contient: type=transaction.successful, status=successful

### 6. Service traite le verdict

```
[Webhook MobileWallet] tx=mw-tx-999 → Verdict reçu: status=successful, amount=15000
[Webhook MobileWallet] tx=mw-tx-999 userId=user-123
[Webhook MobileWallet] tx=mw-tx-999 Tentative réservation du verdict en BD...
[Webhook MobileWallet] tx=mw-tx-999 ✓ Réservation réussie (webhook = premier chemin)
```

**Signification:**
- Verdict reçu: paiement successful (15 000 XAF)
- User: user-123
- Réservation atomique en BD réussie
- Le webhook est le premier chemin à traiter (pas de socket avant)

### 7. Socket émis au frontend

```
[Webhook MobileWallet] tx=mw-tx-999 → Émission socket payment.settled vers user:user-123
[Webhook MobileWallet] tx=mw-tx-999 ✓ Socket émis
[Webhook MobileWallet] tx=mw-tx-999 ✓ Webhook traité avec succès
```

**Signification:**
- Socket.IO envoyé à la room user:user-123
- Événement: payment.settled avec status=successful
- Webhook complètement traité

### 8. Frontend reçoit le verdict

Frontend reçoit le socket `payment.settled` avec status=successful et affiche:
```
"✓ Paiement réussi! 15 000 XAF"
Redirige vers /orders
```

---

## Cas: Socket et Webhook arrivent ensemble

Si Socket.IO ET webhook HTTP arrivent en parallèle:

```
[Webhook MobileWallet] tx=mw-tx-999 Tentative réservation du verdict en BD...
[Webhook MobileWallet] tx=mw-tx-999 ✓ Réservation réussie (webhook = premier chemin)
[Webhook MobileWallet] tx=mw-tx-999 → Émission socket payment.settled

[Socket] tx=mw-tx-999 Tentative réservation du verdict en BD...
[Socket] tx=mw-tx-999 ✓ Verdict déjà traité par webhook (ou un autre socket) → skip
```

**Résultat:** Le verdict n'est traité qu'UNE FOIS (atomicité garantie).

---

## Cas: Erreur MobileWallet

Si MobileWallet retourne 503 (service indisponible):

```
[MobileWallet API] Orangemoney amount=15000 ❌ Erreur HTTP 503: Service indisponible
[Transaction] userId=user-123 MobileWallet répondit avec succès=false: code=unavailable, message=Opérateur ou réseau indisponible
[Transaction] userId=user-123 ✓ Transaction initiée, en attente de webhook/socket
```

**Signification:** MobileWallet/opérateur est indisponible. Le client doit réessayer plus tard.

---

## Cas: Signature webhook invalide

```
[Webhook Controller] ❌ Signature invalide (HMAC mismatch)
[Webhook Controller] Calculé: abc123..., Reçu: def456...
```

**Signification:** Quelqu'un essaie de faker un webhook. Vérifier `MOBILEWALLET_WEBHOOK_SECRET` en .env.

---

## Comment lire les logs en production

### Via logs Fly.io

```bash
flyctl logs -a yaammoo-backend
```

Ou dans la console Fly.io dashboard:

1. Aller sur https://fly.io/dashboard
2. Sélectionner l'app "yaammoo-backend"
3. Aller à **Logs**
4. Chercher `[Transaction]`, `[MobileWallet]`, `[Webhook]`

### Filtrer par transaction ID

```bash
flyctl logs -a yaammoo-backend | grep "tx=mw-tx-999"
```

### Filtrer par user ID

```bash
flyctl logs -a yaammoo-backend | grep "userId=user-123"
```

---

## Niveaux de logs

- **INFO** : flot normal (appel MobileWallet, réception webhook, réservation réussie)
- **WARN** : cas inhabituels (verdict déjà traité, timeout)
- **ERROR** : bugs ou configurations manquantes (MOBILEWALLET_WEBHOOK_SECRET absent, erreur BD)
- **DEBUG** : détails techniques (payloads JSON complètes, calculs HMAC)

Pour activer DEBUG en .env:

```
LOG_LEVEL=DEBUG
```

---

## Checklist debugging

Si un paiement ne marche pas:

1. **Vérifier la requête MobileWallet:**
   - Chercher logs `[MobileWallet API]`
   - Voir si HTTP 200 ou erreur
   - Si erreur, voir le code (409=doublon, 503=indisponible)

2. **Vérifier le webhook:**
   - Chercher `[Webhook Controller]`
   - Signature valide? (HMAC check)
   - Réservation réussie? (BD accessible?)

3. **Vérifier le socket:**
   - Chercher `[Webhook MobileWallet] → Émission socket`
   - Socket reçu par le frontend?

4. **Vérifier l'idempotence:**
   - Y a-t-il 2 fois `[Webhook MobileWallet] ✓ Webhook traité`?
   - Si oui, c'est un bug (ne devrait pas arriver)
   - Chercher `Verdict déjà traité` pour le cas normal

