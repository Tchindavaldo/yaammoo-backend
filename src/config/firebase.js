require('dotenv').config();

// Configuration SSL/TLS spécifique pour Fly.io
process.env.GRPC_SSL_CIPHER_SUITES = 'ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:!aNULL:!MD5:!DSS';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
process.env.SSL_CERT_FILE = '/etc/ssl/certs/ca-certificates.crt';
process.env.SSL_CERT_DIR = '/etc/ssl/certs';

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.js');

// Vérification des variables d'environnement critiques
if (!process.env.FB_PROJECT_ID || !process.env.FB_PRIVATE_KEY || !process.env.FB_CLIENT_EMAIL) {
  console.error("Variables d'environnement Firebase manquantes");
  process.exit(1);
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: `${process.env.FB_PROJECT_ID}.appspot.com`,
    universeDomain: process.env.FB_UNIVERSE_DOMAIN,
  });
  console.log('Firebase Admin SDK initialisé avec succès');
} catch (error) {
  console.error("Erreur lors de l'initialisation de Firebase:", error);
  throw error;
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

module.exports = {
  bucket,
  admin,
  db,
};
