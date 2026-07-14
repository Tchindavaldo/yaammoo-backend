// controllers/fastfood/searchFastfood.js
const repos = require('../../repositories');

// GET /fastFood/search?q=  → { data: StoreOption[] } ({ id, nom })
exports.searchFastfoodController = async (req, res) => {
  try {
    const q = req.query.q;
    const data = await repos.fastfoods.searchByName(q);
    return res.status(200).json({ success: true, message: 'Boutiques trouvées.', data });
  } catch (error) {
    console.error('Erreur recherche boutique :', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};
