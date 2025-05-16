const accountSid = 'AC47415ae3c9ff7dc5d96d1525a5db45ad';
const authToken = 'aa3b6a89e33fa81a8f03061dbcae258f';
const client = require('twilio')(accountSid, authToken);

exports.postSmsWhatsapp = async () => {
  try {
    // const message = await client.messages.create({
    //   from: 'whatsapp:+14155238886',
    //   contentSid: 'HXa4cfad6397f61da08f1c82ab6b944ac7',
    //   // contentVariables: '{"1":"12/1","2":"3pm"}',
    //   to: 'whatsapp:+237698087460',

    // });
    // console.log('Message SID:', message.sid);

    const message = await client.messages.create({
      body: 'Hello, ceci est un SMS envoyé via Twilio !', // Contenu du message
      from: '+15677495753', // Ton numéro Twilio (ex: +14155552671)
      to: '+237698087460', // Le numéro du destinataire (en format international)
    });
    // console.log('Message SID:', message.sid); // Affiche le SID du message
    return message;
  } catch (error) {
    console.error('Erreur d’envoi WhatsApp :', error);
    throw error;
  }
};
