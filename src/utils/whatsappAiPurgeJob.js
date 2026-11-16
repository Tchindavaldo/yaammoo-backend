// ============================================================================
// whatsappAiPurgeJob — Rétention des données de l'agent IA WhatsApp (migration 090)
// ============================================================================
// Toutes les heures :
//   - efface la conversation (wa_conversation_messages) plus vieille que
//     `ai_conversation_retention_days` (settings_app, 30 par défaut) ;
//   - expire les propositions de l'agent non confirmées depuis 24 h et efface les
//     propositions plus vieilles que la rétention.
// Démarré par src/server.js. Doc : architecture/whatsapp-ai.md.
// ============================================================================
const repos = require('../repositories');
const { getAiSettings } = require('../services/settings/settings.service');

const EVERY_MS = 3600e3;
const PENDING_MAX_AGE_MS = 24 * 3600e3;
let timer = null;

async function runOnce() {
  const { retentionDays } = await getAiSettings();
  const before = new Date(Date.now() - retentionDays * 864e5).toISOString();
  const removed = await repos.waConversations.purgeBefore(before);
  await repos.waAiPendingActions.expireAndPurge(new Date(Date.now() - PENDING_MAX_AGE_MS).toISOString(), before);
  if (removed) console.log(`[whatsappAiPurge] ${removed} message(s) de conversation effacé(s) (> ${retentionDays} j)`);
}

exports.startWhatsappAiPurgeJob = () => {
  const tick = async () => {
    await runOnce().catch(e => console.error('[whatsappAiPurge] échec :', e.message));
    timer = setTimeout(tick, EVERY_MS);
    timer.unref?.();
  };
  timer = setTimeout(tick, EVERY_MS);
  timer.unref?.();
};
exports.runWhatsappAiPurgeOnce = runOnce;
