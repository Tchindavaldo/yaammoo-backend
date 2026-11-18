// Menu du jour des boutiques WhatsApp (migration 097) : liste des plats avec LEURS prix
// (prix de la boutique, `prices[]` brut) pour qu'elle confirme ce qui est disponible.
// Envoyé chaque jour par utils/whatsappDailyMenuJob.js : message libre si la fenêtre de
// 24 h est ouverte, sinon template `yam_menu_du_jour` (bouton « Voir mon menu »). Aussi
// renvoyé par l'agent IA après un changement (ai/menuActions.js). La réponse du marchand
// est traitée par l'agent (ai/merchantMenuTools.js). Doc : architecture/whatsapp-ai.md.
const repos = require('../../../repositories');
const { onButton, onSendFailed } = require('../webhookEvents.service');
const msg = require('../merchantMessages');
const { shopPhone, send, sendText } = require('../merchantChannel');

const WINDOW_MS = 24 * 3600e3 - 10 * 60e3; // marge de 10 min avant la fermeture de la fenêtre
const MAX_CHARS = 3500; // un message WhatsApp porte 4096 caractères au plus
const OUT_OF_WINDOW = 131047;

const isAvailable = m => require('../../fastfood/getFastFoods').isMenuAvailable(m);
const nameOf = m => String(m.name || m.titre || 'plat').replace(/\s+/g, ' ').trim();

/** « 3 000 F (Petit), 4 500 F (Grand) » : prix de la boutique. */
const pricesOf = m => {
  const list = (m.prices || []).filter(p => Number(p?.price) > 0);
  if (!list.length) return 'prix non renseigné';
  return list.map(p => `${msg.montant(p.price)} F${p.description ? ` (${String(p.description).trim()})` : ''}`).join(', ');
};

/** Lignes de la liste, numérotées (disponibles d'abord). */
const linesOf = menus => {
  const on = menus.filter(isAvailable);
  const off = menus.filter(m => !isAvailable(m));
  const line = (m, i) => `${i + 1}. ${nameOf(m)} : ${pricesOf(m)}${isAvailable(m) ? ` · stock ${m.stock ?? 0}` : ''}`;
  const out = [];
  if (on.length) out.push('Disponibles :', ...on.map(line));
  if (off.length) out.push(...(on.length ? [''] : []), 'Indisponibles :', ...off.map((m, i) => line(m, on.length + i)));
  return out;
};

/** Textes de la liste (découpée si elle dépasse la taille d'un message). */
exports.menuListTexts = (fastFood, menus) => {
  if (!menus.length) {
    return [
      `Votre boutique ${fastFood.name} n'a encore aucun plat sur Yaammoo. Envoyez-moi vos plats avec leurs prix et la quantité disponible, par message ou en photo de votre carte : je les ajouterai après votre confirmation.`,
    ];
  }
  const head = `Menu du jour - ${fastFood.name}\nVoici vos plats et vos prix. Merci de confirmer ce qui est disponible aujourd'hui.\n`;
  const foot = `\nRépondez « tout est disponible », ou dites quels plats ne le sont pas aujourd'hui (et combien de portions il vous reste si besoin).`;
  const texts = [];
  let cur = head;
  for (const l of linesOf(menus)) {
    if (cur.length + l.length + 1 > MAX_CHARS) {
      texts.push(cur);
      cur = '';
    }
    cur += `\n${l}`;
  }
  texts.push(cur + foot);
  return texts;
};

/** Envoie la liste des plats de la boutique (relue en base) au numéro `to`. */
exports.sendMenuList = async (fastFood, to, author = 'system') => {
  const menus = await repos.menus.getByFastFood(fastFood.id);
  let ok = true;
  for (const body of exports.menuListTexts(fastFood, menus)) {
    const r = await send({ to, type: 'text', reference: `menu_${fastFood.id}`, text: { body } }, `Menu du jour ${fastFood.id}`, author);
    ok = ok && r.ok;
  }
  return ok;
};

/** Template hors fenêtre de 24 h : le clic sur « Voir mon menu » rouvre la fenêtre et renvoie la liste. */
const sendTemplate = (fastFood, to) =>
  send(
    { to, type: 'template', reference: `menutpl_${fastFood.id}`, template: { name: 'yam_menu_du_jour', language: 'fr', bodyParams: [fastFood.name], buttons: [{ payload: `${fastFood.id}:menu_list` }] } },
    `Menu du jour (template) ${fastFood.id}`
  );

/** Envoi quotidien à une boutique : liste si la fenêtre de 24 h est ouverte, sinon template. */
exports.sendDailyMenu = async fastFood => {
  const to = await shopPhone(fastFood);
  if (!to) return false;
  const last = await repos.waConversations.lastInboundAt(to);
  if (last && Date.now() - new Date(last).getTime() < WINDOW_MS) return exports.sendMenuList(fastFood, to);
  return (await sendTemplate(fastFood, to)).ok;
};

/** Clic « Voir mon menu » : seul le numéro de la boutique reçoit sa liste. */
const onMenuList = async ({ ref, event }) => {
  const fastFood = await repos.fastfoods.getById(ref);
  const to = await shopPhone(fastFood);
  if (!to || to !== event.from) return console.warn(`⚠️ [WHATSAPP] Voir mon menu ${ref} depuis ${event.from} : pas le numéro de la boutique`);
  if (!(await exports.sendMenuList(fastFood, to))) await sendText(to, "La liste de vos plats n'a pas pu être envoyée. Réessayez dans un instant.");
};

// Liste en plusieurs messages refusés : un seul template par boutique (10 min).
const templated = new Map();

/** Liste refusée par Meta (fenêtre fermée entre la vérification et l'envoi) : template à la place. */
const onFailed = async event => {
  if (Number(event.error?.code) !== OUT_OF_WINDOW || !event.reference?.startsWith('menu_')) return false;
  const id = event.reference.slice('menu_'.length);
  if (Date.now() - (templated.get(id) || 0) < 10 * 60e3) return true;
  templated.set(id, Date.now());
  const fastFood = await repos.fastfoods.getById(id);
  const to = await shopPhone(fastFood);
  if (!to) return false;
  await sendTemplate(fastFood, to);
  return true;
};

exports.registerDailyMenuFlows = () => {
  onButton('menu_list', onMenuList);
  onSendFailed(onFailed);
};
