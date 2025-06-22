require('dotenv').config();
const fs = require('fs');
const admin = require('firebase-admin');

// Diagnostic des variables d'environnement
console.log("🔍 Variables d'environnement Firebase:");
console.log('FIRESTORE_EMULATOR_HOST:', process.env.FIRESTORE_EMULATOR_HOST);
console.log('FIREBASE_AUTH_EMULATOR_HOST:', process.env.FIREBASE_AUTH_EMULATOR_HOST);
console.log('GCLOUD_PROJECT:', process.env.GCLOUD_PROJECT);
console.log('GOOGLE_CLOUD_PROJECT:', process.env.GOOGLE_CLOUD_PROJECT);
console.log('FB_PROJECT_ID:', process.env.FB_PROJECT_ID);

// Nettoyer TOUTES les variables d'emulateur
delete process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
delete process.env.FIREBASE_PUBSUB_EMULATOR_HOST;

// Définir explicitement le projet
process.env.GOOGLE_CLOUD_PROJECT = process.env.FB_PROJECT_ID;
process.env.GCLOUD_PROJECT = process.env.FB_PROJECT_ID;

// Créer le fichier de credentials à partir du secret Fly.io
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    // Créer le fichier dans le container
    fs.writeFileSync('./serviceAccountKey.json', process.env.FIREBASE_SERVICE_ACCOUNT);

    // Charger le JSON
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    // Dire à Firebase où trouver le fichier
    process.env.GOOGLE_APPLICATION_CREDENTIALS = './serviceAccountKey.json';

    console.log('✅ Fichier Firebase credentials créé depuis le secret');
  } catch (error) {
    console.error('❌ Erreur création fichier Firebase:', error);
    throw error;
  }
} else {
  // Fallback pour le développement local
  try {
    serviceAccount = require('../../yaammoo.json');
    console.log('📁 Utilisation du fichier local yaammoo.json');
  } catch (error) {
    console.error('❌ Aucun credentials Firebase trouvé');
    throw new Error('Credentials Firebase manquants');
  }
}

// Configuration pour forcer l'utilisation de REST uniquement
process.env.FIRESTORE_EMULATOR_HOST = undefined;

// Désactiver complètement gRPC
process.env.GRPC_VERBOSITY = 'NONE';
process.env.GRPC_TRACE = '';

let app, db, bucket;

try {
  // Initialisation Firebase Admin avec projectId explicite
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FB_PROJECT_ID || 'infinity-fastfood', // Explicite
    storageBucket: `${process.env.FB_PROJECT_ID || 'infinity-fastfood'}.appspot.com`,
    universeDomain: process.env.FB_UNIVERSE_DOMAIN || 'googleapis.com',
  });

  console.log('Firebase Admin SDK initialisé avec succès');
  console.log('Project ID utilisé:', app.options.projectId);

  // Initialisation Firestore avec configuration REST forcée
  db = admin.firestore();

  // Configuration REST explicite - DOIT être appelé avant toute opération
  db.settings({
    host: 'firestore.googleapis.com', // Forcer l'host explicitement
    ssl: true, // Forcer SSL
    preferRest: true,
    ignoreUndefinedProperties: true,
    timestampsInSnapshots: true,
  });

  bucket = admin.storage().bucket();

  // Test de connexion simple
  console.log('Test de connexion Firestore...');
  console.log('Firestore host configuré:', 'firestore.googleapis.com');
} catch (error) {
  console.error("Erreur lors de l'initialisation de Firebase:", error);
  throw error;
}

// Wrapper pour les opérations Firestore avec gestion d'erreur
const safeFirestoreOperation = async operation => {
  try {
    return await operation();
  } catch (error) {
    if (error.message.includes('DECODER routines::unsupported')) {
      console.error('Erreur gRPC détectée, tentative avec REST API directe');
      throw new Error('Firestore gRPC Error - Configuration REST requise');
    }
    throw error;
  }
};

module.exports = {
  admin,
  db,
  bucket,
  safeFirestoreOperation,
};
// require('dotenv').config();

// // Configuration SSL/TLS spécifique pour Fly.io
// process.env.GRPC_SSL_CIPHER_SUITES = 'ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:!aNULL:!MD5:!DSS';
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
// process.env.SSL_CERT_FILE = '/etc/ssl/certs/ca-certificates.crt';
// process.env.SSL_CERT_DIR = '/etc/ssl/certs';

// const admin = require('firebase-admin');
// const serviceAccount = require('./serviceAccountKey.js');

// // Vérification des variables d'environnement critiques
// if (!process.env.FB_PROJECT_ID || !process.env.FB_PRIVATE_KEY || !process.env.FB_CLIENT_EMAIL) {
//   console.error("Variables d'environnement Firebase manquantes");
//   process.exit(1);
// }

// try {
//   admin.initializeApp({
//     credential: admin.credential.cert(serviceAccount),
//     storageBucket: `${process.env.FB_PROJECT_ID}.appspot.com`,
//     universeDomain: process.env.FB_UNIVERSE_DOMAIN,
//   });
//   console.log('Firebase Admin SDK initialisé avec succès');
// } catch (error) {
//   console.error("Erreur lors de l'initialisation de Firebase:", error);
//   throw error;
// }

// const db = admin.firestore();
// const bucket = admin.storage().bucket();

// module.exports = {
//   bucket,
//   admin,
//   db,
// };
