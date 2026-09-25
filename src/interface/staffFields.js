// Payloads des routes /staff (R3). Permissions : voir utils/staffPermissions.js.

// POST /staff/:fastFoodId/members — crée un employé ; le rôle est donné soit par
// `roleId` (rôle existant), soit par `role` (créé à la volée, ou réutilisé si
// une boutique a déjà un rôle de ce nom).
exports.CreateStaffMemberFields = {
  phoneNumber: { type: 'string', required: true }, // local ou E.164, normalisé
  nom: { type: 'string', required: false },
  prenom: { type: 'string', required: false },
  // Connexion par email EN PLUS de l'OTP. Sans compte existant : les deux requis
  // (compte créé). Compte existant sans email : ajoutés. Avec email : ignorés.
  email: { type: 'string', required: false },
  password: { type: 'string', required: false }, // >= 6 car., jamais stocké en base
  roleId: { type: 'string', required: false },
  role: { type: 'object', required: false }, // cf. StaffRoleFields
};

// `role` inline (création employé) ET POST/PATCH /staff/:fastFoodId/roles.
exports.StaffRoleFields = {
  name: { type: 'string', required: true }, // unique par boutique (casse ignorée)
  permissions: { type: 'array', required: false }, // string[] parmi ALL_PERMISSIONS
};

// PATCH /staff/:fastFoodId/members/:memberId
exports.UpdateStaffMemberFields = {
  nom: { type: 'string', required: false },
  prenom: { type: 'string', required: false },
  roleId: { type: 'string', required: false },
  role: { type: 'object', required: false },
  active: { type: 'bool', required: false }, // false = accès suspendu
};
