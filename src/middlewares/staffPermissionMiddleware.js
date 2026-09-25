// ============================================================================
// Contrôle d'accès boutique : propriétaire / admin / employé (migration 050)
// ============================================================================
// Toujours APRÈS `firebaseAuth` (req.user.uid obligatoire).
//
// • requireFastfoodPermission(permission) — la boutique est dans l'URL
//   (`:fastFoodId` / `:id`).
//
// • authorize(resolveChecks) — la cible se déduit de la requête (commande,
//   menu, fil de support…). `resolveChecks(req)` renvoie une liste de
//   vérifications ; TOUTES doivent passer. Une vérification passe si :
//     - l'appelant est admin plateforme, OU
//     - `selfUids` contient son uid (client propriétaire de la commande,
//       livreur assigné, auteur du fil…), OU
//     - il a `permission` sur `fastFoodId` (propriétaire = toutes ;
//       `'*'` = n'importe quel accès à la boutique).
//
// ⚠️ Ces routes étaient PUBLIQUES (menus, commandes, support) : n'importe qui,
// sans compte, pouvait modifier un menu, faire avancer ou annuler une commande,
// écrire au nom d'une boutique. L'app envoyant déjà son Bearer (routes déjà
// protégées : POST /fastFood/:id, /menu/:id/rating, /driver/:id…), elles sont
// désormais fermées.
// ============================================================================
const repos = require('../repositories');
const { resolveFastfoodAccess } = require('../services/staff/staff.service');
const { permissionForOrderTransition } = require('../utils/staffPermissions');

const deny = (res, message) => res.status(403).json({ success: false, message });

