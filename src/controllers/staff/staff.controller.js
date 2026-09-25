// ============================================================================
// Contrôleur /staff — employés et rôles d'une boutique
// ============================================================================
const staff = require('../../services/staff/staff.service');
const { PERMISSIONS } = require('../../utils/staffPermissions');

const handle = (fn, status = 200) => async (req, res) => {
  try {
    const data = await fn(req);
    res.status(status).json({ success: true, data });
  } catch (error) {
    const code = Number.isInteger(error.code) ? error.code : error.code === '23505' ? 409 : 500;
    if (code === 500) console.error('[STAFF]', error.message);
    res.status(code).json({ success: false, message: error.message });
  }
};

const uid = req => req.user?.uid;

exports.listPermissions = handle(async () => Object.entries(PERMISSIONS).map(([key, label]) => ({ key, label })));
exports.getMyMemberships = handle(req => staff.getMyMemberships(uid(req)));

exports.listRoles = handle(req => staff.listRoles(req.params.fastFoodId));
exports.createRole = handle(req => staff.createRole(req.params.fastFoodId, req.body, uid(req)), 201);
exports.updateRole = handle(req => staff.updateRole(req.params.fastFoodId, req.params.roleId, req.body));
exports.deleteRole = handle(async req => {
  await staff.deleteRole(req.params.fastFoodId, req.params.roleId);
  return { id: req.params.roleId };
});

exports.listMembers = handle(req => staff.listMembers(req.params.fastFoodId));
exports.createMember = handle(req => staff.createMember(req.params.fastFoodId, req.body, uid(req)), 201);
exports.updateMember = handle(req => staff.updateMember(req.params.fastFoodId, req.params.memberId, req.body, uid(req)));
exports.deleteMember = handle(async req => {
  await staff.deleteMember(req.params.fastFoodId, req.params.memberId);
  return { id: req.params.memberId };
});
