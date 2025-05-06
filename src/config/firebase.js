// src/config/firebase.js
require('dotenv').config(); // Charge les variables d'environnement depuis le fichier .env
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.js'); // Import du fichier JavaScript contenant les variables d'environnement

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount), // Utilisation de l'objet serviceAccount
  storageBucket: `${process.env.FB_PROJECT_ID}.appspot.com`, // Utilisation de l'ID du projet pour le stockage
  universeDomain: process.env.FB_UNIVERSE_DOMAIN, // Domaine de l'univers
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

module.exports = {
  bucket,
  admin,
  db,
};
