const {
  supportThreadFields,
  supportMessageFields,
  SUPPORT_TOPICS,
} = require('../../interface/supportFields');

/** Verifie un payload contre son field : champs autorises, requis, types. */
const checkAgainstFields = (data, fields) => {
  const errors = [];

  for (const field in data) {
    const rules = fields[field];
    if (!rules) {
      errors.push({ field, message: `Champ non autorisé : ${field}` });
      continue;
    }
    if (data[field] === null && rules.nullable) continue;

    const actualType = Array.isArray(data[field]) ? 'array' : typeof data[field];
    if (actualType !== rules.type) {
      errors.push({
        field,
        message: `Type invalide pour "${field}": attendu "${rules.type}", reçu "${actualType}"`,
      });
    }
  }

  for (const field in fields) {
    if (fields[field].required && (data[field] === undefined || data[field] === null || data[field] === '')) {
      errors.push({ field, message: `Champ requis manquant : ${field}` });
    }
  }

  return errors;
};

exports.validateSupportThread = data => {
  const errors = checkAgainstFields(data, supportThreadFields);
  if (data.topic && !SUPPORT_TOPICS.includes(data.topic)) {
    errors.push({ field: 'topic', message: `Objet invalide : ${data.topic}` });
  }
  if (typeof data.text === 'string' && !data.text.trim()) {
    errors.push({ field: 'text', message: 'Le message ne peut pas être vide' });
  }
  return errors;
};

exports.validateSupportMessage = data => {
  const errors = checkAgainstFields(data, supportMessageFields);
  if (data.author && !['user', 'support'].includes(data.author)) {
    errors.push({ field: 'author', message: `Auteur invalide : ${data.author}` });
  }
  if (typeof data.text === 'string' && !data.text.trim()) {
    errors.push({ field: 'text', message: 'Le message ne peut pas être vide' });
  }
  return errors;
};
