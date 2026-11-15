// Villes du home : chaque ville desservie (`fastfoods.cities`) par au moins une
// boutique VISIBLE au home, avec son nombre de boutiques, et la ville par défaut
// du client : sa ville si une boutique la dessert, sinon la ville de la
// boutique la plus proche, quelle que soit la distance (position `lat`/`lng` de
// la requête ou dernière connue) ; sans position, la ville la mieux fournie.
// Toujours une ville qui a des boutiques (null seulement si aucune n'a de ville).
const { getFastFoodsService } = require('./getFastFoods');
const { withDistances } = require('./fastfoodDistance');
const repos = require('../../repositories');

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

exports.getHomeCities = async ({ userId, query }) => {
  const shops = await getFastFoodsService(userId);
  const list = Array.isArray(shops) ? shops : shops?.items || [];
  const counts = new Map();
  for (const f of list) for (const c of new Set(f.cities || [])) if (c) counts.set(c, (counts.get(c) || 0) + 1);
  const cities = [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  // Marchand (en mode client) : la ville de SA boutique, sans choix.
  const own = userId ? await repos.fastfoods.getByUserId(userId).catch(() => null) : null;
  const ownCity = own?.cities?.[0] || null;
  if (ownCity) return { cities, defaultCity: ownCity, total: list.length, merchantCity: ownCity };

  // Ville du client (géocodage de l'app, `?userCity=`) desservie ?
  const userCity = norm(query?.userCity);
  let defaultCity = userCity ? cities.find(c => norm(c.name) === userCity || userCity.includes(norm(c.name)))?.name || null : null;
  if (!defaultCity) {
    const withDist = await withDistances(list.filter(f => (f.cities || []).length), { userId, query });
    const nearest = withDist.filter(f => f.distanceKm != null).sort((a, b) => a.distanceKm - b.distanceKm)[0];
    // Ville la plus proche qui A des boutiques, quelle que soit la distance
    // (autre pays compris). Sans position connue : la ville la mieux fournie.
    defaultCity = nearest ? nearest.cities[0] : cities[0]?.name || null;
  }
  return { cities, defaultCity, total: list.length };
};
