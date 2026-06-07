# Migrations Supabase

Ce dossier contient les évolutions de schéma Supabase. Chaque migration est **idempotente** (safe à rejouer).

## Comment appliquer une migration

### Via Supabase Dashboard

1. Ouvrir [Supabase Console](https://supabase.com) → Votre projet
2. Aller à **SQL Editor**
3. Ouvrir le fichier SQL de la migration (ex: `migrations/001_transaction_settlements.sql`)
4. Copier/coller le contenu
5. Cliquer **Exécuter**

### Via CLI (Supabase CLI)

```bash
supabase migration up
```

## Migrations disponibles

### `001_transaction_settlements.sql`

**Objet:** Garantir l'idempotence des verdicts de paiement (socket + webhook)

**Ce qu'elle crée:**
- Table `transaction_settlements` : trace qui a traité le verdict (socket ou webhook)
- Index sur `transaction_id` et `settled_by`

**Utilisation côté code:**
```javascript
// Réserver atomiquement le verdict
const reserved = await repos.transactions.reserveSettlement(
  transactionId,
  'webhook',  // ou 'socket'
  status
);

if (!reserved) {
  // L'autre chemin a déjà traité
  return;
}

// Traiter le verdict
```

**Raison:** MobileWallet envoie le verdict par 2 canaux simultanés (socket + webhook). Sans cette table, le verdict pouvait être traité 2 fois. Maintenant, un seul chemin traite, l'autre voit "déjà traité" et s'abstient.

---

## Notes

- Firestore n'a pas besoin de migration SQL (utilise collections + transactions Firestore)
- Supabase utilise PostgreSQL natif, donc migration classique
- Les migrations sont versionnées (001_, 002_, etc.) pour l'ordre d'exécution

