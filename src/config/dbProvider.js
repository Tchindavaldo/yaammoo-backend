// ============================================================================
// DB Provider — Feature flag pour migration Firestore → Supabase
// ============================================================================
// Trois modes pilotés par la variable d'environnement DB_PROVIDER :
//
//   firestore        → uniquement Firestore (mode actuel, défaut)
//   supabase         → uniquement Supabase (post-migration)
//   dual             → écritures sur les deux, lectures depuis DB_READ_FROM
//                      (utile pendant la phase de migration pour valider)
//
// Variable secondaire DB_READ_FROM (uniquement en mode dual) :
//   firestore (défaut) → reads depuis Firestore
//   supabase            → reads depuis Supabase
//
// Cette logique permet de basculer en production sans modifier le code des
// services métier — on change juste la variable d'environnement.
// ============================================================================

const provider = (process.env.DB_PROVIDER || 'firestore').toLowerCase();
const readFrom = (process.env.DB_READ_FROM || 'firestore').toLowerCase();

const VALID_PROVIDERS = ['firestore', 'supabase', 'dual'];
const VALID_READ_SOURCES = ['firestore', 'supabase'];

if (!VALID_PROVIDERS.includes(provider)) {
  throw new Error(
    `[dbProvider] DB_PROVIDER invalide: "${provider}". Valeurs autorisées: ${VALID_PROVIDERS.join(', ')}`
  );
}

if (provider === 'dual' && !VALID_READ_SOURCES.includes(readFrom)) {
  throw new Error(
    `[dbProvider] DB_READ_FROM invalide: "${readFrom}". Valeurs autorisées: ${VALID_READ_SOURCES.join(', ')}`
  );
}

const config = {
  provider,
  readFrom: provider === 'dual' ? readFrom : provider,

  useFirestoreRead: provider === 'firestore' || (provider === 'dual' && readFrom === 'firestore'),
  useSupabaseRead: provider === 'supabase' || (provider === 'dual' && readFrom === 'supabase'),

  useFirestoreWrite: provider === 'firestore' || provider === 'dual',
  useSupabaseWrite: provider === 'supabase' || provider === 'dual',
};

console.log(
  `[dbProvider] mode=${config.provider} reads=${config.readFrom} ` +
  `writes={firestore:${config.useFirestoreWrite}, supabase:${config.useSupabaseWrite}}`
);

module.exports = config;
