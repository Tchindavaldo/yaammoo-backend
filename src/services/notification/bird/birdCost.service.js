const repos = require('../../../repositories');

/**
 * Journalisation des coûts Bird.
 *
 * Bird ne propose aucune vue agrégée des dépenses par l'API : le coût n'est
 * lisible qu'en interrogeant chaque vérification une par une. Sans trace locale,
 * il devient impossible de savoir ce qui a été dépensé.
 *
 * Une ligne est écrite dès l'envoi (coût encore inconnu), puis complétée à la
 * vérification. Les demandes jamais validées restent donc visibles en `pending`
 * plutôt que d'être absentes de la base.
 */

/**
 * Crée la trace d'un envoi. Le coût n'est pas encore connu : Bird ne le résout
 * qu'une fois les tentatives de livraison terminées.
 *
 * @param {object} params
 * @param {string} params.verificationId
 * @param {string} [params.phoneNumber]
 * @param {string} [params.email]
 * @param {string} [params.userId]
 */
exports.recordVerificationSent = async ({ verificationId, phoneNumber, email, userId }) => {
  try {
    await repos.birdCosts.recordSent({
      id: verificationId,
      phoneNumber,
      email,
      userId,
    });
  } catch (error) {
    // Le suivi des coûts ne doit jamais faire échouer un envoi d'OTP.
    console.warn(`⚠️ [BIRD-COST] Trace d'envoi impossible : ${error.message}`);
  }
};

/**
 * Complète la trace avec les coûts réels, une fois les tentatives résolues.
 *
 * Format Bird : `cost.amount` est une chaîne, accompagnée de `cost.currency_code`.
 * Le SMS expose en plus `segments` (caractères, nombre, encodage) ; WhatsApp non.
 *
 * @param {object} params
 * @param {string} params.verificationId
 * @param {object} params.verification Réponse brute de GET /v1/verify/verifications/{id}
 * @param {boolean} params.verified    Le code a-t-il été validé
 * @param {string} [params.userId]
 * @returns {Promise<{totalCost: number|null, currencyCode: string|null}>}
 */
exports.recordVerificationCost = async ({ verificationId, verification, verified, userId }) => {
  try {
    const attempts = (verification?.attempts || []).map(attempt => ({
      channel: attempt.channel,
      deliveryStatus: attempt.delivery_status || null,
      error: attempt.error || null,
      reason: attempt.reason || null,
      sender: attempt.sender || null,
      segments: attempt.segments || null,
      amount: attempt.cost?.amount != null ? Number(attempt.cost.amount) : null,
      currencyCode: attempt.cost?.currency_code || null,
    }));

    const rawTotal = verification?.cost?.amount;
    const totalCost = rawTotal != null ? Number(rawTotal) : null;
    const currencyCode = verification?.cost?.currency_code || attempts.find(a => a.currencyCode)?.currencyCode || null;

    const payload = {
      status: verification?.status || null,
      destinationCountry: verification?.destination_country || null,
      totalCost: Number.isFinite(totalCost) ? totalCost : null,
      currencyCode,
      attempts,
      // Canal réellement facturé : celui qui a livré, sinon le dernier tenté.
      deliveredChannel: attempts.find(a => a.deliveryStatus === 'delivered')?.channel || null,
      verified: Boolean(verified),
      userId,
    };

    await repos.birdCosts.recordResolved({ id: verificationId, payload });

    console.log(`[BIRD-COST] ${verificationId} : ${payload.totalCost ?? 'n/a'} ${currencyCode || ''} ` + `via ${payload.deliveredChannel || 'aucun canal'}`.trim());

    return { totalCost: payload.totalCost, currencyCode };
  } catch (error) {
    console.warn(`⚠️ [BIRD-COST] Enregistrement du coût impossible : ${error.message}`);
    return { totalCost: null, currencyCode: null };
  }
};

