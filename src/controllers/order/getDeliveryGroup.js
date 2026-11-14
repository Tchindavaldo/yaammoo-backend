const repos = require('../../repositories');
const { openPaidGroups, OPEN_STATUSES } = require('../../services/order/paidDeliveryGroups.service');

/**
 * GET /order/delivery-group/:userId?fastFoodId&zone&type&date&time
 * Le client a-t-il déjà payé une commande pour ce départ, pas encore partie ?
 * Oui => la course de sa nouvelle commande est offerte (groupage).
 * Sans `zone` : liste des départs déjà payés et pas encore partis de cette
 * boutique (`data.departures` : zone, type, date, time), pour marquer les
 * zones et créneaux concernés dans les listes de l'app.
 */
exports.getDeliveryGroup = async (req, res) => {
  try {
    const { userId } = req.params;
    const { fastFoodId, zone, type, date, time } = req.query;
    if (fastFoodId && !zone) {
      const open = await repos.orders.query({ userId, fastFoodId, status: OPEN_STATUSES });
      const seen = new Set();
      const departures = [];
      for (const o of open) {
        const d = o.delivery || {};
        if (!d.status || !d.zone) continue;
        const t = d.type === 'express' ? 'express' : 'time';
        const dep = { zone: d.zone, type: t, date: d.date || null, time: t === 'time' ? d.time || null : null };
        const k = JSON.stringify(dep);
        if (!seen.has(k)) seen.add(k), departures.push(dep);
      }
      return res.status(200).json({ success: true, data: { departures } });
    }
    if (!fastFoodId || !zone || !type || !date) {
      return res.status(400).json({ success: false, message: 'fastFoodId, zone, type et date requis.' });
    }
    const probe = { fastFoodId, delivery: { status: true, zone, type, date, time: type === 'time' ? time : undefined } };
    const found = (await openPaidGroups(userId, [probe])).values().next().value || null;
    return res.status(200).json({ success: true, data: { grouped: !!found, orderId: found?.orderId ?? null } });
  } catch (error) {
    console.error('[getDeliveryGroup]', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur lors de la vérification du groupage.', error: error.message });
  }
};
