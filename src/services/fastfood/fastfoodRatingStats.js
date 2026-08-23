// ============================================================================
// Note d'une boutique — dérivée de ses plats
// ============================================================================
// Aucune table ne stocke de note de boutique : on ne note que les PLATS
// (`menus.rating_avg` / `rating_count`, cf. architecture/ratings.md). La note
// affichée sur une carte du home est donc la synthèse des notes de ses plats,
// calculée à la volée à partir des menus déjà chargés — aucune requête en plus.
// ============================================================================

// Plancher de la note de boutique. Il joue DEUX fois :
//   • aucun plat noté      → la boutique s'affiche à 3, pas à 0. Une boutique
//     neuve n'est pas mauvaise, elle est seulement nouvelle.
//   • moyenne calculée < 3 → ramenée à 3.
//
// ⚠️ Le plancher ne s'applique qu'à la note AGRÉGÉE de la boutique. La note de
// chaque plat (`menus[].ratingAvg`) reste servie telle quelle : c'est la donnée
// réelle, et la relever mentirait sur un plat précis.
const MIN_RATING = 3;

/**
 * @param {Object[]} menus plats de la boutique, portant `ratingAvg`/`ratingCount`.
 * @returns {{rating: number, count: number}} `count` = total des votes reçus par
 *   l'ensemble des plats (0 si aucun) ; `rating` = moyenne de ces votes, jamais
 *   sous `MIN_RATING`.
 */
const buildRatingStats = menus => {
  let votes = 0;
  let weighted = 0;

  for (const menu of menus || []) {
    const count = Number(menu?.ratingCount) || 0;
    // Un plat jamais noté est IGNORÉ, il ne compte pas comme une note moyenne :
    // l'inclure ferait bouger la note de la boutique à chaque ajout au
    // catalogue, sans qu'aucun client n'ait rien voté.
    if (count <= 0) continue;
    votes += count;
    // Pondéré par le nombre de votes, jamais une moyenne de moyennes : un plat
    // noté 5 une seule fois ne doit pas peser autant qu'un plat noté 4 par 200
    // clients.
    weighted += (Number(menu?.ratingAvg) || 0) * count;
  }

  if (votes === 0) return { rating: MIN_RATING, count: 0 };

  const average = Math.round((weighted / votes) * 10) / 10;

  return { rating: Math.max(average, MIN_RATING), count: votes };
};

module.exports = { buildRatingStats, MIN_RATING };
