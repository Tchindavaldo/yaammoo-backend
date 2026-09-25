// ============================================================================
// staffService — employés d'une boutique, rôles et contrôle d'accès
// ============================================================================
// Un employé = un NUMÉRO rattaché à une boutique avec un rôle. Il se connecte
// par OTP (auth-phone) : s'il a déjà un compte, il y est rattaché tout de suite,
// sinon à sa première connexion (`linkStaffOnLogin`).
//
// Le rôle se crée EN MÊME TEMPS que l'employé (`role: { name, permissions }`) ;
// un nom déjà utilisé dans la boutique réutilise le rôle existant.
// ============================================================================
const repos = require('../../repositories');
const settingsService = require('../settings/settings.service');
const { normalizePhoneNumber, phoneVariants } = require('../../utils/validator/validatePhoneNumber');
const { ALL_PERMISSIONS, invalidPermissions } = require('../../utils/staffPermissions');
const { resolveStaffAccount } = require('./staffAccount.service');
const { CreateStaffMemberFields, UpdateStaffMemberFields, StaffRoleFields } = require('../../interface/staffFields');

const fail = (code, message) => Object.assign(new Error(message), { code });

const rejectUnknown = (data, fields) => {
  const unknown = Object.keys(data || {}).filter(k => !(k in fields));
  if (unknown.length) throw fail(400, `Champ(s) non autorisé(s) : ${unknown.join(', ')}`);
};

// ---------------------------------------------------------------------------
// Contrôle d'accès
// ---------------------------------------------------------------------------

/**
 * Droits de `uid` sur une boutique.
 * @returns {Promise<{ allowed: boolean, isOwner: boolean, isAdmin: boolean, isStaff: boolean, permissions: string[] }>}
 */
exports.resolveFastfoodAccess = async (uid, fastFoodId) => {
  const none = { allowed: false, isOwner: false, isAdmin: false, isStaff: false, permissions: [] };
  if (!uid || !fastFoodId) return none;

  const [viewer, fastfood] = await Promise.all([repos.users.getUserByIdSafe(uid), repos.fastfoods.getById(fastFoodId)]);
  if (viewer?.isAdmin) return { ...none, allowed: true, isAdmin: true, permissions: ALL_PERMISSIONS };
  if (fastfood && fastfood.userId === uid) return { ...none, allowed: true, isOwner: true, permissions: ALL_PERMISSIONS };

  const post = (await repos.staff.getActiveMembershipsByUser(uid)).find(p => p.fastFoodId === fastFoodId);
  if (!post) return none;
  return { ...none, allowed: true, isStaff: true, permissions: post.role?.permissions || [] };
};

/** Lève 403 si `uid` n'a pas `permission` sur la boutique. */
exports.assertPermission = async (uid, fastFoodId, permission) => {
  const access = await exports.resolveFastfoodAccess(uid, fastFoodId);
  if (!access.permissions.includes(permission)) throw fail(403, `Permission requise : ${permission}`);
  return access;
};

// ---------------------------------------------------------------------------
// Rôles
// ---------------------------------------------------------------------------

const validateRole = role => {
  if (!role || typeof role !== 'object') throw fail(400, 'role doit être un objet { name, permissions }.');
  rejectUnknown(role, StaffRoleFields);
  const name = typeof role.name === 'string' ? role.name.trim() : '';
  if (!name) throw fail(400, 'Le nom du rôle est requis.');
  const permissions = role.permissions ?? [];
  const bad = invalidPermissions(permissions);
  if (bad.length) throw fail(400, `Permission(s) inconnue(s) : ${bad.join(', ')}. Valeurs : ${ALL_PERMISSIONS.join(', ')}`);
  return { name, permissions: [...new Set(permissions)] };
};

/** Rôle existant du même nom, sinon création. */
const findOrCreateRole = async (fastFoodId, role, createdBy) => {
  const clean = validateRole(role);
  const existing = await repos.staff.getRoleByName(fastFoodId, clean.name);
  if (existing) return existing;
  return repos.staff.createRole({ fastFoodId, ...clean, createdBy });
};

const resolveRole = async (fastFoodId, { roleId, role }, createdBy) => {
  if (roleId) {
    const found = await repos.staff.getRoleById(roleId);
    if (!found || found.fastFoodId !== fastFoodId) throw fail(404, 'Rôle introuvable pour cette boutique.');
    return found;
  }
  if (role) return findOrCreateRole(fastFoodId, role, createdBy);
  return null;
};

exports.listRoles = async fastFoodId => repos.staff.getRolesByFastFood(fastFoodId);

exports.createRole = async (fastFoodId, role, createdBy) => {
  const clean = validateRole(role);
  if (await repos.staff.getRoleByName(fastFoodId, clean.name)) throw fail(409, `Le rôle « ${clean.name} » existe déjà.`);
  return repos.staff.createRole({ fastFoodId, ...clean, createdBy });
};

