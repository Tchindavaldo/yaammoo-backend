// ============================================================================
// Staff Repository — Supabase (migration 050)
// ============================================================================
// Rôles (`staff_roles`) et employés (`staff_members`) d'une boutique.
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');

const ROLES = 'staff_roles';
const MEMBERS = 'staff_members';
const WITH_ROLE = '*, role:staff_roles(*)';

// ---------------------------------------------------------------------------
// Rôles
// ---------------------------------------------------------------------------
exports.createRole = async data => {
  const payload = m.staffRole.toSupabase({ ...data, id: data.id || generateId() });
  const { data: row, error } = await supabase.from(ROLES).insert(payload).select().single();
  if (error) throw error;
  return m.staffRole.fromSupabase(row);
};

exports.getRoleById = async id => {
  const { data, error } = await supabase.from(ROLES).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return m.staffRole.fromSupabase(data);
};

/** Recherche insensible à la casse : « caissier » == « Caissier ». */
exports.getRoleByName = async (fastFoodId, name) => {
  const { data, error } = await supabase.from(ROLES).select('*').eq('fastfood_id', fastFoodId).ilike('name', name).maybeSingle();
  if (error) throw error;
  return m.staffRole.fromSupabase(data);
};

exports.getRolesByFastFood = async fastFoodId => {
  const { data, error } = await supabase.from(ROLES).select('*').eq('fastfood_id', fastFoodId).order('name');
  if (error) throw error;
  return (data || []).map(m.staffRole.fromSupabase);
};

exports.updateRole = async (id, fields) => {
  const existing = await exports.getRoleById(id);
  if (!existing) throw new Error(`Rôle ${id} introuvable`);
  const { data, error } = await supabase
    .from(ROLES)
    .update(m.staffRole.toSupabase({ ...existing, ...fields, id }))
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return m.staffRole.fromSupabase(data);
};

exports.deleteRole = async id => {
  const { error } = await supabase.from(ROLES).delete().eq('id', id);
  if (error) throw error;
};

// ---------------------------------------------------------------------------
// Employés
// ---------------------------------------------------------------------------
exports.createMember = async data => {
  const payload = m.staffMember.toSupabase({ ...data, id: data.id || generateId() });
  const { data: row, error } = await supabase.from(MEMBERS).insert(payload).select(WITH_ROLE).single();
  if (error) throw error;
  return m.staffMember.fromSupabase(row);
};

exports.getMemberById = async id => {
  const { data, error } = await supabase.from(MEMBERS).select(WITH_ROLE).eq('id', id).maybeSingle();
  if (error) throw error;
  return m.staffMember.fromSupabase(data);
};

exports.getMemberByPhone = async (fastFoodId, phoneNumber) => {
  const { data, error } = await supabase.from(MEMBERS).select(WITH_ROLE).eq('fastfood_id', fastFoodId).eq('phone_number', phoneNumber).maybeSingle();
  if (error) throw error;
  return m.staffMember.fromSupabase(data);
};

exports.getMembersByFastFood = async fastFoodId => {
  const { data, error } = await supabase.from(MEMBERS).select(WITH_ROLE).eq('fastfood_id', fastFoodId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(m.staffMember.fromSupabase);
};

/** Postes ACTIFS d'un user (toutes boutiques). */
exports.getActiveMembershipsByUser = async userId => {
  const { data, error } = await supabase.from(MEMBERS).select(WITH_ROLE).eq('user_id', userId).eq('active', true);
  if (error) throw error;
  return (data || []).map(m.staffMember.fromSupabase);
};

exports.countMembersByRole = async roleId => {
  const { count, error } = await supabase.from(MEMBERS).select('id', { count: 'exact', head: true }).eq('role_id', roleId);
  if (error) throw error;
  return count || 0;
};

exports.updateMember = async (id, fields) => {
  const existing = await exports.getMemberById(id);
  if (!existing) throw new Error(`Employé ${id} introuvable`);
  const { data, error } = await supabase
    .from(MEMBERS)
    .update(m.staffMember.toSupabase({ ...existing, ...fields, id }))
    .eq('id', id)
    .select(WITH_ROLE)
    .single();
  if (error) throw error;
  return m.staffMember.fromSupabase(data);
};

exports.deleteMember = async id => {
  const { error } = await supabase.from(MEMBERS).delete().eq('id', id);
  if (error) throw error;
};

/**
 * Rattache au compte `userId` les postes créés pour ce numéro avant sa première
 * connexion. Accepte les variantes du numéro (cf. phoneVariants).
 */
exports.linkUserByPhones = async (phoneNumbers, userId) => {
  const { error } = await supabase.from(MEMBERS).update({ user_id: userId, updated_at: new Date().toISOString() }).in('phone_number', phoneNumbers).is('user_id', null);
  if (error) throw error;
};
