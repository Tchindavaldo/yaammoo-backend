// Controller des villes de livraison : GET /cities (public), PATCH /cities/:id (admin).
const citiesService = require('../../services/cities/cities.service');

exports.listCities = async (req, res) => {
  try {
    const cities = await citiesService.list();
    return res.status(200).json({ success: true, data: cities });
  } catch (error) {
    console.error('[cities] list', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.', error: error.message });
  }
};

exports.updateCity = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'Id de ville invalide.' });
    const r = await citiesService.update(id, req.body || {});
    if (r.status !== 200) return res.status(r.status).json({ success: false, message: r.message });
    return res.status(200).json({ success: true, data: r.city, renamedShops: r.renamedShops });
  } catch (error) {
    console.error('[cities] update', error);
    const dup = error?.code === '23505';
    return res.status(dup ? 400 : 500).json({ success: false, message: dup ? 'Une ville porte deja ce nom.' : 'Erreur serveur.', error: error.message });
  }
};
