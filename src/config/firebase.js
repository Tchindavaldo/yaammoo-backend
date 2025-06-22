require('dotenv').config();
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.js');

// Configuration pour forcer l'utilisation de REST uniquement
process.env.FIRESTORE_EMULATOR_HOST = undefined;
process.env.GCLOUD_PROJECT = process.env.FB_PROJECT_ID;

// Désactiver complètement gRPC
process.env.GRPC_VERBOSITY = 'NONE';
process.env.GRPC_TRACE = '';

let app, db, bucket;

try {
  // Initialisation Firebase Admin
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: `${process.env.FB_PROJECT_ID}.appspot.com`,
    universeDomain: process.env.FB_UNIVERSE_DOMAIN || 'googleapis.com',
  });

  console.log('Firebase Admin SDK initialisé avec succès');

  // Initialisation Firestore avec configuration REST forcée
  db = admin.firestore();

  // Configuration REST explicite - DOIT être appelé avant toute opération
  db.settings({
    preferRest: true,
    ignoreUndefinedProperties: true,
    timestampsInSnapshots: true,
  });

  bucket = admin.storage().bucket();

  // Test de connexion simple
  console.log('Test de connexion Firestore...');
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
