// ============================================================================
// getMerchantStats.service — Stats du hero du home marchand.
// ============================================================================
// Reserve au proprietaire de la boutique. Agregats SQL : merchant_stats
// (migration 070). Le solde vient de getMerchantBalance (source unique).
// ============================================================================
const repos = require('../../repositories');

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const BUCKETS = ['day', 'week', 'month'];

exports.getMerchantStats = async (fastFoodId, viewerUid, { from, to, bucket }) => {
  if (!ISO.test(from || '') || !ISO.test(to || '') || from > to) return { success: false, code: 400, message: 'from / to (YYYY-MM-DD) invalides' };
  if (!BUCKETS.includes(bucket)) return { success: false, code: 400, message: 'bucket : day | week | month' };

  const ff = await repos.fastfoods.getById(fastFoodId);
  if (!ff) return { success: false, code: 404, message: 'FastFood non trouvé' };
  if (ff.userId !== viewerUid) return { success: false, code: 403, message: 'Réservé au propriétaire de la boutique' };

  const [stats, balance] = await Promise.all([
    repos.fastfoods.getMerchantStats(fastFoodId, from, to, bucket),
    repos.transactions.getMerchantBalance(viewerUid),
  ]);
  return { success: true, data: { ...stats, balance: Number(balance?.balance) || 0 } };
};
