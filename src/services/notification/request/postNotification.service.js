const { db } = require('../../../config/firebase');
const { getIO } = require('../../../socket');
const { flattenNotifications } = require('../../../utils/flattenNotifications');
const { validateNotificationData } = require('../../../utils/validator/validateNotificationData');
const sendPushNotification = require('../FCM/sendPushNotification.service');
const { getNotificationService } = require('./getNotification.services');

const isStaleTokenError = (result) => {
  if (!result || result.success) return false;
  const err = String(result.error || '');
  if (err.includes('registration-token-not-registered')) return true;
  if (err.includes('not a valid FCM registration token')) return true;
  if (err.includes('DeviceNotRegistered')) return true;
  if (err.includes('InvalidCredentials')) return false;
  return false;
};

exports.postNotificationService = async dataGet => {
  try {
    const { data, userId, fastFoodId, token, tokens, extraFcmData = {} } = dataGet;
    const targetTokens = Array.isArray(tokens) && tokens.length > 0
      ? tokens
      : (token ? [token] : []);
    const sendPushToAll = async (title, body, pushData) => {
      if (targetTokens.length === 0) {
        console.log('⚠️  Pas de tokens à envoyer');
        return;
      }

      console.log(`\n📊 Envoi push à ${targetTokens.length} token(s):`);
      targetTokens.forEach((t, i) => {
        const shortToken = t.substring(0, 40) + '...';
        const type = t.startsWith('ExponentPushToken[') ? '(EXPO)' : '(FCM)';
        console.log(`   [${i + 1}/${targetTokens.length}] ${type} ${shortToken}`);
      });

      const results = await Promise.allSettled(
        targetTokens.map(t => sendPushNotification({ token: t, title, body, data: pushData }))
      );

      if (userId) {
        const staleTokens = [];
        results.forEach((r, i) => {
          const value = r.status === 'fulfilled' ? r.value : null;
          if (isStaleTokenError(value)) staleTokens.push(targetTokens[i]);
        });
        if (staleTokens.length > 0) {
          console.log(`\n🧹 ${staleTokens.length} token(s) stale détecté(s), nettoyage...`);
          try {
            const { cleanStaleTokens } = require('../helpers/notifyOrderEvent');
            await cleanStaleTokens(userId, staleTokens);
            console.log('✅ Tokens stales retirés de Firestore');
          } catch (e) {
            console.error('❌ Erreur lors du nettoyage:', e.message);
          }
        }
      }
    };
    console.log(`\n📱 [postNotificationService] userId=${userId || fastFoodId}`);
    console.log(`   Titre: "${data.title}" | Corps: "${data.body}" | Type: ${data.type}`);

    // ✅ Valider les données
    const errors = validateNotificationData(data);
    if (errors.length > 0) {
      console.log(`❌ Validation échouée: ${errors.join(', ')}`);
      return { success: false, message: errors };
    }

    console.log(`📊 Tokens chargés: ${targetTokens.length} token(s)`);

    const response = await getNotificationService(userId || undefined, fastFoodId || undefined);
    const newNotif = { id: db.collection('notification').doc().id, title: data.title, body: data.body, type: data.type, isRead: [], createdAt: new Date().toISOString() };

    console.log(`💾 Création notif Firestore...`);

    if (!response.data || response.data.length === 0) {
      const notificationData1 = {};
      if (fastFoodId && userId) return { success: false, message: 'notification ne doit pas avoir userId et fastFoodId' };

      if (userId) notificationData1.userId = userId;
      if (fastFoodId) notificationData1.target = 'all';
      if (fastFoodId) notificationData1.fastFoodId = fastFoodId;

      const notificationData = { ...notificationData1, updatedAt: new Date().toISOString(), allNotif: [newNotif] };

      const docRef = await db.collection('notification').add(notificationData);
      const newUserNotif = { ...notificationData1, idGroup: docRef.id, ...newNotif, isRead: JSON.stringify(newNotif.isRead) };

      await sendPushToAll(newNotif.title, newNotif.body, { ...newUserNotif, ...extraFcmData });

      try {
        const io = getIO();
        const target = userId || fastFoodId;
        if (target) io.to(target).emit('newNotification', { notification: { ...newUserNotif, ...extraFcmData } });
      } catch (e) {
        console.error('❌ Erreur socket:', e.message);
      }
      return { success: true, data: { id: docRef.id, ...notificationData }, message: 'Notification ajoutée avec succès' };
    } else {
      const notifDoc = response.data[0];
      const updatedAllNotifArray = [newNotif, ...notifDoc.allNotif];

      const notificationData1 = {};
      if (notifDoc.userId) notificationData1.userId = notifDoc.userId;
      if (notifDoc.target) notificationData1.target = notifDoc.target;
      if (notifDoc.fastFoodId) notificationData1.fastFoodId = notifDoc.fastFoodId;
      notificationData1.updatedAt = new Date().toISOString();

      await db.collection('notification').doc(notifDoc.id).update({ allNotif: updatedAllNotifArray, updatedAt: new Date().toISOString() });

      const newUserNotif = { ...notificationData1, idGroup: notifDoc.id, ...newNotif, isRead: JSON.stringify(newNotif.isRead) };
      await sendPushToAll(newNotif.title, newNotif.body, { ...newUserNotif, ...extraFcmData });

      try {
        const io = getIO();
        const target = userId || fastFoodId;
        if (target) io.to(target).emit('newNotification', { notification: { ...newUserNotif, ...extraFcmData } });
      } catch (e) {
        console.error('❌ Erreur socket:', e.message);
      }

      return { success: true, data: { ...notifDoc, allNotif: updatedAllNotifArray }, message: 'Notification ajoutée avec succès' };
    }
  } catch (error) {
    console.error('Erreur dans postNotificationService:', error);
    return { success: false, message: error.message };
  }
};

// io.emit('newbonus', { message: 'Nouveau bonus', data: docRef });
