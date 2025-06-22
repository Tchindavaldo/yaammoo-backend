// src/app.js

const cors = require('cors');
const express = require('express');
const { admin, db } = require('./config/firebase');

const smsRoutes = require('./routes/smsRoutes');
const bonusRoutes = require('./routes/bonusRoute');
const imageRoutes = require('./routes/imageRoutes');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const menuRoutes = require('./routes/menuRoutes');

const orderRoutes = require('./routes/orderRoutes');
const fastfoodRoutes = require('./routes/fastfoodRoutes');
const bonusRequest = require('./routes/bonusRequestRoute');
const transactionRoutes = require('./routes/transactionRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();

app.use(express.json());
app.use(cors({ origin: '*', methods: '*', allowedHeaders: '*', credentials: true }));

app.use('/sms', smsRoutes);

app.use('/auth', authRoutes);
app.use('/user', userRoutes);
app.use('/menu', menuRoutes);

app.use('/users', userRoutes);
app.use('/image', imageRoutes);
app.use('/bonus', bonusRoutes);

app.use('/order', orderRoutes);
app.use('/fastFood', fastfoodRoutes);
app.use('/bonusRequest', bonusRequest);
app.use('/transaction', transactionRoutes);
app.use('/notification', notificationRoutes);

// Ajouter l'endpoint de diagnostic Firebase
app.get('/debug-firebase', (req, res) => {
  // Obtenir toutes les informations des credentials
  let credentialsInfo = {};
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      credentialsInfo = {
        method: 'secret',
        project_id: serviceAccount.project_id,
        client_email: serviceAccount.client_email,
        private_key_id: serviceAccount.private_key_id,
        universe_domain: serviceAccount.universe_domain,
      };
    } catch (error) {
      credentialsInfo = {
        method: 'secret',
        error: 'Impossible de parser FIREBASE_SERVICE_ACCOUNT',
        raw_length: process.env.FIREBASE_SERVICE_ACCOUNT.length,
      };
    }
  } else {
    credentialsInfo = {
      method: 'environment_variables',
      project_id: process.env.FB_PROJECT_ID,
      client_email: process.env.FB_CLIENT_EMAIL,
      private_key_present: !!process.env.FB_PRIVATE_KEY,
      universe_domain: process.env.FB_UNIVERSE_DOMAIN,
    };
  }

  res.json({
    credentials: credentialsInfo,
    ssl_config: {
      ssl_cert_file: process.env.SSL_CERT_FILE,
      ssl_cert_dir: process.env.SSL_CERT_DIR,
      grpc_ssl_cipher_suites: process.env.GRPC_SSL_CIPHER_SUITES,
      node_tls_reject_unauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED,
    },
    environment_vars: {
      FB_PROJECT_ID: process.env.FB_PROJECT_ID,
      FB_CLIENT_EMAIL: process.env.FB_CLIENT_EMAIL,
      FB_UNIVERSE_DOMAIN: process.env.FB_UNIVERSE_DOMAIN,
      GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    },
    emulator_vars: {
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
      FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
    },
    firebase_status: {
      initialized: !!admin.apps.length,
      project_id: admin.apps.length > 0 ? admin.apps[0].options.projectId : 'Non initialisé',
      app_count: admin.apps.length,
    },
  });
});

module.exports = app;
