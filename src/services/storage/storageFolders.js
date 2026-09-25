// ============================================================================
// Dossiers du bucket Supabase Storage (un dossier = un type de fichier)
// ============================================================================
// `fastFood/` = ancien dossier fourre-tout, conserve pour les apps deja publiees
// qui envoient sur `/image/upload` sans champ `folder`.
// ============================================================================
const STORAGE_FOLDERS = [
  'menus', // images des plats
  'shops', // photo des boutiques
  'banners', // carrousel pub du home
  'voiceNotes', // notes vocales de livraison (commandes)
  'bonusProofs', // videos de preuve des bonus
];

module.exports = { STORAGE_FOLDERS };
