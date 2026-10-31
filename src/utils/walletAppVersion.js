// ============================================================================
// walletAppVersion — Retrait refusé aux versions antérieures (R11)
// ----------------------------------------------------------------------------
// Un retrait exige le solde débité (`sourceNetwork`, MTN | Orange). Référence :
// la version ACTUELLE en base, `platform_latest_app_version` (via
// `settings.getAppVersionGate`). Toute version antérieure reçoit ce message.
// ============================================================================

const OUTDATED_WITHDRAW_RESPONSE = Object.freeze({
  success: false,
  httpStatus: 426,
  code: 'app_update_required',
  message: 'Mettez à jour l’application pour effectuer un retrait.',
});

module.exports = { OUTDATED_WITHDRAW_RESPONSE };
