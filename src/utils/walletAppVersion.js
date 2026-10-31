// ============================================================================
// walletAppVersion — Compatibilité ascendante du portefeuille (retraits)
// ----------------------------------------------------------------------------
// Depuis le passage à pawaPay, un retrait exige le solde débité
// (`sourceNetwork`, MTN | Orange). Les apps antérieures ne l'envoient pas : on
// ne peut pas exécuter leur retrait, et on ne devine pas le solde à leur place
// (aucun repli automatique). On leur répond un message clair :
//
//   - une version compatible est publiée (`platform_latest_app_version` >= seuil)
//       → « mettez à jour l'application » ;
//   - pas encore publiée
//       → « le retrait arrive avec la prochaine mise à jour ».
//
// Seuil : env `APP_WALLET_NETWORK_MIN_VERSION` (version d'app minimale qui gère
// les deux soldes). Détection déléguée à `appVersion.js` (logique générique).
// ============================================================================
const { clientVersionAtLeast, compareVersions } = require('./appVersion');

const MIN_VERSION = String(process.env.APP_WALLET_NETWORK_MIN_VERSION || '').trim();

if (!MIN_VERSION) {
  console.error('[walletAppVersion] ⚠️ APP_WALLET_NETWORK_MIN_VERSION non configurée → aucune ancienne app détectée sur le retrait');
}

/** Vrai si le client gère les deux soldes (retrait avec `sourceNetwork`). */
const clientSupportsWalletNetworks = req => !MIN_VERSION || clientVersionAtLeast(req, MIN_VERSION);

/**
 * Réponse à servir à une ancienne app qui tente un retrait.
 * @param {string} latestVersion `platform_latest_app_version` (settings)
 */
const outdatedWithdrawResponse = latestVersion => {
  const updatePublished = !!MIN_VERSION && compareVersions(latestVersion || '0.0.0', MIN_VERSION) >= 0;
  return {
    success: false,
    httpStatus: 426,
    code: updatePublished ? 'app_update_required' : 'app_update_coming',
    message: updatePublished ? 'Mettez à jour l’application pour effectuer un retrait.' : 'Le retrait sera disponible avec la prochaine mise à jour de l’application.',
  };
};

module.exports = { clientSupportsWalletNetworks, outdatedWithdrawResponse, WALLET_NETWORK_MIN_VERSION: MIN_VERSION };
