// ============================================================================
// driverApplication.service — Candidatures livreur
// ============================================================================
// Flux :
//   1. Un user postule pour devenir livreur d'une ou plusieurs boutiques →
//      applyAsDriver({ userId, fastFoodIds }) crée une demande `pending` par
//      boutique (les doublons pending/accepted sont ignorés).
//   2. Le fastFood consulte les demandes reçues → getApplications().
//   3. Le fastFood décide → decideApplication() :
//        - `accepted` : pose user.driverId = uid du user (marqueur isDriver)
//          + passe la demande à `accepted`.
//        - `refused`  : passe la demande à `refused`.
//   4. Le fastFood liste ses livreurs → getDrivers() (demandes `accepted`).
//   5. Le livreur liste les boutiques qu'il sert → getStores() (demandes `accepted`).
//
// `user.driverId` = **uid du user lui-même** (marqueur : le front dérive
// `isDriver = !!driverId`). Un livreur pouvant servir PLUSIEURS boutiques,
// l'appartenance boutique↔livreur est portée par les lignes `driver_applications`
// en status `accepted` (et NON par user.driverId).
// `order.driverId` = ce même uid, posé sur UNE commande lors de l'assignation
// (cf. driverOrders.service).
// ============================================================================

const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { getFastFoodService } = require('../fastfood/getFastFood');
const { notifyOrderEvent } = require('../notification/helpers/notifyOrderEvent');

const DECISIONS = new Set(['accepted', 'refused']);

// ── Events + push + notif BD ──────────────────────────────────────────────
// À la création d'une demande → prévenir le marchand de la boutique.
const notifyApplicationCreated = async (application, candidate) => {
  try {
    const fastfood = await getFastFoodService(application.fastFoodId);
    const merchantUserId = fastfood?.userId;
    if (!merchantUserId) return;
    const data = {
      ...application,
      user: candidate ? { uid: candidate.uid || candidate.id, infos: candidate.infos } : null,
    };
    getIO().to(merchantUserId).emit('driverApplicationCreated', { data });
    const name = candidate?.infos ? `${candidate.infos.prenom || ''} ${candidate.infos.nom || ''}`.trim() : '';
    await notifyOrderEvent({
      targetUserId: merchantUserId,
      type: 'driver_application',
      title: 'Nouvelle demande de livreur',
      body: `${name || 'Un utilisateur'} souhaite devenir livreur`,
      orderId: application.id,
      route: 'settings?section=drivers',
    });
  } catch (e) {
    console.warn('[driver] notifyApplicationCreated:', e.message);
  }
};

// À la décision → prévenir le candidat (room = son uid).
const notifyApplicationDecided = async (application) => {
  try {
    const accepted = application.status === 'accepted';
    const payload = { data: application };
    // role = état résultant du user (requis si accepted ; omis sur refused).
    if (accepted) payload.role = { isDriver: true, driverId: application.userId };
    getIO().to(application.userId).emit('driverApplicationDecided', payload);
    const fastfood = await repos.fastfoods.getById(application.fastFoodId);
    // Écho vers le marchand (sa propre room) pour rafraîchir ses listes.
    // user.infos OBLIGATOIRE ici (sinon le livreur ajouté s'affiche « Utilisateur »).
    if (fastfood?.userId) {
      const candidate = await repos.users.getUserByIdSafe(application.userId);
      const data = { ...application, user: candidate ? { uid: candidate.uid || candidate.id, infos: candidate.infos } : null };
      getIO().to(fastfood.userId).emit('merchantDriverApplicationDecided', { data });
    }
    const ffName = fastfood?.name || 'la boutique';
    await notifyOrderEvent({
      targetUserId: application.userId,
      type: 'driver_application_decided',
      title: accepted ? 'Candidature acceptée' : 'Candidature refusée',
      body: accepted ? `Vous êtes maintenant livreur de ${ffName}` : `Votre demande pour ${ffName} a été refusée`,
      orderId: application.id,
      route: 'settings?section=my-applications',
    });
  } catch (e) {
    console.warn('[driver] notifyApplicationDecided:', e.message);
  }
};

const publicUser = (user) => {
  if (!user) return null;
  return {
    uid: user.uid || user.id,
    infos: user.infos,
    driverId: user.driverId,
    isDriver: !!user.driverId,
  };
};

const storeOption = (fastfood) => (fastfood ? { id: fastfood.id, nom: fastfood.name } : null);

exports.applyAsDriver = async ({ userId, fastFoodIds }) => {
  if (!userId) return { success: false, code: 400, message: 'userId est requis' };
  const ids = Array.isArray(fastFoodIds) ? fastFoodIds.filter(Boolean) : [];
  if (ids.length === 0) return { success: false, code: 400, message: 'fastFoodIds[] est requis' };

  const user = await repos.users.getUserByIdSafe(userId);
  if (!user) return { success: false, code: 404, message: 'Utilisateur non trouvé' };

  // Idempotence par couple (userId, fastFoodId) : au plus une ligne par boutique.
  const existing = await repos.driverApplications.getByUser(userId);
  const byFastFood = new Map(existing.map((a) => [a.fastFoodId, a]));

  const created = [];      // nouvelles demandes
  const reactivated = [];  // demandes refused repassées à pending (relance)
  const skipped = [];      // déjà pending/accepted, ou boutique invalide
  for (const fastFoodId of ids) {
    const ex = byFastFood.get(fastFoodId);
    if (ex) {
      // Déjà en attente ou déjà livreur → ne rien changer (pas de doublon).
      if (ex.status === 'pending' || ex.status === 'accepted') {
        skipped.push(fastFoodId);
        continue;
      }
      // refused → « Relancer » : on repasse la MÊME ligne à pending (upsert).
      const updated = await repos.driverApplications.updateStatus(ex.id, 'pending');
      reactivated.push(updated);
      continue;
    }
    // Boutique existe ? (ignore silencieusement les ids invalides)
    const exists = await repos.fastfoods.exists(fastFoodId);
    if (!exists) {
      skipped.push(fastFoodId);
      continue;
    }
    const application = await repos.driverApplications.create({ userId, fastFoodId, status: 'pending' });
    created.push(application);
  }

  const total = created.length + reactivated.length;
  if (total === 0) {
    return { success: false, code: 409, message: 'Aucune demande à traiter (déjà en attente/livreur ou boutiques invalides)', data: { created, reactivated, skipped } };
  }

  // Events + push + notif BD vers les marchands concernés (non bloquant).
  await Promise.all([...created, ...reactivated].map((app) => notifyApplicationCreated(app, user)));

  return { success: true, message: `${total} demande(s) envoyée(s)`, data: { created, reactivated, skipped } };
};

