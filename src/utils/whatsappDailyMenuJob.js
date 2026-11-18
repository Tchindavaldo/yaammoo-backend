// ============================================================================
// whatsappDailyMenuJob — Menu du jour des boutiques WhatsApp (migration 097)
// ============================================================================
// Toutes les 5 min : à partir de `ai_daily_menu_hour` (heure du Cameroun, settings_app),
// chaque boutique WhatsApp reçoit UNE fois par jour la liste de ses plats et prix à
// confirmer (services/whatsapp/menu/dailyMenu.service.js). La boutique est prise en base
// (wa_daily_menu_sends) AVANT l'envoi : une seule machine envoie. IA coupée ou heure à -1 :
// rien n'est envoyé. Démarré par src/server.js. Doc : architecture/whatsapp-ai.md.
// ============================================================================
const repos = require('../repositories');
const { getAiSettings } = require('../services/settings/settings.service');
const { isoDay, hourAt } = require('../services/whatsapp/merchantMessages');
const { sendDailyMenu } = require('../services/whatsapp/menu/dailyMenu.service');

const EVERY_MS = 5 * 60e3;
let timer = null;

async function runOnce(now = new Date()) {
  const ai = await getAiSettings();
  if (!ai.enabled || ai.dailyMenuHour < 0 || hourAt(now) < ai.dailyMenuHour) return;
  const day = isoDay(now);
  const shops = await repos.fastfoods.listWhatsappShops();
  const claimed = new Set(await repos.waDailyMenuSends.claim(shops.map(s => s.id), day));
  let sent = 0;
  for (const shop of shops.filter(s => claimed.has(s.id))) {
    if (await sendDailyMenu(shop).catch(e => console.error(`[whatsappDailyMenu] ${shop.id} : ${e.message}`))) sent += 1;
  }
  if (claimed.size) console.log(`[whatsappDailyMenu] ${day} : menu du jour envoyé à ${sent}/${claimed.size} boutique(s)`);
  await repos.waDailyMenuSends.purgeBefore(isoDay(new Date(now.getTime() - 7 * 864e5)));
}

exports.startWhatsappDailyMenuJob = () => {
  const tick = async () => {
    await runOnce().catch(e => console.error('[whatsappDailyMenu] échec :', e.message));
    timer = setTimeout(tick, EVERY_MS);
    timer.unref?.();
  };
  timer = setTimeout(tick, EVERY_MS);
  timer.unref?.();
};
exports.runWhatsappDailyMenuOnce = runOnce;
