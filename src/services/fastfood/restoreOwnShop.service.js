// Restauration par son propriétaire d'une boutique supprimée AVEC son compte
// (deleted_reason = 'account', migration 080), tant que la conservation du
// compte court. Le compte recréé a un nouvel uid : la boutique est retrouvée par
// les identités de connexion (082) et rattachée au nouveau compte (user_id). Une boutique supprimée par un administrateur n'est jamais proposée.
const repos = require('../../repositories');
const { supabase } = require('../../config/supabase');
const { broadcastFastfoodViews } = require('./fastfoodsChanged');
const { identityKeys } = require('../../utils/authIdentityKeys');

const listShops = async uid => repos.accountArchives.listRestorableShops(uid, await identityKeys(uid));

exports.listRestorableShops = async uid => (await listShops(uid)).map(({ archiveUid, ...s }) => s);

exports.restoreOwnShop = async (uid, fastFoodId) => {
  const shop = (await listShops(uid)).find(s => s.id === fastFoodId);
  if (!shop) return { success: false, httpStatus: 404, message: 'Boutique introuvable ou non restaurable.' };
  const current = await repos.fastfoods.getByUserId(uid).catch(() => null);
  if (current) return { success: false, httpStatus: 409, message: 'Vous avez déjà une boutique active.' };
  const result = await repos.fastfoodDeletion.restore(fastFoodId);
  if (!result?.restored) return { success: false, httpStatus: 409, message: 'Restauration impossible.' };
  const { error } = await supabase.from('fastfoods').update({ deleted_reason: null, user_id: uid }).eq('id', fastFoodId);
  if (error) console.warn(`[restoreOwnShop] deleted_reason: ${error.message}`);
  await repos.accountArchives.detachShop(shop.archiveUid, fastFoodId);
  await repos.users.updateUser(uid, { fastFoodId });
  await broadcastFastfoodViews([fastFoodId], 'restored').catch(e => console.warn(`[restoreOwnShop] broadcast: ${e.message}`));
  return { success: true, data: { fastFoodId } };
};
