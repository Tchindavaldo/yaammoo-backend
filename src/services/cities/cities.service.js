// Villes de livraison (table cities, migration 095). Lu par GET /cities (app :
// creation et edition de boutique), modifie par PATCH /cities/:id (admin).
// Renommage : repercute dans fastfoods.cities de chaque boutique. Retrait : active=false,
// les boutiques gardent la ville.
const repos = require('../../repositories');
const { broadcastFastfoodViews } = require('../fastfood/fastfoodsChanged');

exports.list = ({ includeInactive } = {}) => repos.cities.list({ includeInactive });

exports.update = async (id, { name, region, active }) => {
  const city = await repos.cities.getById(id);
  if (!city) return { status: 404, message: 'Ville introuvable.' };
  const patch = {};
  const newName = typeof name === 'string' ? name.trim() : undefined;
  if (newName !== undefined) {
    if (!newName) return { status: 400, message: 'Nom de ville vide.' };
    patch.name = newName;
  }
  if (typeof region === 'string') patch.region = region.trim() || null;
  if (typeof active === 'boolean') patch.active = active;
  if (!Object.keys(patch).length) return { status: 400, message: 'Rien a modifier (name, region, active).' };
  const updated = await repos.cities.update(id, patch);
  let shops = [];
  if (patch.name && patch.name !== city.name) {
    shops = await repos.fastfoods.renameCity(city.name, patch.name);
    if (shops.length) broadcastFastfoodViews(shops, 'city_renamed');
  }
  return { status: 200, city: updated, renamedShops: shops.length };
};
