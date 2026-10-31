// ============================================================================
// walletAppVersion — Compatibilité ascendante du portefeuille (retraits)
// ----------------------------------------------------------------------------
// Depuis le passage à pawaPay, un retrait exige le solde débité
// (`sourceNetwork`, MTN | Orange). Les apps antérieures ne l'envoient pas : on
// ne peut pas exécuter leur retrait, et on ne devine pas le solde à leur place.
//
// Référence : la version ACTUELLE déjà en base (`platform_latest_app_version`,
// lue par `settings.getAppVersionGate`). Aucun seuil ni réglage ajouté. Une app
// antérieure à cette version reçoit le message de mise à jour.
// ============================================================================

const OUTDATED_WITHDRAW_RESPONSE = Object.freeze({
  success: false,
  httpStatus: 426,
  code: 'app_update_required',
  message: 'Mettez à jour l’application pour effectuer un retrait.',
});

module.exports = { OUTDATED_WITHDRAW_RESPONSE };
