const admin = require('firebase-admin');

exports.registerService = async user => {
  const userRecord = await admin.auth().createUser({
    email: user.email,
    password: user.password,
    displayName: user.displayName || '',
  });

  const userReturn = { id: userRecord.uid, ...user, createdAt: new Date().toISOString() };
  await admin.firestore().collection('users').doc(userRecord.uid).set(userReturn);
  // const userget = await admin.auth().getUserByEmail('tchindavaldoblair2@example.com');
  // console.log(userget);

  return userReturn;
};
