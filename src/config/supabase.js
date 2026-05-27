// ============================================================================
// Supabase Admin Client
// ============================================================================
// Utilisé pour toutes les opérations DB côté backend (RLS bypass via service role).
// Les requêtes côté mobile passent par l'API REST, donc on n'a pas besoin de
// gérer RLS pour l'instant (ajoutera plus tard si on expose Supabase au mobile).
// ============================================================================

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
// Accepte SUPABASE_SERVICE_ROLE_KEY (nom recommandé) ou SUPABASE_KEY (legacy)
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

let supabase = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  // Node 20 n'a pas WebSocket natif → on fournit `ws` au client Realtime.
  // (On n'utilise pas Realtime côté backend, mais le constructeur l'initialise.)
  let realtimeOpts;
  try {
    const ws = require('ws');
    realtimeOpts = { transport: ws };
  } catch (_) { /* ws non installé, on laisse Supabase tenter */ }

  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: { schema: 'public' },
    realtime: realtimeOpts,
  });
  console.log('Supabase client initialisé');
} else {
  console.warn(
    '[supabase] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant — client Supabase non initialisé. ' +
    'Définis ces variables dans .env si DB_PROVIDER inclut "supabase".'
  );
}

module.exports = { supabase };