exports.updateRole = async (fastFoodId, roleId, role) => {
  const existing = await repos.staff.getRoleById(roleId);
  if (!existing || existing.fastFoodId !== fastFoodId) throw fail(404, 'Rôle introuvable pour cette boutique.');
  const clean = validateRole({ name: existing.name, ...role });
  const homonym = await repos.staff.getRoleByName(fastFoodId, clean.name);
  if (homonym && homonym.id !== roleId) throw fail(409, `Le rôle « ${clean.name} » existe déjà.`);
  return repos.staff.updateRole(roleId, clean);
};

exports.deleteRole = async (fastFoodId, roleId) => {
  const existing = await repos.staff.getRoleById(roleId);
  if (!existing || existing.fastFoodId !== fastFoodId) throw fail(404, 'Rôle introuvable pour cette boutique.');
  if ((await repos.staff.countMembersByRole(roleId)) > 0) throw fail(409, 'Rôle encore attribué à des employés.');
  await repos.staff.deleteRole(roleId);
};

// ---------------------------------------------------------------------------
// Employés
// ---------------------------------------------------------------------------

exports.listMembers = async fastFoodId => repos.staff.getMembersByFastFood(fastFoodId);

exports.createMember = async (fastFoodId, data, createdBy) => {
  rejectUnknown(data, CreateStaffMemberFields);
  if (!data.roleId && !data.role) throw fail(400, 'roleId ou role { name, permissions } est requis.');

  const { defaultCountryCode } = await settingsService.getOtpSettings();
  const phoneNumber = normalizePhoneNumber(data.phoneNumber, defaultCountryCode);
  if (!phoneNumber) throw fail(400, `Numéro de téléphone invalide : ${data.phoneNumber}`);

  const fastfood = await repos.fastfoods.getById(fastFoodId);
  if (!fastfood) throw fail(404, "Cette boutique n'existe pas.");
  if (await repos.staff.getMemberByPhone(fastFoodId, phoneNumber)) throw fail(409, 'Ce numéro est déjà employé dans cette boutique.');

  // Rôle résolu AVANT le compte : un rôle invalide ne doit pas laisser un compte créé.
  const role = await resolveRole(fastFoodId, data, createdBy);

  // Compte existant → rattaché ; email + password fournis → compte créé ;
  // sinon rattachement à la 1re connexion OTP.
  const { user } = await resolveStaffAccount({
    phoneNumber,
    phoneCandidates: phoneVariants(phoneNumber, defaultCountryCode),
    email: data.email,
    password: data.password,
    nom: data.nom,
    prenom: data.prenom,
  });
  if (user && (user.uid || user.id) === fastfood.userId) throw fail(400, 'Le propriétaire ne peut pas être son propre employé.');

  return repos.staff.createMember({
    fastFoodId,
    roleId: role.id,
    phoneNumber,
    userId: user ? user.uid || user.id : null,
    nom: data.nom ?? user?.infos?.nom ?? null,
    prenom: data.prenom ?? user?.infos?.prenom ?? null,
    createdBy,
  });
};

exports.updateMember = async (fastFoodId, memberId, data, updatedBy) => {
  rejectUnknown(data, UpdateStaffMemberFields);
  const existing = await repos.staff.getMemberById(memberId);
  if (!existing || existing.fastFoodId !== fastFoodId) throw fail(404, 'Employé introuvable pour cette boutique.');

  const fields = {};
  if (data.nom !== undefined) fields.nom = data.nom;
  if (data.prenom !== undefined) fields.prenom = data.prenom;
  if (data.active !== undefined) {
    if (typeof data.active !== 'boolean') throw fail(400, 'active doit être un booléen.');
    fields.active = data.active;
  }
  const role = await resolveRole(fastFoodId, data, updatedBy);
  if (role) fields.roleId = role.id;

  const { role: _r, ...current } = existing;
  return repos.staff.updateMember(memberId, { ...current, ...fields });
};

exports.deleteMember = async (fastFoodId, memberId) => {
  const existing = await repos.staff.getMemberById(memberId);
  if (!existing || existing.fastFoodId !== fastFoodId) throw fail(404, 'Employé introuvable pour cette boutique.');
  await repos.staff.deleteMember(memberId);
};

/** Postes de l'employé connecté : boutiques + permissions (pour l'UI). */
exports.getMyMemberships = async uid => {
  const posts = await repos.staff.getActiveMembershipsByUser(uid);
  return Promise.all(
    posts.map(async p => {
      const fastfood = await repos.fastfoods.getById(p.fastFoodId);
      return {
        memberId: p.id,
        fastFoodId: p.fastFoodId,
        fastFoodName: fastfood?.name || null,
        role: p.role ? { id: p.role.id, name: p.role.name } : null,
        permissions: p.role?.permissions || [],
      };
    })
  );
};

/**
 * Appelé à chaque connexion OTP : rattache les postes créés pour ce numéro
 * avant que la personne ait un compte. Ne fait jamais échouer la connexion.
 */
exports.linkStaffOnLogin = async (phoneNumber, countryCode, userId) => {
  try {
    await repos.staff.linkUserByPhones(phoneVariants(phoneNumber, countryCode).map(String).concat(phoneNumber), userId);
  } catch (error) {
    console.warn(`⚠️ [STAFF] Rattachement des postes impossible pour ${userId} : ${error.message}`);
  }
};
