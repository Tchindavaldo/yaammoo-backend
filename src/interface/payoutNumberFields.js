// interface/payoutNumberFields.js
// Payloads de la verification des numeros de retrait (/wallet/payout-number)
// et du WhatsApp de la boutique (/whatsapp-number).

/** POST /wallet/payout-number/request — code par SMS seul, facture au marchand. */
exports.payoutNumberRequestFields = {
  phoneNumber: { type: 'string', required: true },
  phone: { type: 'string', required: false }, // alias de phoneNumber
  // Reseau du numero : solde debite des frais SMS (smsFee.service).
  network: { type: 'string', required: true, enum: ['orange', 'mtn'] },
};

/** POST /whatsapp-number/request — code sur WhatsApp seul, non facture. */
exports.whatsappNumberRequestFields = {
  phoneNumber: { type: 'string', required: true },
  phone: { type: 'string', required: false },
};

/** POST /wallet/payout-number/verify et /whatsapp-number/verify. */
exports.payoutNumberVerifyFields = {
  phoneNumber: { type: 'string', required: true },
  phone: { type: 'string', required: false },
  code: { type: 'string', required: true },
  otp: { type: 'string', required: false }, // alias de code
};
