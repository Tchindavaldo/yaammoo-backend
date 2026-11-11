const { previewMenuPrice } = require('../../services/pricing/menuPricePreview');
const { getFastFoodService } = require('../../services/fastfood/getFastFood');
const { getPricingSettings } = require('../../services/settings/settings.service');

exports.menuPricePreviewController = async (req, res) => {
  try {
    const { fastFoodId } = req.params;
    const price = Number(req.query.price);
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ message: 'Paramètre `price` invalide.' });
    }
    const fastfood = await getFastFoodService(fastFoodId);
    if (!fastfood) return res.status(404).json({ message: 'Boutique introuvable.' });

    const data = previewMenuPrice(price, fastfood, await getPricingSettings());
    res.status(200).json({ data });
  } catch (error) {
    console.error('Erreur aperçu prix menu :', error);
    res.status(500).json({ message: error.message || 'Erreur serveur.' });
  }
};
