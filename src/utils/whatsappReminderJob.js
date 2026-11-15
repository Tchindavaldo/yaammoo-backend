// ============================================================================
// whatsappReminderJob — Rappel d'une nouvelle commande sans réponse (boutique WhatsApp)
// ============================================================================
// Toutes les minutes : les commandes payées encore `pending` depuis plus de
// `whatsapp_reminder_minutes` (settings_app, 10 par défaut, 0 = désactivé) reçoivent
// UN rappel yam_rappel_commande (Accepter / Refuser), une seule fois par commande
// (table wa_order_reminders, migration 087). Au-delà de 24 h : plus de rappel.
// Seules les boutiques `whatsappOrders` sont visées (merchantTemplates.service).
// Démarré par src/server.js. Doc : architecture/whatsapp.md.
// ============================================================================
const repos = require('../repositories');
const { getSettings } = require('../services/settings/settings.service');
const { KEYS } = require('../services/settings/settings.keys');

const EVERY_MS = 60000;
const MAX_AGE_MS = 24 * 3600000;
let timer = null;

async function runOnce() {
  const minutes = Number((await getSettings())[KEYS.WHATSAPP_REMINDER_MINUTES]);
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  const now = Date.now();
  const pending = await repos.orders.query({ status: 'pending', orderByCreated: 'asc' });
  const late = pending.filter(o => {
    const since = new Date(o.updatedAt || o.createdAt).getTime();
    return Number.isFinite(since) && now - since >= minutes * 60000 && now - since <= MAX_AGE_MS;
  });
  if (!late.length) return;
  const done = new Set(await repos.waOrderReminders.sentAmong(late.map(o => o.id)));
  const todo = late.filter(o => !done.has(o.id));
  if (!todo.length) return;
  const { remindPendingOrders } = require('../services/whatsapp/merchantTemplates.service');
  await remindPendingOrders(todo);
}

exports.startWhatsappReminderJob = () => {
  const tick = async () => {
    await runOnce().catch(e => console.error('[whatsappReminder] échec :', e.message));
    timer = setTimeout(tick, EVERY_MS);
    timer.unref?.();
  };
  timer = setTimeout(tick, EVERY_MS);
  timer.unref?.();
};
exports.runWhatsappReminderOnce = runOnce;
