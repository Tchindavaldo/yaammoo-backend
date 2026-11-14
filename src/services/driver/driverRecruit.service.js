// ============================================================================
// driverRecruit.service — le marchand ajoute un livreur lui-même
// ============================================================================
// Trois modes (POST /driver/recruit/:fastFoodId) :
//   - create : cree le compte (numero + email + mot de passe) s'il n'existe pas,
//              puis le livreur est accepte tout de suite ;
//   - add    : utilisateur existant (par numero OU email), accepte tout de suite ;
//   - invite : utilisateur existant, ligne `invited` ; il accepte ou refuse
//              (PUT /driver/invitations/:applicationId).
// Un compte deja existant recoit toujours une notification (add / invite /
// create sur un numero deja inscrit).
// L'appartenance reste portee par driver_applications `accepted`.
// ============================================================================
const repos = require('../../repositories');
const settingsService = require('../settings/settings.service');
const { getIO } = require('../../socket');
const { normalizePhoneNumber, phoneVariants } = require('../../utils/validator/validatePhoneNumber');
const { resolveStaffAccount } = require('../staff/staffAccount.service');
const { notifyOrderEvent } = require('../notification/helpers/notifyOrderEvent');
const { RecruitDriverFields } = require('../../interface/driverFields');

const MODES = new Set(['create', 'add', 'invite']);
const ko = (code, message) => ({ success: false, code, message });
const uidOf = u => u.uid || u.id;

const echoMerchant = (fastfood, application, user) => {
  if (!fastfood?.userId) return;
  const data = { ...application, user: user ? { uid: uidOf(user), infos: user.infos } : null };
  getIO().to(fastfood.userId).emit('merchantDriverApplicationDecided', { data });
};

const notify = (userId, title, body, applicationId, type) =>
  notifyOrderEvent({ targetUserId: userId, type, title, body, orderId: applicationId, route: 'settings?section=my-applications' }).catch(e =>
    console.warn('[driver] notify recruit:', e.message)
  );

/** Passe (ou cree) la ligne du couple en `status`. */
const upsert = async (existing, userId, fastFoodId, status) =>
  existing ? repos.driverApplications.updateStatus(existing.id, status) : repos.driverApplications.create({ userId, fastFoodId, status });

const accept = async (fastfood, user, existing) => {
  const userId = uidOf(user);
  await repos.users.updateUser(userId, { driverId: userId });
  const application = await upsert(existing, userId, fastfood.id, 'accepted');
  getIO().to(userId).emit('driverApplicationDecided', { data: application, role: { isDriver: true, driverId: userId } });
  echoMerchant(fastfood, application, user);
  return application;
};

