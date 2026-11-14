// ============================================================================
// deliveryConfig.controller — Qui livre une boutique, et à quel tarif (ADMIN)
// ============================================================================
// `deliveryBy` et `platformDeliveryZones` décident de la répartition de l'argent
// d'une commande : en régime `platform`, la course quitte le fastfood pour aller
// au livreur, et le prix affiché est calé sur un multiple du pas d'arrondi.
// C'est une décision COMMERCIALE, jamais celle du marchand — d'où `adminGuard`
// sur les deux routes.
//
// ⚠️ Basculer en `platform` SANS zones configurées mettrait le supplément
// livraison à 0 : le prix affiché ne couvrirait plus la course, et le livreur ne
// toucherait rien. La bascule est donc refusée tant que la boutique n'a pas de
// zones — soit déjà en base, soit fournies dans la même requête.
// ============================================================================

const repos = require('../../repositories');
const { DELIVERY_BY_VALUES } = require('../../services/pricing/deliveryPricing');
const { sanitizeDeliveryHours, sanitizeExpressZones } = require('../../utils/deliveryHoursSanitize');

/**
 * Au moins une zone exploitable : un créneau PÉRIODIQUE pourvu de zones
 * (`platformDeliveryZones`), ou une zone EXPRESS (`platformExpressZones`).
 */
function hasZones(hours, expressZones) {
  const periodic = Array.isArray(hours) && hours.some(h => h && typeof h === 'object' && h.periodicZones?.length > 0);
  return periodic || (Array.isArray(expressZones) && expressZones.length > 0);
}

/**
 * Valide le couple demandé et renvoie les champs à écrire.
 * @returns {{ patch: Object }|{ error: string }}
 */
function buildPatch(body, current) {
  const patch = {};

  if (body.deliveryBy !== undefined) {
    if (!DELIVERY_BY_VALUES.includes(body.deliveryBy)) {
      return { error: `deliveryBy doit valoir ${DELIVERY_BY_VALUES.join(' ou ')}.` };
    }
    patch.deliveryBy = body.deliveryBy;
  }

  // Créneaux PÉRIODIQUES de la plateforme : même nettoyage que `deliveryHours`
  // (l'express n'y est plus porté, migration 073).
  if (body.platformDeliveryZones !== undefined) {
    if (!Array.isArray(body.platformDeliveryZones)) {
      return { error: 'platformDeliveryZones doit être un tableau (même forme que deliveryHours).' };
    }
    patch.platformDeliveryZones = sanitizeDeliveryHours(body.platformDeliveryZones);
  }

  // Zones EXPRESS de la plateforme : une liste, sans heure (migration 073).
  if (body.platformExpressZones !== undefined) {
    if (!Array.isArray(body.platformExpressZones)) {
      return { error: 'platformExpressZones doit être un tableau de zones { lieu, prix }.' };
    }
    patch.platformExpressZones = sanitizeExpressZones(body.platformExpressZones);
  }

  if (Object.keys(patch).length === 0) {
    return { error: 'Rien à modifier : fournir deliveryBy, platformDeliveryZones et/ou platformExpressZones.' };
  }

  // Garde-fou : le régime plateforme n'a aucun sens sans tarif de course.
  const finalRegime = patch.deliveryBy ?? current?.deliveryBy;
  const finalZones = patch.platformDeliveryZones ?? current?.platformDeliveryZones;
  const finalExpress = patch.platformExpressZones ?? current?.platformExpressZones;
  if (finalRegime === 'platform' && !hasZones(finalZones, finalExpress)) {
    return { error: 'Impossible de passer en livraison plateforme sans zones : le supplément livraison tomberait à 0 et le livreur ne serait pas payé.' };
  }

  return { patch };
}

/** PATCH /fastfood/:id/delivery — une boutique. */
exports.patchFastFoodDeliveryController = async (req, res) => {
  try {
    const id = req.params.fastFoodId;
    const fastfood = await repos.fastfoods.getById(id);
    if (!fastfood) return res.status(404).json({ success: false, message: "Cette boutique n'existe pas." });

    const { patch, error } = buildPatch(req.body || {}, fastfood);
    if (error) return res.status(400).json({ success: false, message: error });

    await repos.fastfoods.update(id, patch);
    const updated = await repos.fastfoods.getById(id);

    return res.status(200).json({ success: true, message: 'Configuration de livraison mise à jour.', data: updated });
  } catch (error) {
    console.error('patchFastFoodDelivery:', error.message);
    return res.status(500).json({ success: false, message: 'Erreur serveur.', error: error.message });
  }
};

/**
 * PATCH /fastfood/delivery — TOUTES les boutiques.
 *
 * Utile pour amorcer un parc entier (poser les mêmes zones plateforme partout)
 * sans toucher 200 boutiques une par une. Chaque boutique est validée
 * séparément : celles qui ne peuvent pas basculer sont listées en `skipped`
 * plutôt que de faire échouer tout le lot.
 */
exports.patchAllFastFoodsDeliveryController = async (req, res) => {
  try {
    const all = await repos.fastfoods.getAll();
    const updated = [];
    const skipped = [];

    for (const fastfood of all || []) {
      const { patch, error } = buildPatch(req.body || {}, fastfood);
      if (error) {
        skipped.push({ id: fastfood.id, name: fastfood.name ?? null, reason: error });
        continue;
      }
      try {
        await repos.fastfoods.update(fastfood.id, patch);
        updated.push(fastfood.id);
      } catch (e) {
        skipped.push({ id: fastfood.id, name: fastfood.name ?? null, reason: e.message });
      }
    }

    return res.status(200).json({
      success: true,
      message: `${updated.length} boutique(s) mise(s) à jour, ${skipped.length} ignorée(s).`,
      data: { updated, skipped },
    });
  } catch (error) {
    console.error('patchAllFastFoodsDelivery:', error.message);
    return res.status(500).json({ success: false, message: 'Erreur serveur.', error: error.message });
  }
};
