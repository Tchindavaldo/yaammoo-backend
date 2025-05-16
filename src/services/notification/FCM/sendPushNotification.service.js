// services/sendPushNotification.js

const { admin } = require('../../../config/firebase');

const sendPushNotification = async ({ token, title, body, data = {} }) => {
  const message = {
    token,
    notification: {
      title,
      body,
    },
    android: {
      // priority: 'high',
      notification: {
        channelId: 'high_priority_channel',
        icon: 'ic_launcher',
        sound: 'default',
        // tag: 'group_id', // identifiant pour grouper les notifs
        // group: 'group_id', // identifiant de groupe
        // groupSummary: false,
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
        },
      },
    },
    data,
  };

  // const message = {
  //   token,

  //   // Notification de base
  //   notification: {
  //     title,
  //     body,
  //   },

  //   // Données additionnelles
  //   data: {
  //     ...data,
  //     // Les paramètres suivants sont importants pour certains appareils
  //     priority: 'high',
  //     importance: 'high',
  //     click_action: 'FLUTTER_NOTIFICATION_CLICK',
  //     // Un timestamp pour rendre chaque notification unique
  //     timestamp: Date.now().toString(),
  //   },

  //   // Configuration Android spécifique pour l'affichage en bulle
  //   android: {
  //     priority: 'high', // Priorité élevée = notification immédiate
  //     ttl: 0, // Durée de vie à 0 = envoi instantané
  //     collapseKey: `notification_${Date.now()}`, // Empêche le regroupement des notifications
  //     notification: {
  //       channelId: 'default',
  //       priority: 'max', // PRIORITY_MAX = force l'affichage en bulle
  //       visibility: 'public',
  //       notification_priority: 'PRIORITY_MAX',
  //       // Sons et vibrations
  //       sound: 'default',
  //       defaultSound: true,
  //       defaultVibrateTimings: true,
  //       defaultLightSettings: true,
  //       // Paramètres additionnels pour renforcer la priorité
  //       vibrate_timings: ['0s', '0.5s', '0.5s', '0.5s'],
  //       light_settings: {
  //         color: {
  //           red: 1.0,
  //           green: 0.0,
  //           blue: 0.0,
  //         },
  //         light_on_duration: '0.5s',
  //         light_off_duration: '0.5s',
  //       },
  //       // Ticker est le texte affiché dans la barre d'état
  //       ticker: title || 'Nouvelle notification',
  //     },
  //   },

  //   // Configuration iOS (si vous avez des utilisateurs iOS)
  //   apns: {
  //     payload: {
  //       aps: {
  //         alert: {
  //           title,
  //           body,
  //         },
  //         sound: 'default',
  //         badge: 1,
  //         'content-available': 1,
  //         'mutable-content': 1,
  //         'interruption-level': 'time-sensitive', // iOS 15+ pour priorité élevée
  //       },
  //     },
  //     headers: {
  //       'apns-priority': '10', // Priorité maximale pour iOS
  //       'apns-push-type': 'alert',
  //     },
  //   },
  // };

  try {
    const response = await admin.messaging().send(message);
    return { success: true, response };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = sendPushNotification;
