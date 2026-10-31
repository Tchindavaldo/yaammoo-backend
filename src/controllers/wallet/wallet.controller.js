// ============================================================================
// wallet.controller — Portefeuille marchand (solde, historique, retrait)
// ============================================================================
// Le marchand est identifié par req.user.uid (Bearer Firebase). Le solde est
// calculé depuis les transactions (pas de champ figé).
// ============================================================================

const repos = require('../../repositories');
const { requestWithdrawal } = require('../../services/wallet/withdraw.service');
const { quoteWithdrawal } = require('../../services/wallet/withdrawQuote.service');
const { predictOperator } = require('../../services/transaction/mobilewalletService');
const { validateWithdrawalQuote } = require('../../utils/validator/validateWithdrawal');
const { resolvePeriod } = require('../../utils/period');
const { outdatedWithdrawResponse } = require('../../utils/walletAppVersion');
const { getAppVersionGate, clientSupportsFeature, getSettings, KEYS } = require('../../services/settings/settings.service');

/** GET /wallet/balance — solde du marchand authentifié. */
exports.getBalanceController = async (req, res) => {
  try {
    const userId = req.user?.uid;
    console.info(`[Wallet] GET /balance → userId=${userId}`);
    if (!userId) return res.status(401).json({ success: false, error: 'Non authentifié' });

    // `balance` garde son sens (total retirable) ; `mtn` / `orange` sont ajoutés
    // (R11, purement additif). Seuls les montants pawaPay comptent.
    const balance = await repos.transactions.getMerchantBalance(userId);
    console.info(`[Wallet] GET /balance ✓ userId=${userId} → balance=${balance.balance} (mtn=${balance.mtn}, orange=${balance.orange}), earned=${balance.totalEarned}, withdrawn=${balance.totalWithdrawn}`);
    return res.status(200).json({ success: true, data: balance });
  } catch (error) {
    console.error(`[Wallet] GET /balance ❌ userId=${req.user?.uid}: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /wallet/history — historique payin (gains) + payout (retraits).
 * Query : ?direction=payin|payout, ?from=ISO&to=ISO, ?period=today|week|month|all
 */
exports.getHistoryController = async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ success: false, error: 'Non authentifié' });

    const { direction } = req.query;
    if (direction && !['payin', 'payout'].includes(direction)) {
      return res.status(400).json({ success: false, error: "direction doit être 'payin' ou 'payout'" });
    }
    const { from, to } = resolvePeriod(req.query);
    console.info(`[Wallet] GET /history → userId=${userId}, direction=${direction || 'all'}, period=${req.query.period || '-'}, from=${from || '-'}, to=${to || '-'}`);

    const history = await repos.transactions.getMerchantHistory(userId, { direction, from, to });
    console.info(`[Wallet] GET /history ✓ userId=${userId} → ${history.length} transaction(s)`);
    return res.status(200).json({ success: true, data: history });
  } catch (error) {
    console.error(`[Wallet] GET /history ❌ userId=${req.user?.uid}: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /wallet/stats — totaux payin/payout/net agrégés par période.
 * Query : ?groupBy=day|week|month, ?from=ISO&to=ISO, ?period=today|week|month|all
 */
exports.getStatsController = async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ success: false, error: 'Non authentifié' });

    const groupBy = req.query.groupBy || 'day';
    if (!['day', 'week', 'month'].includes(groupBy)) {
      return res.status(400).json({ success: false, error: "groupBy doit être 'day', 'week' ou 'month'" });
    }
    const { from, to } = resolvePeriod(req.query);
    console.info(`[Wallet] GET /stats → userId=${userId}, groupBy=${groupBy}, period=${req.query.period || '-'}, from=${from || '-'}, to=${to || '-'}`);

    const stats = await repos.transactions.getMerchantStats(userId, { groupBy, from, to });
    console.info(`[Wallet] GET /stats ✓ userId=${userId} → balance=${stats.balance}, totals=payin:${stats.totals.payin}/payout:${stats.totals.payout}/net:${stats.totals.net}, ${stats.series.length} bucket(s)`);
    return res.status(200).json({ success: true, data: stats });
  } catch (error) {
    console.error(`[Wallet] GET /stats ❌ userId=${req.user?.uid}: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /wallet/withdraw — demande de retrait.
 * Body : { amount, phone, network, sourceNetwork, receiverName?, narration? }
 * (cf. interface/walletFields.js). `sourceNetwork` = solde débité, choisi par
 * l'utilisateur : aucun repli automatique.
 */
exports.withdrawController = async (req, res) => {
  try {
    const userId = req.user?.uid;
    const { amount, phone, network, sourceNetwork, receiverName, narration } = req.body || {};
    console.info(`[Wallet] POST /withdraw → userId=${userId}, amount=${amount}, source=${sourceNetwork}, network=${network}, phone=${phone}`);

    // R11 : une app antérieure aux deux soldes n'envoie pas `sourceNetwork`.
    // Pas de solde deviné. Seuil en base : `wallet_networks_min_app_version`.
    if (!(await clientSupportsFeature(req, KEYS.WALLET_NETWORKS_MIN_VERSION))) {
      const [{ clientVersion, latestVersion }, s] = await Promise.all([getAppVersionGate(req), getSettings()]);
      const outdated = outdatedWithdrawResponse(latestVersion, s[KEYS.WALLET_NETWORKS_MIN_VERSION]);
      console.warn(`[Wallet] POST /withdraw ✗ userId=${userId} → app ${clientVersion} trop ancienne (${outdated.code})`);
      return res.status(outdated.httpStatus).json(outdated);
    }

    const result = await requestWithdrawal({ userId, amount, phone, network, sourceNetwork, receiverName, narration });
    if (result.success) {
      console.info(`[Wallet] POST /withdraw ✓ userId=${userId} → withdrawalId=${result.data?.withdrawal?.id}, status=${result.data?.status} (débit appliqué au verdict)`);
    } else {
      console.warn(`[Wallet] POST /withdraw ✗ userId=${userId} → ${result.code}: ${result.message}`);
    }
    return res.status(result.httpStatus || (result.success ? 200 : 400)).json(result);
  } catch (error) {
    console.error(`[Wallet] POST /withdraw ❌ userId=${req.user?.uid}: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /wallet/withdraw/quote?amount=&network=&sourceNetwork= — frais d'un
 * retrait avant confirmation (0 même réseau, interréseau via MobileWallet).
 */
exports.getWithdrawQuoteController = async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ success: false, error: 'Non authentifié' });

    const { amount, network, sourceNetwork } = req.query || {};
    const errors = validateWithdrawalQuote({ amount, network, sourceNetwork });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, code: 'invalid_input', message: errors.map(e => `${e.field}: ${e.message}`).join(', ') });
    }

    const result = await quoteWithdrawal({ userId, amount: Number(amount), network, sourceNetwork });
    if (!result.success) {
      console.warn(`[Wallet] GET /withdraw/quote ✗ userId=${userId} → ${result.code}: ${result.message}`);
      return res.status(result.httpStatus || 502).json({ success: false, code: result.code, message: result.message });
    }
    console.info(`[Wallet] GET /withdraw/quote ✓ userId=${userId} → ${sourceNetwork}→${network} amount=${amount} fee=${result.data.fee}`);
    return res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    console.error(`[Wallet] GET /withdraw/quote ❌ userId=${req.user?.uid}: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /wallet/operator/predict — réseau d'un numéro saisi, en temps réel.
 * Relais MobileWallet (clé API côté serveur). Body : { phone }.
 */
exports.predictOperatorController = async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ success: false, error: 'Non authentifié' });

    const phone = String(req.body?.phone ?? '').trim();
    if (phone.replace(/\D/g, '').length < 8) {
      return res.status(400).json({ success: false, code: 'invalid_input', message: 'phone: numéro incomplet' });
    }

    const result = await predictOperator({ phone });
    if (!result.success) {
      return res.status(result.httpStatus || 502).json({ success: false, code: result.code, message: result.message });
    }
    if (!result.network) {
      return res.status(422).json({ success: false, code: 'unknown_operator', message: 'Opérateur non reconnu. Saisissez un numéro MTN ou Orange.' });
    }
    return res.status(200).json({ success: true, data: { phone: result.phone, network: result.network } });
  } catch (error) {
    console.error(`[Wallet] POST /operator/predict ❌ userId=${req.user?.uid}: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
};
