// ============================================================================
// walletAppVersion — Compatibilité ascendante du portefeuille (retraits)
// ----------------------------------------------------------------------------
// Depuis le passage à pawaPay, un retrait exige le solde débité
// (`sourceNetwork`, MTN | Orange). Les apps antérieures ne l'envoient pas : on
// ne devine pas le solde à leur place, on leur répond un message clair.
//
// Seuil en BASE : `wallet_networks_min_app_version` (settings_deployment,
// migration 066). Message :
//   - version publiée (`platform_latest_app_version` >= seuil) → mettre à jour ;
//   - pas encore publiée → le retrait arrive avec la prochaine mise à jour.
// ============================================================================
const { compareVersions } = require('./appVersion');

/** Réponse 426 servie à une app sous le seuil. */
const outdatedWithdrawResponse = (latestVersion, minVersion) => {
  const updatePublished = compareVersions(latestVersion || '0.0.0', minVersion) >= 0;
  return {
    success: false,
    httpStatus: 426,
    code: updatePublished ? 'app_update_required' : 'app_update_coming',
    message: updatePublished ? 'Mettez à jour l’application pour effectuer un retrait.' : 'Le retrait sera disponible avec la prochaine mise à jour de l’application.',
  };
};

module.exports = { outdatedWithdrawResponse };
