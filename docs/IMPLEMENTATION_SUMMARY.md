# Résumé Implémentation — Idempotence MobileWallet + Logs Détaillés

## 📋 Objectif

Résoudre le **problème d'idempotence** : MobileWallet envoie le verdict par 2 canaux (socket + webhook) qui peuvent arriver en n'importe quel ordre. Sans idempotence, le verdict était traité 2 fois.

**Solution :** Table `transactionSettlements` + réservation atomique en BD.

---

## 🔧 Fichiers Modifiés

### Repositories (Firestore + Supabase)

#### `src/repositories/firestore/transactions.repo.js` ✅
- Ajouté `reserveSettlement(transactionId, settledBy, status)` 
  - Utilise Firestore transaction (atomique)
  - Retourne true si créé (premier chemin), false si déjà présent
- Ajouté `getSettlement(transactionId)`
  - Récupère qui a traité (socket ou webhook)

#### `src/repositories/supabase/transactions.repo.js` ✅
- Ajouté `reserveSettlement(transactionId, settledBy, status)`
  - Utilise INSERT avec UNIQUE constraint
  - Code d'erreur 23505 = déjà existe
- Ajouté `getSettlement(transactionId)`

#### `src/repositories/index.js` ✅
- Ajouté `transactions.reserveSettlement` (dual-write)
- Ajouté `transactions.getSettlement` (read from configured DB)

### Services

#### `src/services/transaction/postTransaction.service.js` ✅
**Logs détaillés ajoutés:**
- Avant appel MobileWallet: URL, méthode, payload
- Après appel: temps écoulé, status HTTP, transaction ID
- Sur erreur: code erreur, message

**Exemple:**
```
[Transaction] userId=user-123 → Appel MobileWallet /pay: amount=15000, network=Orangemoney, phone=674123456
[MobileWallet API] Orangemoney amount=15000 → POST http://localhost:7332/pay (timeout=30s)
[MobileWallet API] Orangemoney amount=15000 ✓ HTTP 200 reçu en 1234ms: status=ussd_sent, tx_id=mw-tx-999
```

#### `src/services/transaction/mobilewalletService.js` ✅
**Logs HTTP détaillés:**
- Avant: URL complète, payload
- Après: statut HTTP, durée, réponse
- Erreurs: code erreur, message, détails

#### `src/services/transaction/webhookMobilewallet.service.js` ✅
**Idempotence + Logs:**
- Appelle `repos.transactions.reserveSettlement()` (atomique)
- Si false = déjà traité → skip avec log
- Si true = traiter le verdict
- Logs clairs du flux: réception → réservation → émission socket

**Exemple:**
```
[Webhook MobileWallet] tx=mw-tx-999 → Verdict reçu: status=successful, amount=15000
[Webhook MobileWallet] tx=mw-tx-999 Tentative réservation du verdict en BD...
[Webhook MobileWallet] tx=mw-tx-999 ✓ Réservation réussie (webhook = premier chemin)
[Webhook MobileWallet] tx=mw-tx-999 → Émission socket payment.settled vers user:user-123
```

### Controllers

#### `src/controllers/transaction/webhookMobilewallet.controller.js` ✅
**Logs complets:**
- Arrivée du webhook
- Validation signature HMAC (debug: calcul vs. reçu)
- Parse du payload
- Appel service
- Réponse 200 OK

**Avantage:** Debugging facile des signatures invalides.

---

## 📊 Fichiers Créés

### Migration Supabase

#### `schema/migrations/001_transaction_settlements.sql` ✨
Crée la table `transactionSettlements`:
```sql
CREATE TABLE transaction_settlements (
  transaction_id VARCHAR(255) UNIQUE NOT NULL,
  settled_by VARCHAR(20) CHECK (settled_by IN ('socket', 'webhook')),
  status VARCHAR(50) NOT NULL,
  settled_at TIMESTAMP DEFAULT NOW(),
  ...
);
```

**Note:** Firestore utilise une collection `transactionSettlements` (pas de migration SQL).

### Documentation

