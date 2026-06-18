// ============================================================================
// wallet.controller — Portefeuille marchand (solde, historique, retrait)
// ============================================================================
// Le marchand est identifié par req.user.uid (Bearer Firebase). Le solde est
// calculé depuis les transactions (pas de champ figé).
// ============================================================================

const repos = require('../../repositories');
const { requestWithdrawal } = require('../../services/wallet/withdraw.service');
const { resolvePeriod } = require('../../utils/period');

/** GET /wallet/balance — solde du marchand authentifié. */
exports.getBalanceController = async (req, res) => {
  try {
    const userId = req.user?.uid;
    console.info(`[Wallet] GET /balance → userId=${userId}`);
    if (!userId) return res.status(401).json({ success: false, error: 'Non authentifié' });

    const balance = await repos.transactions.getMerchantBalance(userId);
    console.info(`[Wallet] GET /balance ✓ userId=${userId} → balance=${balance.balance}, earned=${balance.totalEarned}, withdrawn=${balance.totalWithdrawn}`);
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

/** POST /wallet/withdraw — demande de retrait. */
exports.withdrawController = async (req, res) => {
  try {
    const userId = req.user?.uid;
    const { amount, phone, network } = req.body || {};
    console.info(`[Wallet] POST /withdraw → userId=${userId}, amount=${amount}, network=${network}, phone=${phone}`);

    const result = await requestWithdrawal({ userId, amount, phone, network });
    if (result.success) {
      console.info(`[Wallet] POST /withdraw ✓ userId=${userId} → withdrawalId=${result.data?.withdrawal?.id}, newBalance=${result.data?.newBalance}`);
    } else {
      console.warn(`[Wallet] POST /withdraw ✗ userId=${userId} → ${result.code}: ${result.message}`);
    }
    return res.status(result.httpStatus || (result.success ? 200 : 400)).json(result);
  } catch (error) {
    console.error(`[Wallet] POST /withdraw ❌ userId=${req.user?.uid}: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
};
