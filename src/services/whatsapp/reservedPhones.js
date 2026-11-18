// Numéros réservés à l'autre environnement Yaammoo (`wa_reserved_phones`, migration 101) :
// prod et test partagent le numéro WhatsApp, un clic part au backend qui a écrit. Un super-admin
// de l'autre base ne doit donc jamais recevoir de message d'ici : refusé comme boutique
// WhatsApp (createFastFood, updateFastFood) ou livreur (driverApplication, driverRecruit).
const repos = require('../../repositories');
const { getAiSettings, getOtpSettings } = require('../settings/settings.service');
const { normalizePhoneNumber } = require('../../utils/validator/validatePhoneNumber');
const { phoneOfUser } = require('./driver/driverDirectory');

const MESSAGE = "Ce numéro est réservé à l'administration Yaammoo : il ne peut pas être numéro WhatsApp de boutique ni livreur.";

const reserved = async () => {
  const { reservedPhones } = await getAiSettings();
  if (!reservedPhones.length) return [];
  const { defaultCountryCode } = await getOtpSettings();
  return reservedPhones.map(p => normalizePhoneNumber(p, defaultCountryCode)).filter(Boolean);
};

/** Ce numéro (tel que saisi) est-il réservé ? */
const isReservedPhone = async raw => {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  const list = await reserved();
  if (!list.length) return false;
  const { defaultCountryCode } = await getOtpSettings();
  return list.includes(normalizePhoneNumber(raw, defaultCountryCode));
};

/** Le numéro WhatsApp de ce compte est-il réservé ? */
const isReservedUser = async userId => {
  if (!userId || !(await reserved()).length) return false;
  const phone = await phoneOfUser(await repos.users.getUserByIdSafe(userId));
  return !!phone && (await reserved()).includes(phone);
};

/** Erreur 400 (code lu par les controllers) quand le numéro est réservé. */
const reservedError = () => Object.assign(new Error(MESSAGE), { code: 400, statusCode: 400, httpStatus: 400 });

module.exports = { MESSAGE, isReservedPhone, isReservedUser, reservedError };
