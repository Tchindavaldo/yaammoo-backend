// controllers/driver/driverController.js
const {
  applyAsDriver,
  getApplications,
  getDrivers,
  getStores,
  getMyApplications,
  removeDriver,
  decideApplication,
} = require('../../services/driver/driverApplication.service');
const { getDriverProfile } = require('../../services/driver/getDriverProfile.service');

// GET /driver/:driverId — profil livreur adapté au demandeur (public | merchant | self)
exports.getDriverProfileController = async (req, res) => {
  try {
    const { driverId } = req.params;
    const viewerUid = req.user?.uid;
    const result = await getDriverProfile(driverId, viewerUid);
    if (!result.success) return res.status(result.code || 400).json({ success: false, message: result.message });
    return res.status(200).json({ success: true, scope: result.scope, data: result.data });
  } catch (error) {
    console.error('Erreur profil livreur :', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};

exports.apply = async (req, res) => {
  try {
    const { userId, fastFoodIds } = req.body;
    const result = await applyAsDriver({ userId, fastFoodIds });
    if (!result.success) return res.status(result.code || 400).json({ success: false, message: result.message, data: result.data });
    return res.status(201).json({ success: true, message: result.message, data: result.data });
  } catch (error) {
    console.error('Erreur candidature livreur :', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};

exports.getApplicationsController = async (req, res) => {
  try {
    const { fastFoodId } = req.params;
    if (!fastFoodId) return res.status(400).json({ success: false, message: 'fastFoodId requis.' });
    const data = await getApplications(fastFoodId);
    return res.status(200).json({ success: true, message: 'Demandes récupérées avec succès.', data });
  } catch (error) {
    console.error('Erreur récupération candidatures :', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};

exports.getDriversController = async (req, res) => {
  try {
    const { fastFoodId } = req.params;
    if (!fastFoodId) return res.status(400).json({ success: false, message: 'fastFoodId requis.' });
    const data = await getDrivers(fastFoodId);
    return res.status(200).json({ success: true, message: 'Livreurs récupérés avec succès.', data });
  } catch (error) {
    console.error('Erreur récupération livreurs :', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};

exports.getStoresController = async (req, res) => {
  try {
    const { driverId } = req.params;
    if (!driverId) return res.status(400).json({ success: false, message: 'driverId requis.' });
    const data = await getStores(driverId);
    return res.status(200).json({ success: true, message: 'Boutiques du livreur récupérées avec succès.', data });
  } catch (error) {
    console.error('Erreur récupération boutiques livreur :', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};

exports.getMyApplicationsController = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ success: false, message: 'userId requis.' });
    const data = await getMyApplications(userId);
    return res.status(200).json({ success: true, message: 'Demandes récupérées avec succès.', data });
  } catch (error) {
    console.error('Erreur récupération mes demandes :', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};

exports.removeDriverController = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { fastFoodId } = req.query;
    const result = await removeDriver(driverId, fastFoodId);
    if (!result.success) return res.status(result.code || 400).json({ success: false, message: result.message });
    return res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    console.error('Erreur retrait livreur :', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};

exports.decide = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { decision } = req.body;
    const result = await decideApplication(applicationId, decision);
    if (!result.success) return res.status(result.code || 400).json({ success: false, message: result.message });
    return res.status(200).json({ success: true, message: result.message, data: result.data });
  } catch (error) {
    console.error('Erreur décision candidature :', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};
