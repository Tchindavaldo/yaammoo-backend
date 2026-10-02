// ============================================================================
// Analytics — ingestion (app) et statistiques (admin). Migration 061.
// ============================================================================
// POST /analytics/events : l'utilisateur est `req.user.uid`, jamais le corps.
// GET  /analytics/*      : réservés à l'admin (`authorize(adminOnly)`).
// ============================================================================
const { validateAnalyticsBatch } = require('../../utils/validator/validateAnalyticsBatch');
const { ingestAnalyticsBatch } = require('../../services/analytics/analyticsIngest.service');
const stats = require('../../services/analytics/analyticsStats.service');

const fail = (res, where, error) => {
  console.error(`${where}:`, error);
  return res.status(500).json({ success: false, message: error.message });
};

exports.recordAnalyticsEvents = async (req, res) => {
  try {
    const body = req.body || {};
    const errors = validateAnalyticsBatch(body);
    if (errors.length > 0) return res.status(400).json({ success: false, message: errors });

    const result = await ingestAnalyticsBatch(req.user.uid, body);
    return result.status < 300
      ? res.status(result.status).json({ success: true, data: result.data })
      : res.status(result.status).json({ success: false, message: result.message });
  } catch (error) {
    return fail(res, 'recordAnalyticsEvents', error);
  }
};

/** Enveloppe une lecture admin : parse la période puis renvoie `{ data }`. */
const read = (where, run) => async (req, res) => {
  try {
    const range = stats.parseRange(req.query);
    if (range.error) return res.status(400).json({ success: false, message: range.error });
    return res.status(200).json({ success: true, data: await run(req, range) });
  } catch (error) {
    return fail(res, where, error);
  }
};

exports.getOnlineUsers = read('getOnlineUsers', () => stats.getOnline());

exports.getConnections = read('getConnections', (req, range) => stats.listConnections({ ...range, userId: req.query.userId }));

exports.getEvents = read('getEvents', (req, range) =>
  stats.listEvents({ ...range, userId: req.query.userId, type: req.query.type, fastFoodId: req.query.fastFoodId })
);

exports.getUserSummary = read('getUserSummary', (req, range) => stats.getUserSummary(req.params.userId, range));

/** GET /analytics/<path> → agrégat SQL `analytics_<name>`. */
exports.aggregate = name => read(`aggregate:${name}`, (req, range) => stats.aggregate(name, range));
