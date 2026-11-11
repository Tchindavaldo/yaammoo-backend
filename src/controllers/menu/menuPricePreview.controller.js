const { previewMenuPrice } = require('../../services/pricing/menuPricePreview');
const { getFastFoodService } = require('../../services/fastfood/getFastFood');
const { getPricingSettings } = require('../../services/settings/settings.service');

const isValid = n => Number.isFinite(n) && n > 0;

/**
 * Deux formes :
 * - `?price=2000`            → `{ data: preview }` (un prix) ;
 * - `?prices=2000,3500,1200` → `{ items: [preview, ...] }` dans l'ordre reçu
 *   (vérification de tous les prix du menu en une requête, bouton « Suivant »).
 */
exports.menuPricePreviewController = async (req, res) => {
  try {
    const { fastFoodId } = req.params;
    const batch = req.query.prices != null;
    const list = batch
      ? String(req.query.prices).split(',').map(Number)
      : [Number(req.query.price)];
    if (!list.length || !list.every(isValid)) {
      return res.status(400).json({ message: 'Paramètre `price` / `prices` invalide.' });
    }
    const fastfood = await getFastFoodService(fastFoodId);
    if (!fastfood) return res.status(404).json({ message: 'Boutique introuvable.' });

    const pricing = await getPricingSettings();
    const items = list.map(p => previewMenuPrice(p, fastfood, pricing));
    res.status(200).json(batch ? { items } : { data: items[0] });
  } catch (error) {
    console.error('Erreur aperçu prix menu :', error);
    res.status(500).json({ message: error.message || 'Erreur serveur.' });
  }
};
