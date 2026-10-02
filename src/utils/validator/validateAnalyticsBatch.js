const {
  MAX_EVENTS_PER_BATCH,
  analyticsBatchFields,
  analyticsSessionFields,
  analyticsEventFields,
  analyticsEventDataFields,
} = require('../../interface/analyticsFields');
const { validateFieldRules } = require('./validateFieldRules');

const isObject = v => v && typeof v === 'object' && !Array.isArray(v);
const prefix = (errors, p) => errors.map(e => ({ ...e, field: `${p}.${e.field}` }));

/**
 * Vérifie un lot `{ session, events[] }` : session, chaque événement, puis son
 * `data` selon le type. Retourne `errors[]` (vide = valide).
 */
exports.validateAnalyticsBatch = body => {
  const errors = validateFieldRules(analyticsBatchFields, body);
  if (errors.length) return errors;

  if (!isObject(body.session)) return [{ field: 'session', message: 'session doit être un objet' }];
  errors.push(...prefix(validateFieldRules(analyticsSessionFields, body.session), 'session'));

  if (body.events.length > MAX_EVENTS_PER_BATCH) {
    errors.push({ field: 'events', message: `Au plus ${MAX_EVENTS_PER_BATCH} événements par lot` });
    return errors;
  }

  body.events.forEach((event, i) => {
    const p = `events[${i}]`;
    if (!isObject(event)) {
      errors.push({ field: p, message: 'Événement invalide' });
      return;
    }
    const own = validateFieldRules(analyticsEventFields, event);
    if (own.length) {
      errors.push(...prefix(own, p));
      return;
    }
    const dataFields = analyticsEventDataFields[event.type];
    if (!dataFields) {
      errors.push({ field: `${p}.type`, message: `Type inconnu : ${event.type}` });
      return;
    }
    if (event.data !== undefined && event.data !== null && !isObject(event.data)) {
      errors.push({ field: `${p}.data`, message: 'data doit être un objet' });
      return;
    }
    errors.push(...prefix(validateFieldRules(dataFields, event.data || {}), `${p}.data`));
  });

  return errors;
};