exports.getApplications = async (fastFoodId) => {
  if (!fastFoodId) throw new Error('fastFoodId requis');
  const applications = await repos.driverApplications.getByFastFood(fastFoodId);
  // Enrichir chaque demande avec les infos du candidat (affichage marchand).
  return Promise.all(
    applications.map(async (app) => {
      const user = await repos.users.getUserByIdSafe(app.userId);
      return { ...app, user: publicUser(user) };
    })
  );
};

exports.getDrivers = async (fastFoodId) => {
  if (!fastFoodId) throw new Error('fastFoodId requis');
  const accepted = await repos.driverApplications.getByFastFood(fastFoodId, { status: 'accepted' });
  return Promise.all(
    accepted.map(async (app) => {
      const user = await repos.users.getUserByIdSafe(app.userId);
      return publicUser(user);
    })
  );
};

exports.getMyApplications = async (userId) => {
  if (!userId) throw new Error('userId requis');
  const applications = await repos.driverApplications.getByUser(userId);
  return Promise.all(
    applications.map(async (app) => {
      const fastfood = await repos.fastfoods.getById(app.fastFoodId);
      return { ...app, fastFoodName: fastfood?.name || null };
    })
  );
};

exports.getStores = async (driverId) => {
  if (!driverId) throw new Error('driverId requis');
  const accepted = await repos.driverApplications.getByUser(driverId, { status: 'accepted' });
  const stores = await Promise.all(
    accepted.map(async (app) => {
      const fastfood = await repos.fastfoods.getById(app.fastFoodId);
      return storeOption(fastfood);
    })
  );
  return stores.filter(Boolean);
};

// Le marchand retire un livreur de son équipe. On supprime l'association
// (userId, fastFoodId). user.driverId n'est vidé que s'il ne sert plus AUCUNE
// autre boutique (sinon il reste livreur ailleurs).
exports.removeDriver = async (driverId, fastFoodId) => {
  if (!driverId) return { success: false, code: 400, message: 'driverId est requis' };
  if (!fastFoodId) return { success: false, code: 400, message: 'fastFoodId est requis' };

  await repos.driverApplications.deleteByUserFastFood({ userId: driverId, fastFoodId });

  const remaining = await repos.driverApplications.getByUser(driverId, { status: 'accepted' });
  const stillDriver = remaining.length > 0;
  if (!stillDriver) {
    // Plus aucune boutique servie → isDriver retombe à false.
    await repos.users.updateUser(driverId, { driverId: null });
  }
  // État résultant du rôle : false+null si c'était sa dernière boutique, sinon true+uid.
  const role = { isDriver: stillDriver, driverId: stillDriver ? driverId : null };

  // Event + push + notif BD vers le livreur retiré.
  try {
    getIO().to(driverId).emit('driverRemoved', { data: { fastFoodId }, role });
    const fastfood = await repos.fastfoods.getById(fastFoodId);
    // Écho vers le marchand (sa propre room) pour rafraîchir sa liste de livreurs.
    if (fastfood?.userId) getIO().to(fastfood.userId).emit('merchantDriverRemoved', { data: { driverId } });
    const ffName = fastfood?.name || 'une boutique';
    await notifyOrderEvent({
      targetUserId: driverId,
      type: 'driver_removed',
      title: 'Retrait de l\'équipe de livraison',
      body: `Vous ne livrez plus pour ${ffName}`,
      orderId: fastFoodId,
      route: 'settings?section=my-applications',
    });
  } catch (e) {
    console.warn('[driver] notifyDriverRemoved:', e.message);
  }

  return { success: true, message: 'Livreur retiré' };
};

exports.decideApplication = async (applicationId, decision) => {
  if (!applicationId) return { success: false, code: 400, message: 'applicationId est requis' };
  if (!DECISIONS.has(decision)) {
    return { success: false, code: 400, message: `Décision invalide : ${decision} (attendu accepted|refused)` };
  }

  const application = await repos.driverApplications.getById(applicationId);
  if (!application) return { success: false, code: 404, message: 'Demande non trouvée' };
  if (application.status !== 'pending') {
    return { success: false, code: 409, message: `Demande déjà traitée (${application.status})` };
  }

  if (decision === 'accepted') {
    // Marqueur isDriver : user.driverId = son propre uid (idempotent).
    await repos.users.updateUser(application.userId, { driverId: application.userId });
  }

  const updated = await repos.driverApplications.updateStatus(applicationId, decision);

  // Event + push + notif BD vers le candidat.
  await notifyApplicationDecided(updated);

  return {
    success: true,
    message: decision === 'accepted' ? 'Candidature acceptée' : 'Candidature refusée',
    data: updated,
  };
};
