// Super-actions de l'agent IA admin WhatsApp (migration 098, table wa_admin_actions) :
// RIEN ne s'exécute sans la confirmation du super-administrateur (bouton Confirmer, ou
// réponse écrite : l'agent appelle confirm_admin_action). Chaque action passe par les
// services existants : support, relais au marchand / livreur, push (boutique sans quota,
// ou Yaammoo vers une ville), boutiques (masquée, mode WhatsApp), commandes (statut,
// annulation = refus de la boutique : client remboursé, frais à la boutique), réglages.
// Doc : architecture/whatsapp-ai.md.
const repos = require('../../../repositories');
const { generateId } = require('../../../repositories/idGen');
const { onButton } = require('../webhookEvents.service');
const { send, sendText } = require('../merchantChannel');
const { isAdminPhone, windowOpen } = require('./adminAlerts.service');
const msg = require('../merchantMessages');

const MAX_AGE_MS = 24 * 3600e3;
const RANK = { pending: 0, processing: 1, finished: 2, delivering: 3 };
const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Commande par id complet ou par n° (fin de l'id), une seule. */
const findOrder = async ref => {
  if (!ref) return { error: 'Commande manquante.' };
  const byId = await repos.orders.getById(ref).catch(() => null);
  if (byId) return { order: byId };
  const list = await repos.orders.findByIdSuffixAny(ref);
  if (list.length === 1) return { order: list[0] };
  return { error: list.length ? `Plusieurs commandes finissent par ${ref} : donne l'id complet (${list.map(o => o.id).join(', ')}).` : `Commande ${ref} introuvable.` };
};
const findShop = async id => (id ? repos.fastfoods.getById(id).catch(() => null) : null);
const pushText = (p, err) => (!text(p.title, 50) ? err.push('title requis (50 caractères max)') : p.body && String(p.body).length > 150 ? err.push('body : 150 caractères max') : null);

/**
 * Par action : `check(params)` -> { summary } ou { error } (avant de proposer),
 * `run(params, adminPhone)` -> compte rendu (après confirmation, données relues).
 */
const ACTIONS = {
  support_reply: {
    check: async p => {
      const thread = p.threadId && (await repos.supportThreads.getThreadById(p.threadId));
      if (!thread) return { error: 'Fil support introuvable.' };
      if (!text(p.text, 2000)) return { error: 'Texte de la réponse requis.' };
      return { summary: `Répondre au support (${thread.client?.nom || 'utilisateur'}, « ${thread.title} ») : « ${text(p.text, 300)} »` };
    },
    run: async p => {
      const thread = await repos.supportThreads.getThreadById(p.threadId);
      const { postSupportMessageService } = require('../../support/postSupportMessage.service');
      const r = await postSupportMessageService(p.threadId, { userId: thread.userId, text: text(p.text, 2000), author: 'support' });
      return r.success ? `Réponse envoyée à ${thread.client?.nom || "l'utilisateur"} (il reçoit une notification).` : `Échec : ${JSON.stringify(r.message)}`;
    },
  },

  reply_alert: {
    check: async p => {
      const alert = p.alertId && (await repos.waAdminAlerts.getById(p.alertId));
      if (!alert?.sourcePhone) return { error: alert ? 'Alerte du support : utilise support_reply avec son threadId.' : 'Alerte introuvable.' };
      if (!text(p.text, 2000)) return { error: 'Texte du message requis.' };
      return { summary: `Envoyer à ${alert.summary.split(' : ')[0]} (${alert.sourcePhone}) : « ${text(p.text, 300)} »` };
    },
    run: async p => {
      const alert = await repos.waAdminAlerts.getById(p.alertId);
      // Message libre : seulement si le marchand / livreur a écrit depuis moins de 24 h.
      if (!(await windowOpen(alert.sourcePhone))) return `Non envoyé : ${alert.sourcePhone} n'a pas écrit depuis plus de 24 h (WhatsApp refuse). Appelez-le.`;
      const r = await sendText(alert.sourcePhone, `Message de l'équipe Yaammoo :\n${text(p.text, 2000)}`);
      if (!r.ok) return "Échec de l'envoi WhatsApp.";
      await repos.waAdminAlerts.close(alert.id);
      return `Message envoyé à ${alert.sourcePhone}. Alerte close.`;
    },
  },

  push_shop_customers: {
    check: async p => {
      const shop = await findShop(p.fastFoodId);
      const err = [];
      if (!shop) err.push('Boutique introuvable (find_shop).');
      pushText(p, err);
      return err.length ? { error: err.join(' ') } : { summary: `Notification push aux clients de ${shop.name} (au nom de la boutique, sans quota) : « ${text(p.title, 50)} »${p.body ? ` ${String(p.body).trim()}` : ''}` };
    },
    run: async (p, admin) => {
      const { sendBroadcast } = require('../../notification/broadcast/broadcast.service');
      const r = await sendBroadcast({ fastFoodId: p.fastFoodId, senderUid: `admin:${admin}`, payload: { title: text(p.title, 50), body: p.body ? String(p.body).trim() : undefined, audience: 'customers' }, admin: true });
      return r.status === 201 ? 'Notification envoyée aux clients de la boutique (diffusion en cours).' : `Échec : ${r.message}`;
    },
  },

  push_city: {
    check: async p => {
      const err = [];
      if (!text(p.city, 80)) err.push('Ville requise.');
      pushText(p, err);
      return err.length ? { error: err.join(' ') } : { summary: `Notification push Yaammoo aux utilisateurs de ${text(p.city, 80)} : « ${text(p.title, 50)} »${p.body ? ` ${String(p.body).trim()}` : ''}` };
    },
    run: async (p, admin) => {
      const { fanOutPlatform } = require('../../notification/broadcast/broadcastFanout');
      // En arrière-plan (milliers de push possibles) : le bilan suit dans un second message.
      fanOutPlatform({ id: generateId(), title: text(p.title, 50), body: p.body ? String(p.body).trim() : '', city: text(p.city, 80) }).then(r =>
        sendText(admin, r ? `Push Yaammoo (${text(p.city, 80)}) : ${r.recipientsCount} destinataire(s), ${r.pushedCount} push reçus.` : 'Push Yaammoo : diffusion en échec (voir les logs).')
      );
      return `Diffusion lancée vers ${text(p.city, 80)}. Le bilan suit.`;
    },
  },

  shop_visibility: {
    check: async p => {
      const shop = await findShop(p.fastFoodId);
      if (!shop) return { error: 'Boutique introuvable (find_shop).' };
      if (typeof p.hidden !== 'boolean') return { error: 'hidden : true (masquer) ou false (afficher).' };
      return { summary: `${p.hidden ? 'Masquer' : 'Afficher'} la boutique ${shop.name} dans l'app` };
    },
    run: async p => {
      const { getHiddenFastfoodIds, KEYS } = require('../../settings/settings.service');
      const { patchSetting } = require('../../settings/patchSetting.service');
      const ids = new Set(await getHiddenFastfoodIds());
      if (p.hidden) ids.add(p.fastFoodId);
      else ids.delete(p.fastFoodId);
      const r = await patchSetting(KEYS.HIDDEN_FASTFOOD_IDS, [...ids]);
      return r.status === 200 ? `Boutique ${p.hidden ? 'masquée' : 'affichée'}.` : `Échec : ${r.message}`;
    },
  },

  shop_whatsapp: {
    check: async p => {
      const shop = await findShop(p.fastFoodId);
      if (!shop) return { error: 'Boutique introuvable (find_shop).' };
      if (typeof p.enabled !== 'boolean') return { error: 'enabled : true ou false.' };
      return { summary: `${p.enabled ? 'Activer' : 'Couper'} le mode WhatsApp de ${shop.name} (commandes reçues sur WhatsApp)` };
    },
    run: async p => {
      const { setWhatsappOrders } = require('../merchantShop.service');
      const r = await setWhatsappOrders(p.fastFoodId, p.enabled);
      return r.success ? `Mode WhatsApp ${p.enabled ? 'activé' : 'coupé'}.` : `Échec : ${r.message}`;
    },
  },

  order_status: {
    check: async p => {
      const { order, error } = await findOrder(p.orderId);
      if (error) return { error };
      if (!['processing', 'finished', 'delivering'].includes(p.status)) return { error: 'status : processing, finished ou delivering (« livrée » se valide par le QR du client).' };
      if (!(order.status in RANK) || RANK[order.status] >= RANK[p.status]) return { error: `Commande n°${msg.ref(order)} déjà ${msg.statusLabel(order.status)}.` };
      return { summary: `Passer la commande n°${msg.ref(order)} (${msg.plats(order)}) de « ${msg.statusLabel(order.status)} » à « ${msg.statusLabel(p.status)} »`, params: { ...p, orderId: order.id } };
    },
    run: async p => {
      const order = await repos.orders.getById(p.orderId);
      const fastFood = await repos.fastfoods.getById(order.fastFoodId);
      if (!(order.status in RANK) || RANK[order.status] >= RANK[p.status]) return `Commande déjà ${msg.statusLabel(order.status)}.`;
      const { advance } = require('../ai/pendingActions.service');
      const failure = await advance(order, p.status, fastFood);
      return failure ? `Échec : ${failure}` : `Commande n°${msg.ref(order)} : ${msg.statusLabel(p.status)}.`;
    },
  },

  order_cancel: {
    check: async p => {
      const { order, error } = await findOrder(p.orderId);
      if (error) return { error };
      if (!(order.status in RANK)) return { error: `Commande n°${msg.ref(order)} déjà ${msg.statusLabel(order.status)}.` };
      return { summary: `Annuler la commande n°${msg.ref(order)} (${msg.plats(order)}) : client remboursé en entier, frais réels débités de la boutique`, params: { ...p, orderId: order.id } };
    },
    run: async p => {
      const order = await repos.orders.getById(p.orderId);
      if (!(order.status in RANK)) return `Commande déjà ${msg.statusLabel(order.status)}.`;
      const fastFood = await repos.fastfoods.getById(order.fastFoodId);
      // Même chemin que le refus de la boutique (orderCancel.service : remboursement, frais).
      const { updateOrders } = require('../../order/updateOrders.service');
      const r = await updateOrders([{ id: order.id, fastFoodId: order.fastFoodId, status: 'cancelByFastFood' }], fastFood.userId);
      return r?.success ? `Commande n°${msg.ref(order)} annulée. Le client sera remboursé.` : `Échec : ${r?.message || 'annulation impossible'}`;
    },
  },

  setting: {
    check: async p => {
      const { EDITABLE_KEYS, validateSettingValue } = require('../../settings/patchSetting.service');
      if (!EDITABLE_KEYS.has(p.key)) return { error: `Réglage inconnu : ${p.key} (list_settings).` };
      const typeError = validateSettingValue(p.key, p.value);
      if (typeError) return { error: typeError };
      const { getSettings } = require('../../settings/settings.service');
      const current = (await getSettings())[p.key];
      return { summary: `Réglage ${p.key} : ${JSON.stringify(current)} -> ${JSON.stringify(p.value)}` };
    },
    run: async p => {
      const { patchSetting } = require('../../settings/patchSetting.service');
      const r = await patchSetting(p.key, p.value);
      return r.status === 200 ? `Réglage ${p.key} mis à jour.` : `Échec : ${r.message}`;
    },
  },
};

exports.ACTIONS = Object.keys(ACTIONS);

/** Vérifie puis propose l'action avec les boutons Confirmer / Annuler. */
exports.propose = async ({ phone, action, params, message }) => {
  const def = ACTIONS[action];
  if (!def) return { error: `Action inconnue : ${action}` };
  const checked = await def.check(params || {});
  if (checked.error) return { error: checked.error };
  const pending = await repos.waAdminActions.create({ phone, action, params: checked.params || params || {}, summary: checked.summary.slice(0, 500) });
  const body = `${String(message || '').trim() || 'Action à confirmer :'}\n\n${checked.summary}`.slice(0, 1000);
  const r = await send(
    { to: phone, type: 'interactive', reference: `adm_${pending.id}`, interactive: { kind: 'buttons', body, buttons: [{ id: `${pending.id}:adm_yes`, title: 'Confirmer' }, { id: `${pending.id}:adm_no`, title: 'Annuler' }] } },
    `Action admin ${pending.id}`,
    'ai'
  );
  return r.ok ? { ok: true, actionId: pending.id } : { error: "L'envoi de la demande de confirmation a échoué." };
};

/** Exécute une action confirmée (close AVANT d'agir : une double confirmation n'exécute qu'une fois). */
exports.execute = async (id, phone) => {
  const pending = await repos.waAdminActions.getById(id);
  if (!pending || pending.phone !== phone || !(await isAdminPhone(phone))) return { ok: false, message: 'Action introuvable.' };
  if (pending.status !== 'open') return { ok: false, message: `Action déjà ${pending.status === 'done' ? 'exécutée' : 'annulée ou expirée'}.` };
  if (Date.now() - new Date(pending.createdAt).getTime() > MAX_AGE_MS) {
    await repos.waAdminActions.resolveIfOpen(id, 'expired');
    return { ok: false, message: 'Action expirée (plus de 24 h) : redemandez.' };
  }
  if (!(await repos.waAdminActions.resolveIfOpen(id, 'done'))) return { ok: false, message: 'Action déjà traitée.' };
  let result;
  try {
    result = await ACTIONS[pending.action].run(pending.params, phone);
  } catch (e) {
    console.error(`❌ [ADMIN] action ${pending.action} ${id} : ${e.message}`);
    result = `Échec : ${e.message}`;
  }
  await repos.waAdminActions.setResult(id, result);
  return { ok: true, message: result };
};

/** L'administrateur renonce à l'action. */
exports.cancel = async (id, phone) => {
  const pending = await repos.waAdminActions.getById(id);
  if (!pending || pending.phone !== phone) return { ok: false, message: 'Action introuvable.' };
  return (await repos.waAdminActions.resolveIfOpen(id, 'cancelled')) ? { ok: true, message: `Annulé : ${pending.summary}. Rien n'a été fait.` } : { ok: false, message: 'Action déjà traitée.' };
};

/** Boutons Confirmer / Annuler des actions admin (payload `<id>:adm_yes|adm_no`). */
exports.registerAdminActionButtons = () => {
  onButton('adm_yes', async ({ ref, event }) => sendText(event.from, (await exports.execute(ref, event.from)).message));
  onButton('adm_no', async ({ ref, event }) => sendText(event.from, (await exports.cancel(ref, event.from)).message));
};