#### `schema/MIGRATIONS.md` 📖
- Comment appliquer la migration Supabase
- Via Supabase Dashboard ou CLI
- Explique le rôle de la table

#### `docs/LOGGING_GUIDE.md` 📖
**Guide complet des logs:**
- Structure des logs
- Flux complet d'un paiement (avec logs détaillés)
- Cas: socket + webhook parallèles
- Cas: erreur MobileWallet
- Cas: signature webhook invalide
- Comment lire les logs en production (Fly.io)
- Checklist debugging

#### `architecture/transactions.md` 📖 (Mise à jour)
- Ajouté section "Idempotence: Socket + Webhook"
- Ajouté section "Logs détaillés"
- Explique la réservation atomique
- Exemples de logs réels

---

## 🚀 Déploiement

### Étapes à suivre:

1. **Appliquer la migration Supabase** (si utilisé):
   ```bash
   # Via Supabase Dashboard:
   1. SQL Editor → Coller schema/migrations/001_transaction_settlements.sql
   2. Exécuter
   
   # Ou via CLI:
   supabase migration up
   ```

2. **Deployer le code** (gitpush/Fly.io):
   ```bash
   git add .
   git commit -m "feat: implement transaction settlement idempotence + detailed logging"
   git push origin main
   # Fly.io auto-deploie
   ```

3. **Vérifier en logs**:
   ```bash
   flyctl logs -a yaammoo-backend | grep "Webhook MobileWallet"
   ```

---

## 🔍 Comportement Avant / Après

### Avant
```
PROBLÈME: Socket + Webhook arrivent en parallèle
├─ Socket traite: "successful"
└─ Webhook traite AUSSI: "successful"  ← DOUBLON!
   (Utilise Set en mémoire qui se vide au redémarrage)
```

### Après
```
IDEMPOTENCE: Socket + Webhook synchronisés via BD
├─ Webhook essaie INSERT dans transactionSettlements
│  ✓ INSERT réussit → traite le verdict
│
└─ Socket essaie INSERT
   ❌ UNIQUE constraint → déjà présent
   → skip avec log "Verdict déjà traité"
   
RÉSULTAT: Traité une fois seulement, toujours ✅
```

---

## 📝 Logs Importants à Chercher

| Logs | Signification |
|------|---------------|
| `[Transaction] → Appel MobileWallet` | Client a initié un paiement |
| `[MobileWallet API] ✓ HTTP 200 reçu en XXms` | MobileWallet a répondu |
| `[Webhook Controller] ✓ Signature HMAC valide` | Webhook authentique |
| `[Webhook MobileWallet] ✓ Réservation réussie` | Verdict sera traité (premier chemin) |
| `[Webhook MobileWallet] ✓ Verdict déjà traité` | Skip (l'autre chemin a traité) |
| `[Webhook MobileWallet] → Émission socket` | Client notifié du verdict |

---

## ⚠️ Notes Importantes

### Firestore vs Supabase

- **Firestore:** Utilise `runTransaction()` natif (déjà atomique)
- **Supabase:** Utilise table SQL + UNIQUE constraint
- **Dual-write:** Les deux reçoivent la réservation

### En Production

- **Fly.io logs** : `flyctl logs -a yaammoo-backend`
- **Datadog/Sentry** : Les logs structurés JSON facilitent le parsing
- **Monitoring:** Chercher les erreurs `[Webhook MobileWallet] ❌`

### Configurations Requises

- `.env` doit avoir:
  - `MOBILEWALLET_URL`
  - `MOBILEWALLET_ADMIN_KEY`
  - `MOBILEWALLET_WEBHOOK_SECRET`
- Supabase: migration appliquée (si DB_PROVIDER=supabase ou dual)

---

## 🔗 Fichiers de Référence

- **Architecture:** [architecture/transactions.md](../architecture/transactions.md)
- **Logging:** [docs/LOGGING_GUIDE.md](./LOGGING_GUIDE.md)
- **Migrations:** [schema/MIGRATIONS.md](../schema/MIGRATIONS.md)
- **Code:** voir fichiers modifiés ci-dessus

