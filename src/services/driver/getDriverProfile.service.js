// ============================================================================
// getDriverProfile.service — Profil d'un livreur, ADAPTÉ au demandeur
// ============================================================================
// Le livreur EST un user (driverId = son uid). Ce qu'on renvoie dépend de QUI
// fait la requête (viewerUid) :
//
//   • Simple user (autre)      → profil PUBLIC : uid, nom/prénom (fallback email
//                                si vides), photo, note (driverRatingAvg/Count),
//                                boutiques servies.
//   • Marchand (fastFood qui a CE livreur accepté)
//                                → idem + stats POUR SA boutique : nb livrées
//                                (terminées), en cours, en attente.
//   • Le livreur lui-même        → idem + stats GLOBALES (toutes boutiques).
//
// Aucune donnée sensible n'est exposée (jamais email/password/pushTokens bruts —
// l'email ne sert QUE de fallback d'affichage du nom).
// ============================================================================
const repos = require('../../repositories');
const { countBuckets } = require('../../utils/orderBuckets');

const buildDisplayName = (infos = {}) => {
  const nom = (infos.nom || '').trim();
  const prenom = (infos.prenom || '').trim();
  if (nom || prenom) return { nom: nom || null, prenom: prenom || null, displayName: `${prenom} ${nom}`.trim() };
  // Fallback : partie locale de l'email (avant @) si pas de nom/prénom.
  const email = infos.email || '';
  const fallback = email.includes('@') ? email.split('@')[0] : (email || null);
  return { nom: null, prenom: null, displayName: fallback };
};

// Photo : pas de colonne dédiée sur users → pass-through extra_data.
const pickPhoto = (user) => user.photo || user.image || user.avatar || user.photoURL || null;

/**
 * @param {string} driverId  uid du livreur
 * @param {string} viewerUid uid de l'appelant (req.user.uid)
 */
exports.getDriverProfile = async (driverId, viewerUid) => {
  if (!driverId) return { success: false, code: 400, message: 'driverId est requis' };

  const user = await repos.users.getUserByIdSafe(driverId);
  if (!user) return { success: false, code: 404, message: 'Livreur non trouvé' };

  // Un profil livreur n'a de sens que si le user est livreur.
  const isDriver = !!user.driverId;
  if (!isDriver) return { success: false, code: 404, message: "Cet utilisateur n'est pas un livreur" };

  const name = buildDisplayName(user.infos);

  // --- Bloc public (toujours renvoyé) ---
  const publicProfile = {
    uid: user.uid,
    isDriver: true,
    nom: name.nom,
    prenom: name.prenom,
    displayName: name.displayName,
    photo: pickPhoto(user),
    ratingAvg: user.driverRatingAvg ?? 0,
    ratingCount: user.driverRatingCount ?? 0,
  };

  // --- Qui regarde ? ---
  const isSelf = viewerUid && viewerUid === driverId;

  // Marchand : le viewer possède un fastFood ET ce livreur y est accepté.
  let viewerFastFoodId = null;
  if (viewerUid && !isSelf) {
    const viewerFf = await repos.fastfoods.getByUserId(viewerUid);
    if (viewerFf?.id) {
      const accepted = await repos.driverApplications.getByUser(driverId, { status: 'accepted' });
      const servesViewer = (accepted || []).some((app) => app.fastFoodId === viewerFf.id);
      if (servesViewer) viewerFastFoodId = viewerFf.id;
    }
  }

  // Boutiques servies (info non sensible, utile aux 3 vues).
  const accepted = await repos.driverApplications.getByUser(driverId, { status: 'accepted' });
  publicProfile.stores = (accepted || []).map((app) => ({ fastFoodId: app.fastFoodId }));

  // Simple user (ni self, ni marchand de ce livreur) → profil public +
  // contexte PERSONNEL à la relation user↔livreur :
  //   • myStats     : ses commandes livrées/en cours/en attente PAR ce livreur.
  //   • canRate     : a-t-il une commande livrée non encore notée ? (→ le front
  //                   propose « Noter ce livreur » seulement si vrai).
  //   • hasRated    : a-t-il déjà noté ce livreur ?
  if (!isSelf && !viewerFastFoodId) {
    if (viewerUid) {
      const myOrders = (await repos.orders.getByDriver(driverId)).filter((o) => o.userId === viewerUid);
      const myStats = countBuckets(myOrders);
      const existingRating = await repos.ratings.getUserRating({
        targetType: 'driver',
        targetId: driverId,
        userId: viewerUid,
      });
      publicProfile.myStats = myStats;
      publicProfile.hasRated = !!existingRating;
      // Peut noter s'il a été livré au moins une fois ET n'a pas encore noté.
      publicProfile.canRate = myStats.delivered > 0 && !existingRating;
    }
    return { success: true, scope: 'public', data: publicProfile };
  }

  // Self ou marchand → on ajoute les stats commandes.
  const allOrders = await repos.orders.getByDriver(driverId);

  if (isSelf) {
    // Stats GLOBALES (toutes boutiques).
    return {
      success: true,
      scope: 'self',
      data: { ...publicProfile, stats: countBuckets(allOrders) },
    };
  }

  // Marchand → stats limitées à SA boutique.
  const scoped = allOrders.filter((o) => o.fastFoodId === viewerFastFoodId);
  return {
    success: true,
    scope: 'merchant',
    data: { ...publicProfile, fastFoodId: viewerFastFoodId, stats: countBuckets(scoped) },
  };
};
