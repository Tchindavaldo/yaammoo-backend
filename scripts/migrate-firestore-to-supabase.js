#!/usr/bin/env node
// ============================================================================
// Migration Firestore → Supabase
// ============================================================================
// Copie toutes les collections Firestore dans les tables Supabase
// correspondantes en respectant le mapping défini dans src/repositories/mappers.js
//
// Usage :
//   cd BACKEND && node scripts/migrate-firestore-to-supabase.js [collection]
//
//   Sans argument : migre toutes les collections.
//   Avec un argument : migre uniquement la collection nommée (users, fastfoods,
//   menus, orders, transactions, bonus, bonusRequest, notification, rankCounters).
//
// Variables d'environnement requises :
//   FB_PROJECT_ID, FB_PRIVATE_KEY, FB_CLIENT_EMAIL (Firebase Admin)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (Supabase)
//
// Le script est idempotent (UPSERT par PK), donc relançable sans risque.
// Migre par batchs de 500 lignes pour ne pas saturer Supabase.
// ============================================================================

require('dotenv').config();

const { db } = require('../src/config/firebase');
const { supabase } = require('../src/config/supabase');
const m = require('../src/repositories/mappers');

if (!supabase) {
  console.error('❌ Supabase client non initialisé. Vérifie SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env');
  process.exit(1);
}

const BATCH = 500;

const log = (label, ...rest) => console.log(`[${label}]`, ...rest);

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const upsert = async (table, rows, onConflict = 'id') => {
  if (!rows || rows.length === 0) return 0;
  let total = 0;
  let skipped = 0;
  for (const batch of chunk(rows, BATCH)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) {
      // FK violation : on tente ligne par ligne pour isoler les orphelins
      if (error.code === '23503') {
        for (const row of batch) {
          const { error: rowErr } = await supabase.from(table).upsert([row], { onConflict });
          if (rowErr) {
            if (rowErr.code === '23503') {
              console.warn(`  ⚠️  ${table} ligne orpheline ignorée (id=${row.id || JSON.stringify(row).slice(0, 80)}): ${rowErr.message}`);
              skipped++;
            } else {
              console.error(`❌ upsert ${table} ligne (id=${row.id}) failed:`, rowErr.message);
              throw rowErr;
            }
          } else {
            total++;
          }
        }
      } else {
        console.error(`❌ upsert ${table} failed:`, error.message);
        throw error;
      }
    } else {
      total += batch.length;
    }
    log(table, `+${batch.length - skipped} (total ${total}${skipped > 0 ? `, skipped ${skipped}` : ''})`);
  }
  return total;
};

// ---------------------------------------------------------------------------
// USERS
// ---------------------------------------------------------------------------
const migrateUsers = async () => {
  log('users', 'start');
  const snap = await db.collection('users').get();
  log('users', `${snap.size} docs read`);

  const userRows = [];
  const pushRows = [];
  const fcmRows = [];

  snap.forEach((doc) => {
    const data = { id: doc.id, ...doc.data() };
    userRows.push(m.user.toSupabase(data));

    // Extraction de pushTokens (array d'objets) → table dédiée
    if (Array.isArray(data.pushTokens)) {
      const seenDevices = new Set();
      for (const t of data.pushTokens) {
        if (!t || !t.token || !t.deviceId) continue;
        if (seenDevices.has(t.deviceId)) continue;
        seenDevices.add(t.deviceId);
        pushRows.push({
          user_id: doc.id,
          device_id: t.deviceId,
          token: t.token,
          platform: t.platform === 'ios' ? 'ios' : 'android',
          last_seen: t.lastSeen || new Date().toISOString(),
        });
      }
    }

    // Extraction fcmTokens (array de strings) → table legacy
    if (Array.isArray(data.fcmTokens)) {
      const seenTokens = new Set();
      for (const tok of data.fcmTokens) {
        if (!tok || seenTokens.has(tok)) continue;
        seenTokens.add(tok);
        fcmRows.push({ user_id: doc.id, token: tok });
      }
    }
  });

  await upsert('users', userRows, 'id');
  await upsert('user_push_tokens', pushRows, 'user_id,device_id');
  await upsert('user_fcm_tokens', fcmRows, 'user_id,token');
};

// ---------------------------------------------------------------------------
// FASTFOODS
// ---------------------------------------------------------------------------
const migrateFastfoods = async () => {
  log('fastfoods', 'start');
  const snap = await db.collection('fastfoods').get();
  const rows = snap.docs.map((doc) => m.fastfood.toSupabase({ id: doc.id, ...doc.data() }));
  await upsert('fastfoods', rows, 'id');
};

