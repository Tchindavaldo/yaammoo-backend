#!/usr/bin/env node
// ============================================================================
// Validation post-migration
// ============================================================================
// Compare les compteurs Firestore vs Supabase pour chaque collection/table.
// Affiche un diff lisible et exit 0 si tout matche, 1 sinon.
//
// Usage : cd BACKEND && node scripts/validate-migration.js
// ============================================================================

require('dotenv').config();
const { db } = require('../src/config/firebase');
const { supabase } = require('../src/config/supabase');

if (!supabase) {
  console.error('❌ Supabase client non initialisé');
  process.exit(1);
}

const PAIRS = [
  { fs: 'users', sb: 'users' },
  { fs: 'fastfoods', sb: 'fastfoods' },
  { fs: 'menus', sb: 'menus' },
  { fs: 'orders', sb: 'orders' },
  { fs: 'rankCounters', sb: 'rank_counters' },
  { fs: 'transaction', sb: 'transactions' },
  { fs: 'bonus', sb: 'bonus' },
  { fs: 'bonusRequest', sb: 'bonus_requests' },
  { fs: 'notification', sb: 'notifications' },
];

const countFs = async (col) => {
  const snap = await db.collection(col).count().get();
  return snap.data().count;
};

const countSb = async (table) => {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count;
};

const main = async () => {
  let allOk = true;
  console.log('\nCompteurs Firestore vs Supabase :\n');
  console.log('Collection (FS)'.padEnd(20), 'Table (SB)'.padEnd(20), 'FS'.padStart(8), 'SB'.padStart(8), 'Δ'.padStart(8));
  console.log('-'.repeat(70));

  for (const { fs, sb } of PAIRS) {
    try {
      const [fsCount, sbCount] = await Promise.all([countFs(fs), countSb(sb)]);
      const diff = sbCount - fsCount;
      const status = diff === 0 ? '✅' : '⚠️';
      console.log(
        fs.padEnd(20),
        sb.padEnd(20),
        String(fsCount).padStart(8),
        String(sbCount).padStart(8),
        String(diff).padStart(7) + status
      );
      if (diff !== 0) allOk = false;
    } catch (e) {
      console.log(fs.padEnd(20), sb.padEnd(20), 'ERROR:', e.message);
      allOk = false;
    }
  }

  console.log('');
  if (allOk) {
    console.log('✅ Tous les compteurs matchent');
    process.exit(0);
  } else {
    console.log('⚠️  Certains compteurs divergent. Vérifie avant de basculer.');
    process.exit(1);
  }
};

main().catch((e) => {
  console.error('❌ Fatal:', e);
  process.exit(1);
});
