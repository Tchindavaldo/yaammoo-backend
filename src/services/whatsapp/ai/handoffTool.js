// Passage de main entre l'agent admin et l'agent de la boutique, pour un super-administrateur
// qui a aussi une boutique WhatsApp (migration 100, décision du 18/11/2026). Agent admin par
// défaut ; l'outil `handoff` change l'agent actif (`wa_agent_modes`) à la demande de la
// personne, ou après qu'elle a accepté la proposition, puis l'autre agent répond au même
// message (admin/adminAgent.service, ai/merchantAgent.service). Un message déjà passé
// (`event.handedOff`) ne repasse pas : pas de boucle. Doc : architecture/whatsapp-ai.md.
const repos = require('../../../repositories');
const { fn, runTool } = require('./agentLoop');

const DESCRIPTION = {
  merchant:
    "Passe la main à l'agent de SA boutique WhatsApp (commandes, plats, menu du jour, livreurs, push de la boutique), qui répond tout de suite à ce message. Seulement s'il le demande, ou s'il vient d'accepter ta proposition de passer la main.",
  admin: "Repasse la main à l'agent admin de Yaammoo (alertes, support, autres boutiques, commandes de toute la plateforme, réglages), qui répond tout de suite à ce message. Seulement s'il le demande, ou s'il vient d'accepter ta proposition.",
};

/** Consigne ajoutée au message système de l'agent qui peut passer la main à `to`. */
exports.rule = (to, shopNames = '') =>
  to === 'merchant'
    ? `- Ce super-administrateur gère aussi la boutique WhatsApp ${shopNames}. Tu es l'agent admin (par défaut). Une demande sur sa boutique (ses commandes, ses plats, le menu du jour, ses livreurs, un push de sa boutique) n'est pas de ton ressort : propose-lui de passer la main à l'agent de la boutique. S'il le demande ou accepte, appelle handoff.`
    : "- Cet interlocuteur est aussi super-administrateur de Yaammoo : tu es l'agent de sa boutique. S'il demande l'agent admin, ou si sa demande concerne la plateforme (alertes, support, autres boutiques, réglages), propose-lui de repasser la main à l'agent admin. S'il le demande ou accepte, appelle handoff.";

/**
 * `tools` ({ definitions, run }) avec en plus l'outil handoff vers `to`. Après l'appel,
 * `ctx.flags.handoff` = `to` : l'appelant fait répondre l'autre agent.
 */
exports.withHandoff = (tools, to) => {
  const handlers = {
    handoff: async ctx => {
      await repos.waAgentModes.set(ctx.phone, to);
      ctx.flags.handoff = to;
      ctx.flags.replied = true; // l'autre agent répond : pas de message de repli
      return { ok: true, info: "C'est fait : l'autre agent répond maintenant à ce message. Ta réponse finale est vide." };
    },
  };
  return {
    definitions: [...tools.definitions, fn('handoff', DESCRIPTION[to])],
    run: (ctx, name, args) => (name === 'handoff' ? runTool(handlers, ctx, name, args) : tools.run(ctx, name, args)),
  };
};
