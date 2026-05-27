// ============================================================================
// Générateur d'IDs compatibles Firestore (20 chars alphanum) pour Supabase
// ============================================================================
// On garde le format Firestore pour compatibilité totale entre les deux DBs
// pendant la phase dual-write. Aucun risque de collision en pratique.
// ============================================================================

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateId(length = 20) {
  let id = '';
  for (let i = 0; i < length; i++) {
    id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return id;
}

module.exports = { generateId };
