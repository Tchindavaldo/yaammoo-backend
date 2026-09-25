// ============================================================================
// Mappers employés — staff_roles / staff_members (migration 050)
// ============================================================================
// Séparés de mappers.js (déjà au-delà du plafond R3), réexportés par lui.
// ============================================================================

const staffRoleToSupabase = d => ({
  id: d.id,
  fastfood_id: d.fastFoodId,
  name: d.name,
  permissions: d.permissions ?? [],
  created_by: d.createdBy ?? null,
  updated_at: new Date().toISOString(),
});

const staffRoleFromSupabase = r =>
  r && {
    id: r.id,
    fastFoodId: r.fastfood_id,
    name: r.name,
    permissions: r.permissions || [],
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };

const staffMemberToSupabase = d => ({
  id: d.id,
  fastfood_id: d.fastFoodId,
  role_id: d.roleId,
  phone_number: d.phoneNumber,
  user_id: d.userId ?? null,
  nom: d.nom ?? null,
  prenom: d.prenom ?? null,
  active: d.active ?? true,
  created_by: d.createdBy ?? null,
  updated_at: new Date().toISOString(),
});

const staffMemberFromSupabase = r =>
  r && {
    id: r.id,
    fastFoodId: r.fastfood_id,
    roleId: r.role_id,
    phoneNumber: r.phone_number,
    userId: r.user_id,
    nom: r.nom,
    prenom: r.prenom,
    active: r.active,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    // Jointure `role:staff_roles(*)` quand elle est demandée.
    ...(r.role ? { role: staffRoleFromSupabase(r.role) } : {}),
  };

module.exports = {
  staffRole: { toSupabase: staffRoleToSupabase, fromSupabase: staffRoleFromSupabase },
  staffMember: { toSupabase: staffMemberToSupabase, fromSupabase: staffMemberFromSupabase },
};