exports.recruitDriver = async (fastFoodId, data = {}) => {
  const unknown = Object.keys(data).filter(k => !RecruitDriverFields[k]);
  if (unknown.length) return ko(400, `Champ(s) inconnu(s) : ${unknown.join(', ')}`);
  if (!MODES.has(data.mode)) return ko(400, 'mode : create | add | invite');

  const create = data.mode === 'create';
  const email = typeof data.email === 'string' ? data.email.trim() : '';
  const hasPhone = typeof data.phoneNumber === 'string' && data.phoneNumber.trim() !== '';
  if (create && !hasPhone) return ko(400, 'phoneNumber est requis pour créer le compte.');
  if (!create && !hasPhone && !email) return ko(400, 'Indiquez un numéro de téléphone ou un email.');

  const { defaultCountryCode } = await settingsService.getOtpSettings();
  const phoneNumber = hasPhone ? normalizePhoneNumber(data.phoneNumber, defaultCountryCode) : null;
  if (hasPhone && !phoneNumber) return ko(400, `Numéro de téléphone invalide : ${data.phoneNumber}`);

  const fastfood = await repos.fastfoods.getById(fastFoodId);
  if (!fastfood) return ko(404, "Cette boutique n'existe pas.");

  // add / invite : le compte doit exister (numero, sinon email), verifie AVANT tout.
  const candidates = phoneNumber ? phoneVariants(phoneNumber, defaultCountryCode) : [];
  let user = candidates.length ? await repos.users.getUserByAnyPhone(candidates) : null;
  if (!user && !create && email) {
    user = (await repos.users.getUserByEmail(email.toLowerCase())) || (await repos.users.getUserByEmail(email));
  }
  let created = false;
  if (!user && data.mode === 'create') {
    if (!data.email || !data.password) return ko(400, 'email et password sont requis pour créer le compte.');
    try {
      ({ user, created } = await resolveStaffAccount({ phoneNumber, phoneCandidates: candidates, email: data.email, password: data.password, nom: data.nom, prenom: data.prenom }));
    } catch (e) {
      return ko(e.code || 500, e.message);
    }
  }
  if (!user) {
    const what = hasPhone ? 'ce numéro' : 'cet email';
    return ko(404, `Cet utilisateur n'existe pas encore (aucun compte avec ${what}). Créez-le avec « Créer un compte ».`);
  }
  const userId = uidOf(user);
  if (userId === fastfood.userId) return ko(400, 'Le propriétaire ne peut pas être son propre livreur.');

  const existing = (await repos.driverApplications.getByUser(userId)).find(a => a.fastFoodId === fastFoodId);
  if (existing?.status === 'accepted') return ko(409, 'Déjà livreur de cette boutique.');
  if (existing?.status === 'invited' && data.mode === 'invite') return ko(409, 'Invitation déjà envoyée.');

  const ffName = fastfood.name || 'une boutique';
  // Invitation, sauf s'il avait deja demande lui-meme : on accepte alors directement.
  if (data.mode === 'invite' && existing?.status !== 'pending') {
    const application = await upsert(existing, userId, fastFoodId, 'invited');
    getIO().to(userId).emit('driverInvitationReceived', { data: { ...application, fastFoodName: fastfood.name } });
    echoMerchant(fastfood, application, user);
    await notify(userId, 'Invitation livreur', `${ffName} vous invite à devenir livreur`, application.id, 'driver_invitation');
    return { success: true, code: 201, message: 'Invitation envoyée', data: application };
  }

  const application = await accept(fastfood, user, existing);
  if (!created) await notify(userId, 'Ajouté comme livreur', `Vous êtes maintenant livreur de ${ffName}`, application.id, 'driver_application_decided');
  return { success: true, code: 201, message: 'Livreur ajouté', data: application };
};

/** Le user invite accepte ou refuse (lui seul). */
exports.answerInvitation = async (applicationId, uid, decision) => {
  if (!['accepted', 'refused'].includes(decision)) return ko(400, 'decision : accepted | refused');
  const application = await repos.driverApplications.getById(applicationId);
  if (!application || application.userId !== uid) return ko(404, 'Invitation non trouvée');
  if (application.status !== 'invited') return ko(409, `Invitation déjà traitée (${application.status})`);

  const fastfood = await repos.fastfoods.getById(application.fastFoodId);
  const user = await repos.users.getUserByIdSafe(uid);
  let updated;
  if (decision === 'accepted') {
    updated = await accept(fastfood, user, application);
  } else {
    updated = await repos.driverApplications.updateStatus(applicationId, 'refused');
    echoMerchant(fastfood, updated, user);
  }
  if (fastfood?.userId) {
    const name = `${user?.infos?.prenom || ''} ${user?.infos?.nom || ''}`.trim() || 'Un utilisateur';
    await notifyOrderEvent({
      targetUserId: fastfood.userId,
      type: 'driver_application',
      title: decision === 'accepted' ? 'Invitation acceptée' : 'Invitation refusée',
      body: `${name} a ${decision === 'accepted' ? 'accepté' : 'refusé'} de devenir livreur`,
      orderId: applicationId,
      route: 'settings?section=drivers',
      audience: 'merchant',
    }).catch(e => console.warn('[driver] notify answer:', e.message));
  }
  return { success: true, message: decision === 'accepted' ? 'Invitation acceptée' : 'Invitation refusée', data: updated };
};
