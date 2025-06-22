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
        ...serviceAccount, // Afficher toutes les données
      };
    } catch (error) {
      credentialsInfo = {
        method: 'secret',
        error: 'Impossible de parser FIREBASE_SERVICE_ACCOUNT',
        raw_length: process.env.FIREBASE_SERVICE_ACCOUNT.length,
        raw_content: process.env.FIREBASE_SERVICE_ACCOUNT,
      };
    }
  } else {
    credentialsInfo = {
      method: 'local_file',
      file_path: '../../yaammoo.json',
    };
  }

  res.json({
    credentials: credentialsInfo,
    grpc_config: {
      verbosity: process.env.GRPC_VERBOSITY,
      trace: process.env.GRPC_TRACE,
      emulator_host: process.env.FIRESTORE_EMULATOR_HOST,
    },
    environment_vars: {
      FB_PROJECT_ID: process.env.FB_PROJECT_ID,
      GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
      GCLOUD_PROJECT: process.env.GCLOUD_PROJECT,
      GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    },
    firestore_settings: 'preferRest: true, host: firestore.googleapis.com, ssl: true',
    firebase_initialized: !!admin.apps.length,
    firebase_project_id: admin.apps.length > 0 ? admin.apps[0].options.projectId : 'Non initialisé',
  });
});

module.exports = app;
