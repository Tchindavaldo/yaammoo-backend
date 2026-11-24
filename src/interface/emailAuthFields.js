// interface/emailAuthFields.js
// Payloads de l'inscription par e-mail avec code (Bird Verify, canal e-mail).

/** POST /auth/email/request — envoi d'un code a 6 chiffres a l'adresse. */
exports.emailAuthRequestFields = {
  email: { type: 'string', required: true },
};

/** POST /auth/email/verify — validation du code et creation du compte. */
exports.emailAuthVerifyFields = {
  email: { type: 'string', required: true },
  code: { type: 'string', required: true }, // 6 chiffres recus par e-mail
  password: { type: 'string', required: true }, // 6 caracteres minimum
};
