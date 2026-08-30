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
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

let supabase = null;

// ============================================================================
// `fetch` resilient — corrige les `TypeError: fetch failed` intermittents
// ============================================================================
// Le `fetch` global de Node (undici) garde les connexions dans un pool. Le
// proxy Supabase, lui, ferme les connexions inactives au bout de quelques
// secondes. Undici reutilise alors une socket DEJA MORTE : la requete echoue
// instantanement avec le message generique `TypeError: fetch failed`, sans
// aucun retry — d'ou des echecs intermittents sur des requetes pourtant
// valides (`bonus_claim_counts`, `getFastfoods`), et la lenteur qui suit,
// chaque echec passant par un timeout avant le repli applicatif.
//
// Deux garde-fous, dans cet ordre :
//  1. `keepAliveTimeout` plus COURT que la fenetre de fermeture du proxy : la
//     socket est recyclee par nous avant que l'autre bout ne la coupe ;
//  2. un retry sur les seules erreurs de CONNEXION (jamais sur une reponse
//     HTTP, meme 5xx : rejouer un POST deja parti dupliquerait l'ecriture).
// `undici` est embarque dans Node 18+, mais pas expose comme dependance : on
// degrade proprement si le require echoue plutot que de casser le boot. Le
// retry ci-dessous, lui, fonctionne sans agent.
try {
  const { Agent, setGlobalDispatcher } = require('undici');
  // 4 s : sous les ~5 s au-dela desquelles le proxy coupe une connexion oisive.
  setGlobalDispatcher(
    new Agent({
      keepAliveTimeout: 4_000,
      keepAliveMaxTimeout: 10_000,
      connect: { timeout: 10_000 },
    }),
  );
} catch (_) {
  console.warn('[supabase] undici indisponible — keep-alive par defaut conserve.');
}

/** Erreurs de connexion : la requete n'a jamais atteint le serveur. */
const isConnectionError = err => {
  const code = err?.cause?.code || err?.code;
  return (
    err?.name === 'TypeError' ||
    code === 'UND_ERR_SOCKET' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE'
  );
};

const resilientFetch = async (url, options = {}) => {
  let lastError;
  // 3 tentatives : la 1re rejoue une socket morte recyclee, la 2e couvre un
  // hoquet reseau. Au-dela, c'est une vraie panne, on remonte l'erreur.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastError = err;
      if (!isConnectionError(err)) throw err;
      // Petit palier croissant : 0 ms, 150 ms, 300 ms.
      if (attempt < 2) await new Promise(r => setTimeout(r, attempt * 150));
    }
  }
  throw lastError;
};

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  // Node 20 n'a pas WebSocket natif → on fournit `ws` au client Realtime.
  // (On n'utilise pas Realtime côté backend, mais le constructeur l'initialise.)
  let realtimeOpts;
  try {
    const ws = require('ws');
    realtimeOpts = { transport: ws };
  } catch (_) {
    /* ws non installé, on laisse Supabase tenter */
  }

  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: { schema: 'public' },
    realtime: realtimeOpts,
    // Toutes les requetes DB passent par le fetch resilient ci-dessus.
    global: { fetch: resilientFetch },
  });
  console.log('Supabase client initialisé');
} else {
  console.warn('[supabase] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant — client Supabase non initialisé. ' + 'Définis ces variables dans .env si DB_PROVIDER inclut "supabase".');
}

module.exports = { supabase };
