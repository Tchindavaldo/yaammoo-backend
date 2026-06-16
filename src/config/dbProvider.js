// ============================================================================
// DB Provider — Supabase uniquement
// ============================================================================
// La migration Firestore → Supabase est terminée pour la couche DONNÉES PURES.
// La BD du backend est désormais **Supabase** exclusivement (repositories).
//
// ⚠️ Firebase reste utilisé pour ce qui N'EST PAS de la BD pure :
//    - Auth (admin.auth().verifyIdToken / deleteUser)
//    - Push notifications (admin.messaging())
//    - Storage (admin.storage() / bucket)
// Voir config/firebase.js — ne pas supprimer.
//
// L'ancien système dual-write / DB_PROVIDER=firestore|dual a été retiré.
// La variable DB_PROVIDER est conservée pour compat mais seule 'supabase' est
// supportée ; toute autre valeur est ignorée avec un avertissement.
// ============================================================================

const provider = (process.env.DB_PROVIDER || 'supabase').toLowerCase();

if (provider !== 'supabase') {
  console.warn(
    `[dbProvider] DB_PROVIDER="${provider}" ignoré — la BD est désormais Supabase uniquement ` +
    `(Firestore a été retiré de la couche données). Mets DB_PROVIDER=supabase dans .env.`
  );
}

const config = {
  provider: 'supabase',
  readFrom: 'supabase',
  useFirestoreRead: false,
  useSupabaseRead: true,
  useFirestoreWrite: false,
  useSupabaseWrite: true,
};

console.log('[dbProvider] mode=supabase (Firestore retiré de la couche données)');

module.exports = config;
