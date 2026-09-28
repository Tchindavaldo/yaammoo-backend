// ============================================================================
// Mappers bonus — bonus / bonus_requests
// ============================================================================
// Séparés de mappers.js (au-delà du plafond R3), réexportés par lui.
// ============================================================================
const { toIso } = require('./mapperUtils');

// ---------------------------------------------------------------------------
// BONUS
// ---------------------------------------------------------------------------
// Colonnes réelles depuis la migration 014 (avant : tout en `data` JSONB).
// `criteria` reste JSONB : sous-objet {kind, target, period} lu d'un bloc.
const bonusToSupabase = data => {
  const { id, createdAt, type, name, description, criteria, fastFoodId, fastFoodName, active, requiresRewardCredentials, requiresProfile, claimDuration, claimDelayHours, flyerUrl, usageLimit, createdBy, ...rest } = data;

  return {
    id,
    type: type ?? null,
    name: name ?? null,
    description: description ?? null,
    criteria: criteria ?? {},
    fastfood_id: fastFoodId ?? null,
    fastfood_name: fastFoodName ?? null,
    active: active ?? true,
    requires_reward_credentials: requiresRewardCredentials ?? false,
    requires_profile: requiresProfile ?? false,
    claim_duration: claimDuration ?? null,
    // Délai d'attente avant claim (heures) : 0 = instantané pour tous les bonus
    // sans preuve à constituer (migration 031).
    claim_delay_hours: claimDelayHours ?? 0,
    flyer_url: flyerUrl ?? null,
    usage_limit: usageLimit ?? null,
    created_by: createdBy ?? null,
    extra_data: rest,
    created_at: toIso(createdAt),
  };
};

const bonusFromSupabase = row => {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    description: row.description,
    criteria: row.criteria || {},
    fastFoodId: row.fastfood_id,
    fastFoodName: row.fastfood_name,
    active: row.active ?? true,
    requiresRewardCredentials: row.requires_reward_credentials ?? false,
    requiresProfile: row.requires_profile ?? false,
    claimDuration: row.claim_duration,
    claimDelayHours: row.claim_delay_hours ?? 0,
    flyerUrl: row.flyer_url ?? null,
    usageLimit: row.usage_limit,
    createdBy: row.created_by,
    createdAt: row.created_at,
    ...(row.extra_data || {}),
  };
};

// ---------------------------------------------------------------------------
// BONUS REQUESTS
// ---------------------------------------------------------------------------
// code / usageCount / redeemed sont des colonnes réelles depuis la migration 014
// (avant : dans extra_data, d'où un findByCode non indexé qui scannait la table).
const bonusRequestToSupabase = data => {
  const { createdAt, updatedAt, ...rest } = data;
  const known = ['id', 'userId', 'bonusId', 'status', 'code', 'usageCount', 'redeemed', 'armed', 'isCurrent'];
  const extra_data = {};
  for (const k of Object.keys(rest)) {
    if (!known.includes(k)) extra_data[k] = rest[k];
  }
  return {
    id: data.id,
    user_id: data.userId,
    bonus_id: data.bonusId,
    status: data.status ?? [],
    code: data.code ?? null,
    usage_count: data.usageCount ?? 0,
    redeemed: data.redeemed ?? false,
    armed: data.armed ?? false,
    // Réclamation courante de ce (user, bonus). Une nouvelle l'est par défaut.
    is_current: data.isCurrent ?? true,
    extra_data,
    created_at: toIso(createdAt),
    updated_at: toIso(updatedAt) || toIso(createdAt),
  };
};

const bonusRequestFromSupabase = row => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    bonusId: row.bonus_id,
    status: row.status || [],
    code: row.code ?? null,
    usageCount: row.usage_count ?? 0,
    redeemed: row.redeemed ?? false,
    armed: row.armed ?? false,
    isCurrent: row.is_current ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.extra_data || {}),
  };
};

module.exports = {
  bonus: { toSupabase: bonusToSupabase, fromSupabase: bonusFromSupabase },
  bonusRequest: { toSupabase: bonusRequestToSupabase, fromSupabase: bonusRequestFromSupabase },
};
