// Champs de POST /driver/recruit/:fastFoodId (le marchand ajoute un livreur).
exports.RecruitDriverFields = {
  mode: { type: 'string', required: true }, // create | add | invite
  phoneNumber: { type: 'string', required: false }, // requis pour create ; add / invite : numero OU email
  prenom: { type: 'string', required: false }, // create
  nom: { type: 'string', required: false }, // create
  email: { type: 'string', required: false }, // create (requis si pas de compte) ; add / invite : recherche du compte
  password: { type: 'string', required: false }, // create (requis si pas de compte)
};
