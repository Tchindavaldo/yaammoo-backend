require('dotenv').config();
const fs = require('fs');
const admin = require('firebase-admin');

// Diagnostic des variables d'environnement
console.log("🔍 Variables d'environnement Firebase:");
console.log('FB_PROJECT_ID:', process.env.FB_PROJECT_ID);
console.log('FB_PRIVATE_KEY présente:', !!process.env.FB_PRIVATE_KEY);
console.log('FB_CLIENT_EMAIL:', process.env.FB_CLIENT_EMAIL);
console.log('FB_UNIVERSE_DOMAIN:', process.env.FB_UNIVERSE_DOMAIN);

// Nettoyer les variables d'émulateur
delete process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
delete process.env.FIREBASE_PUBSUB_EMULATOR_HOST;

// Créer le fichier de credentials
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    // Créer le fichier dans le container
    fs.writeFileSync('./serviceAccountKey.json', process.env.FIREBASE_SERVICE_ACCOUNT);
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = './serviceAccountKey.json';
    console.log('✅ Fichier Firebase credentials créé depuis le secret');
  } catch (error) {
    console.error('❌ Erreur création fichier Firebase:', error);
    throw error;
  }
} else {
  // Fallback pour le développement local
  try {
    serviceAccount = {
      type: 'service_account',
      project_id: process.env.FB_PROJECT_ID,
      private_key_id: process.env.FB_PRIVATE_KEY_ID,
      private_key: process.env.FB_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FB_CLIENT_EMAIL,
      client_id: process.env.FB_CLIENT_ID,
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.FB_CLIENT_EMAIL)}`,
      universe_domain: process.env.FB_UNIVERSE_DOMAIN || 'googleapis.com',
    };
    console.log("📁 Utilisation des variables d'environnement pour les credentials");
  } catch (error) {
    console.error('❌ Erreur construction credentials:', error);
    throw new Error('Credentials Firebase manquants');
  }
}

// Vérification des variables d'environnement critiques
if (!process.env.FB_PROJECT_ID || !process.env.FB_PRIVATE_KEY || !process.env.FB_CLIENT_EMAIL) {
  console.error("Variables d'environnement Firebase manquantes");
  process.exit(1);
}

let app, db, bucket;

try {
  // Initialisation Firebase Admin
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FB_PROJECT_ID,
    storageBucket: `${process.env.FB_PROJECT_ID}.appspot.com`,
    universeDomain: process.env.FB_UNIVERSE_DOMAIN || 'googleapis.com',
  });

  console.log('Firebase Admin SDK initialisé avec succès');
  console.log('Project ID utilisé:', app.options.projectId);

  // Initialisation Firestore
  db = admin.firestore();
  bucket = admin.storage().bucket();

  console.log('✅ Firebase configuré avec succès');
} catch (error) {
  console.error("❌ Erreur lors de l'initialisation de Firebase:", error);
  throw error;
}

module.exports = {
  admin,
  db,
  bucket,
};
