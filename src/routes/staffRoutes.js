const express = require('express');
const firebaseAuth = require('../middlewares/authMiddleware');
const { requireFastfoodPermission } = require('../middlewares/staffPermissionMiddleware');
const c = require('../controllers/staff/staff.controller');

const router = express.Router();
// Gestion des employés : propriétaire, admin, ou employé ayant `staff.manage`.
const canManage = [firebaseAuth, requireFastfoodPermission('staff.manage')];

/**
 * @swagger
 * tags:
 *   - name: Staff
 *     description: Employés d'une boutique, rôles et permissions (cf. architecture/staff.md)
 *
 * /staff/permissions:
 *   get:
 *     summary: Catalogue des permissions attribuables à un rôle
 *     tags: [Staff]
 *     responses:
 *       200: { description: "[{ key, label }]" }
 *
 * /staff/me:
 *   get:
 *     summary: Postes de l'employé connecté (boutiques + permissions)
 *     tags: [Staff]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "[{ memberId, fastFoodId, fastFoodName, role: { id, name }, permissions[] }]" }
 *
 * /staff/{fastFoodId}/members:
 *   get:
 *     summary: Liste des employés de la boutique (avec leur rôle)
 *     tags: [Staff]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: fastFoodId, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: OK }
 *   post:
 *     summary: Crée un employé ; le rôle est créé en même temps (ou réutilisé s'il existe déjà sous ce nom)
 *     tags: [Staff]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: fastFoodId, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phoneNumber]
 *             properties:
 *               phoneNumber: { type: string, example: "698087460" }
 *               nom: { type: string }
 *               prenom: { type: string }
 *               email: { type: string, description: "Connexion email EN PLUS de l'OTP" }
 *               password: { type: string, description: ">= 6 caractères ; requis avec email si aucun compte n'existe" }
 *               roleId: { type: string, description: "Rôle existant (sinon `role`)" }
 *               role:
 *                 type: object
 *                 properties:
 *                   name: { type: string, example: Caissier }
 *                   permissions: { type: array, items: { type: string }, example: ["orders.validate", "orders.finish"] }
 *     responses:
 *       201: { description: Employé créé }
 *       400: { description: Payload invalide }
 *       409: { description: Numéro déjà employé dans cette boutique }
 *
 * /staff/{fastFoodId}/members/{memberId}:
 *   patch:
 *     summary: Modifie un employé (nom, rôle, suspension via active=false)
 *     tags: [Staff]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nom: { type: string }
 *               prenom: { type: string }
 *               roleId: { type: string }
 *               role: { type: object }
 *               active: { type: boolean }
 *     responses:
 *       200: { description: OK }
 *   delete:
 *     summary: Retire l'employé de la boutique
 *     tags: [Staff]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *
 * /staff/{fastFoodId}/roles:
 *   get:
 *     summary: Liste des rôles déjà créés dans la boutique
 *     tags: [Staff]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "[{ id, name, permissions[] }]" }
 *   post:
 *     summary: Crée un rôle seul (facultatif — il se crée d'ordinaire avec l'employé)
 *     tags: [Staff]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               permissions: { type: array, items: { type: string } }
 *     responses:
 *       201: { description: Créé }
 *       409: { description: Nom déjà pris }
 *
 * /staff/{fastFoodId}/roles/{roleId}:
 *   patch:
 *     summary: Renomme un rôle / change ses permissions (effet immédiat pour tous ses employés)
 *     tags: [Staff]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *   delete:
 *     summary: Supprime un rôle non attribué
 *     tags: [Staff]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *       409: { description: Rôle encore attribué }
 */
router.get('/permissions', c.listPermissions);
router.get('/me', firebaseAuth, c.getMyMemberships);

router.get('/:fastFoodId/members', ...canManage, c.listMembers);
router.post('/:fastFoodId/members', ...canManage, c.createMember);
router.patch('/:fastFoodId/members/:memberId', ...canManage, c.updateMember);
router.delete('/:fastFoodId/members/:memberId', ...canManage, c.deleteMember);

router.get('/:fastFoodId/roles', ...canManage, c.listRoles);
router.post('/:fastFoodId/roles', ...canManage, c.createRole);
router.patch('/:fastFoodId/roles/:roleId', ...canManage, c.updateRole);
router.delete('/:fastFoodId/roles/:roleId', ...canManage, c.deleteRole);

module.exports = router;
