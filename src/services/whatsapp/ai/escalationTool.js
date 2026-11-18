// Outil alert_admin des agents IA d'une boutique et d'un livreur (migration 098) : problème
// grave ou décision que l'agent ne peut pas prendre -> alerte WhatsApp aux
// super-administrateurs (admin/adminAlerts.service), qui répondent par leur agent.
// Doc : architecture/whatsapp-ai.md.
const { fn } = require('./agentLoop');
const { alertAdmins } = require('../admin/adminAlerts.service');

exports.definition = fn(
  'alert_admin',
  "Prévient l'équipe Yaammoo (administrateur) d'un problème grave que tu ne sais pas régler, ou d'une demande qui exige une décision ou une instruction de Yaammoo (litige, paiement, versement, compte, sécurité). Pas pour une question ordinaire que tu peux traiter.",
  {
    resume: { type: 'string', description: 'Le problème en une phrase' },
    details: { type: 'string', description: 'Le contexte utile : commandes (n°), ce qui a été tenté, ce que la personne demande' },
  },
  ['resume']
);

/** Handler pour `source` = 'merchant' (ctx.shops) ou 'driver' (ctx.user, ctx.shops). */
exports.handler = source => async (ctx, { resume, details }) => {
  const shops = (ctx.shops || []).map(s => s.name).join(', ');
  const who = source === 'merchant' ? `Boutique ${shops}` : `Livreur ${ctx.user?.prenom || ctx.user?.nom || ctx.phone} (${shops})`;
  const alert = await alertAdmins({ source, sourcePhone: ctx.phone, fastFoodId: ctx.shops?.[0]?.id || null, who, summary: resume, details: details || '' });
  return alert ? { ok: true, info: "L'équipe Yaammoo est prévenue : dis-le à ton interlocuteur, sans promettre de délai." } : { error: "L'alerte n'a pas pu être envoyée : propose de contacter le support Yaammoo." };
};
