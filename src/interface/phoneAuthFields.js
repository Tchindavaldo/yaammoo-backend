// interface/phoneAuthFields.js
// Payloads de l'authentification par numero de telephone (Bird Verify).

/** POST /auth/phone/request — demande d'un code OTP. */
exports.phoneAuthRequestFields = {
  // Numero local (698087460) ou E.164 (+237698087460). Normalise cote backend
  // avec DEFAULT_COUNTRY_CODE si l'indicatif est absent.
  phoneNumber: { type: 'string', required: true },
  // Alias tolere pour compat frontend : `phone` vaut `phoneNumber`.
  phone: { type: 'string', required: false },
};

/** POST /auth/phone/verify — validation du code, connexion ou inscription. */
exports.phoneAuthVerifyFields = {
  phoneNumber: { type: 'string', required: true },
  phone: { type: 'string', required: false }, // alias de phoneNumber
  // Code a 6 chiffres recu par WhatsApp ou SMS.
  code: { type: 'string', required: true },
  otp: { type: 'string', required: false }, // alias de code

  // Profil : utilise UNIQUEMENT a l'inscription (isNewUser=true). Ignore sur
  // une connexion, pour ne pas ecraser le profil existant.
  nom: { type: 'string', required: false, nullable: true },
  prenom: { type: 'string', required: false, nullable: true },
  age: { type: 'number', required: false, nullable: true },
  email: { type: 'string', required: false, nullable: true },
};

/** GET /auth/phone/costs/summary — recapitulatif des couts Bird (query params). */
exports.phoneAuthCostQueryFields = {
  from: { type: 'string', required: false }, // date ISO de debut (incluse)
  to: { type: 'string', required: false }, // date ISO de fin (exclue)
};
