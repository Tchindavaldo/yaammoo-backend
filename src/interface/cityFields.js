// Champs de PATCH /cities/:id (admin) : tous facultatifs, au moins un.
module.exports = {
  name: { type: 'string', description: 'nouveau nom : repercute dans fastfoods.cities' },
  region: { type: 'string' },
  active: { type: 'boolean', description: 'false = retiree des choix, les boutiques la gardent' },
};
