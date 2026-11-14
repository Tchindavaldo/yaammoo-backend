// Champs de POST /driver/recruit/:fastFoodId (le marchand ajoute un livreur).
exports.RecruitDriverFields = {
  mode: { type: 'string', required: true }, // create | add | invite
  phoneNumber: { type: 'string', required: true },
  prenom: { type: 'string', required: false }, // create
  nom: { type: 'string', required: false }, // create
  email: { type: 'string', required: false }, // create (requis si pas de compte)
  password: { type: 'string', required: false }, // create (requis si pas de compte)
};