/**
 * Complète les traces restées sans coût.
 *
 * Le coût vaut `null` à l'envoi (Bird ne l'a pas encore établi) et n'est écrit
 * qu'à la vérification. Une demande jamais validée — utilisateur qui abandonne —
 * conserverait donc `totalCost: null` indéfiniment, alors qu'elle a bien été
 * facturée.
 *
 * On les résout ici, au moment de consulter le récapitulatif : ce sont des
 * lectures (gratuites, aucun envoi), ce qui évite d'avoir à planifier un job.
 *
 * @param {Array<object>} rows lignes déjà mappées par le repository
 * @returns {Promise<Map<string, object>>} données à jour, par id
 */
const resolvePendingCosts = async rows => {
  // Import différé : getVerification.service n'a pas besoin d'être chargé quand
  // tout est déjà résolu.
  const { getVerificationDetails } = require('./getVerification.service');

  const resolved = new Map();
  const pending = rows.filter(r => r.totalCost === null || r.totalCost === undefined);

  if (!pending.length) return resolved;

  console.log(`[BIRD-COST] Résolution de ${pending.length} demande(s) sans coût`);

  await Promise.all(
    pending.map(async row => {
      try {
        const details = await getVerificationDetails({ verificationId: row.id });
        if (!details.success) return;

        const raw = details.data.raw;
        // `verified` reste la valeur d'origine : une demande expirée sans
        // validation ne doit pas être comptée comme réussie.
        const updated = await exports.recordVerificationCost({
          verificationId: row.id,
          verification: raw,
          verified: row.verified === true,
        });

        resolved.set(row.id, {
          ...row,
          status: raw?.status || row.status,
          totalCost: updated.totalCost,
          currencyCode: updated.currencyCode,
          attempts: (raw?.attempts || []).map(a => ({
            channel: a.channel,
            amount: a.cost?.amount != null ? Number(a.cost.amount) : null,
          })),
        });
      } catch (error) {
        console.warn(`⚠️ [BIRD-COST] Résolution de ${row.id} impossible : ${error.message}`);
      }
    })
  );

  return resolved;
};

/**
 * Total dépensé sur une période, tous canaux confondus.
 *
 * Les demandes dont le coût n'était pas encore connu sont résolues auprès de
 * Bird au passage, afin que le total reflète la dépense réelle et non les
 * seules vérifications abouties.
 *
 * @param {object} [params]
 * @param {string} [params.from] Date ISO de début (incluse)
 * @param {string} [params.to]   Date ISO de fin (exclue)
 */
exports.getCostSummary = async ({ from, to } = {}) => {
  const rows = await repos.birdCosts.listByPeriod({ from, to });
  const resolved = await resolvePendingCosts(rows);

  const summary = {
    count: rows.length,
    verified: 0,
    abandoned: 0,
    pending: 0,
    totalCost: 0,
    currencyCode: null,
    byChannel: {},
  };

  rows.forEach(row => {
    // Données fraîchement résolues si disponibles, sinon celles en base.
    const d = resolved.get(row.id) || row;

    if (d.verified) summary.verified += 1;
    // Facturée mais jamais validée : le code n'a pas été saisi à temps.
    else if (d.status === 'expired' || d.status === 'failed') summary.abandoned += 1;
    // Encore valide : l'utilisateur peut toujours saisir son code.
    else summary.pending += 1;

    if (typeof d.totalCost === 'number') summary.totalCost += d.totalCost;
    if (!summary.currencyCode && d.currencyCode) summary.currencyCode = d.currencyCode;

    // Ventilation par canal RÉELLEMENT tenté par Bird : une vérification part en
    // WhatsApp et bascule en SMS si la livraison échoue — les deux sont facturés.
    (d.attempts || []).forEach(a => {
      if (!a.channel) return;
      const entry = (summary.byChannel[a.channel] ||= { count: 0, cost: 0 });
      entry.count += 1;
      if (typeof a.amount === 'number') entry.cost += a.amount;
    });
  });

  // Les montants Bird ont 4 décimales : on évite les artefacts de virgule flottante.
  summary.totalCost = Number(summary.totalCost.toFixed(4));
  Object.values(summary.byChannel).forEach(e => {
    e.cost = Number(e.cost.toFixed(4));
  });

  return summary;
};