// ---------------------------------------------------------------------------
// MENUS
// ---------------------------------------------------------------------------
const migrateMenus = async () => {
  log('menus', 'start');
  const snap = await db.collection('menus').get();
  const rows = snap.docs.map((doc) => m.menu.toSupabase({ id: doc.id, ...doc.data() }));
  await upsert('menus', rows, 'id');
};

// ---------------------------------------------------------------------------
// ORDERS
// ---------------------------------------------------------------------------
const migrateOrders = async () => {
  log('orders', 'start');
  const snap = await db.collection('orders').get();
  const rows = snap.docs.map((doc) => m.order.toSupabase({ id: doc.id, ...doc.data() }));
  await upsert('orders', rows, 'id');
};

// ---------------------------------------------------------------------------
// RANK COUNTERS
// ---------------------------------------------------------------------------
const migrateRankCounters = async () => {
  log('rankCounters', 'start');
  const snap = await db.collection('rankCounters').get();
  const rows = [];
  snap.forEach((doc) => {
    const data = doc.data();
    // ID est de la forme "{fastFoodId}_{date}_{status}" → on parse pour reconstituer
    const id = doc.id;
    const parts = id.split('_');
    if (parts.length < 3) {
      console.warn(`⚠️  rank_counter id non parsable: ${id}, skip`);
      return;
    }
    const status = parts[parts.length - 1];
    const date = parts[parts.length - 2];
    const fastFoodId = parts.slice(0, parts.length - 2).join('_');
    rows.push({
      id,
      fastfood_id: fastFoodId,
      delivery_date: date,
      status,
      value: data.value || 0,
      updated_at: data.updatedAt || new Date().toISOString(),
    });
  });
  await upsert('rank_counters', rows, 'id');
};

// ---------------------------------------------------------------------------
// TRANSACTIONS
// ---------------------------------------------------------------------------
const migrateTransactions = async () => {
  log('transactions', 'start');
  const snap = await db.collection('transaction').get(); // collection nommée 'transaction' (singulier) en Firestore
  const rows = snap.docs.map((doc) => m.transaction.toSupabase({ id: doc.id, ...doc.data() }));
  await upsert('transactions', rows, 'id');
};

// ---------------------------------------------------------------------------
// BONUS
// ---------------------------------------------------------------------------
const migrateBonus = async () => {
  log('bonus', 'start');
  const snap = await db.collection('bonus').get();
  const rows = snap.docs.map((doc) => m.bonus.toSupabase({ id: doc.id, ...doc.data() }));
  await upsert('bonus', rows, 'id');
};

// ---------------------------------------------------------------------------
// BONUS REQUESTS
// ---------------------------------------------------------------------------
const migrateBonusRequests = async () => {
  log('bonusRequest', 'start');
  const snap = await db.collection('bonusRequest').get();
  const rows = snap.docs.map((doc) => m.bonusRequest.toSupabase({ id: doc.id, ...doc.data() }));
  await upsert('bonus_requests', rows, 'id');
};

// ---------------------------------------------------------------------------
// NOTIFICATIONS
// ---------------------------------------------------------------------------
const migrateNotifications = async () => {
  log('notification', 'start');
  const snap = await db.collection('notification').get();
  const rows = snap.docs.map((doc) => m.notification.toSupabase({ id: doc.id, ...doc.data() }));
  await upsert('notifications', rows, 'id');
};

// ---------------------------------------------------------------------------
const REGISTRY = {
  users: migrateUsers,
  fastfoods: migrateFastfoods,
  menus: migrateMenus,
  orders: migrateOrders,
  rankCounters: migrateRankCounters,
  transactions: migrateTransactions,
  bonus: migrateBonus,
  bonusRequest: migrateBonusRequests,
  notification: migrateNotifications,
};

// Ordre d'exécution important pour respecter les FK :
// users → fastfoods → menus → orders → rank_counters
// puis le reste (sans FK strictes croisées).
const ORDER = [
  'users',
  'fastfoods',
  'menus',
  'orders',
  'rankCounters',
  'transactions',
  'bonus',
  'bonusRequest',
  'notification',
];

const main = async () => {
  const arg = process.argv[2];
  const toRun = arg ? [arg] : ORDER;

  for (const name of toRun) {
    if (!REGISTRY[name]) {
      console.error(`❌ Collection inconnue: ${name}. Valides: ${Object.keys(REGISTRY).join(', ')}`);
      process.exit(1);
    }
    try {
      await REGISTRY[name]();
      log(name, '✅ done');
    } catch (e) {
      console.error(`❌ ${name} failed:`, e.message);
      process.exit(1);
    }
  }

  console.log('\n🎉 Migration terminée avec succès');
  process.exit(0);
};

main().catch((e) => {
  console.error('❌ Fatal:', e);
  process.exit(1);
});