exports.requireFastfoodPermission = permission => async (req, res, next) => {
  try {
    const fastFoodId = req.params.fastFoodId || req.params.id;
    if (!fastFoodId) return res.status(400).json({ success: false, message: 'ID du fastfood requis.' });

    const access = await resolveFastfoodAccess(req.user?.uid, fastFoodId);
    if (!access.allowed) return deny(res, "Vous n'avez pas accès à cette boutique.");
    if (!access.permissions.includes(permission)) return deny(res, `Permission requise : ${permission}`);
    req.access = access;
    return next();
  } catch (error) {
    console.error('requireFastfoodPermission:', error.message);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

const passes = async (uid, check) => {
  if ((check.selfUids || []).filter(Boolean).includes(uid)) return true;
  if (!check.fastFoodId || !check.permission) return false;
  const access = await resolveFastfoodAccess(uid, check.fastFoodId);
  return check.permission === '*' ? access.allowed : access.permissions.includes(check.permission);
};

exports.authorize = resolveChecks => async (req, res, next) => {
  try {
    const uid = req.user?.uid;
    const viewer = await repos.users.getUserByIdSafe(uid);
    if (viewer?.isAdmin) return next();

    const checks = await resolveChecks(req);
    if (checks === null) return res.status(404).json({ success: false, message: 'Ressource introuvable.' });
    for (const check of checks) {
      if (!(await passes(uid, check))) {
        return deny(res, check.permission && check.permission !== '*' ? `Permission requise : ${check.permission}` : 'Action non autorisée.');
      }
    }
    return next();
  } catch (error) {
    console.error('authorize:', error.message);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ---------------------------------------------------------------------------
// Résolveurs. `null` = ressource introuvable (404) ; `[]` n'est jamais renvoyé
// pour une ressource existante (ce serait une autorisation implicite).
// ---------------------------------------------------------------------------

const ADMIN_ONLY = [{}]; // aucune condition remplissable : seul l'admin passe

// ---------- Menus ----------
exports.menuFromBody = async req => [{ fastFoodId: req.body?.fastFoodId, permission: 'menus.manage' }];

exports.menuFromParam = async req => {
  const menu = await repos.menus.getById(req.params.menuId);
  return menu ? [{ fastFoodId: menu.fastFoodId, permission: 'menus.manage' }] : null;
};

// ---------- Commandes ----------

/** Une commande : client, livreur assigné, ou boutique selon la transition. */
const orderCheck = (order, requestedStatus, extra = {}) => {
  const perm = permissionForOrderTransition(order.status, requestedStatus);
  // Transitions du CLIENT (paiement du panier, annulation par lui) : lui seul.
  if (!perm) return { selfUids: [order.userId], ...extra };
  // Livraison : le livreur assigné fait aussi avancer la commande.
  const selfUids = perm === 'orders.deliver' ? [order.driverId] : [];
  return { fastFoodId: order.fastFoodId, permission: perm, selfUids, ...extra };
};

/** POST /order : on ne commande que pour soi. */
exports.orderCreate = async req => {
  const list = Array.isArray(req.body) ? req.body : [req.body];
  return list.map(o => ({ selfUids: [o?.userId] }));
};

/** PUT /order/tabs/:userId */
exports.ordersFromBody = async req => {
  const list = (Array.isArray(req.body) ? req.body : [req.body]).filter(o => o?.id);
  if (list.length === 0) return ADMIN_ONLY;
  const orders = await Promise.all(list.map(o => repos.orders.getById(o.id)));
  if (orders.some(o => !o)) return null;
  return orders.map((o, i) => orderCheck(o, list[i].status));
};

/** PUT /order : assignation livreur (boutique), avance livreur, sinon mise à jour libre. */
exports.orderFromBody = async req => {
  const order = req.body?.id ? await repos.orders.getById(req.body.id) : null;
  if (!order) return null;
  if ('driverId' in req.body) {
    // Avance par le livreur lui-même, ou (ré)assignation par la boutique.
    return [{ fastFoodId: order.fastFoodId, permission: 'orders.deliver', selfUids: [order.driverId && order.driverId === req.body.driverId ? order.driverId : null] }];
  }
  if (req.body.status) return [orderCheck(order, req.body.status)];
  return [{ fastFoodId: order.fastFoodId, permission: '*', selfUids: [order.userId] }];
};

/** PUT /order/update-field : chaque commande visée. */
exports.ordersFromIds = async req => {
  const ids = Array.isArray(req.body?.orderIds) ? req.body.orderIds : [];
  if (ids.length === 0) return ADMIN_ONLY;
  const orders = await Promise.all(ids.map(id => repos.orders.getById(id)));
  if (orders.some(o => !o)) return null;
  return orders.map(o => ({ fastFoodId: o.fastFoodId, permission: '*', selfUids: [o.userId] }));
};

/** Lecture / outils d'une boutique (`:fastFoodId` dans l'URL). */
exports.fastfoodFromParam = async req => [{ fastFoodId: req.params.fastFoodId, permission: '*' }];

/** Ressource personnelle (`:userId` / `:driverId` dans l'URL). */
exports.selfFromParam = param => async req => [{ selfUids: [req.params[param]] }];

// ---------- Support ----------

/** GET /support/threads?userId|fastFoodId|scope=platform */
exports.supportThreadsQuery = async req => {
  const { userId, fastFoodId, scope } = req.query;
  if (userId) return [{ selfUids: [userId] }];
  if (fastFoodId) return [{ fastFoodId, permission: 'support.reply' }];
  return ADMIN_ONLY; // scope=platform (back-office) ou filtre absent
};

/** POST /support/threads : on n'ouvre un fil qu'en son nom. */
exports.supportThreadCreate = async req => [{ selfUids: [req.body?.userId] }];

/** Fil existant : son client, ou la boutique (support.reply). Fil plateforme : admin. */
exports.supportThreadFromParam = async req => {
  const thread = await repos.supportThreads.getThreadById(req.params.id);
  if (!thread) return null;
  // Écrire EN TANT QUE boutique exige la permission, même pour le client du fil.
  if (req.method === 'POST' && req.body?.author === 'support') {
    return thread.fastFoodId ? [{ fastFoodId: thread.fastFoodId, permission: 'support.reply' }] : ADMIN_ONLY;
  }
  if (req.method === 'POST') return [{ selfUids: [thread.userId] }];
  return [{ fastFoodId: thread.fastFoodId, permission: 'support.reply', selfUids: [thread.userId] }];
};
