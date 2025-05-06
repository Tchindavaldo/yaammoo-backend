const { v4: uuidv4 } = require('uuid');
const { bucket } = require('../../config/firebase');

exports.uploadImageToFirebase = async file => {
  if (!file) throw new Error('Aucun fichier fourni');

  const fileName = `fastFood/${uuidv4()}_${file.originalname}`;
  const fileRef = bucket.file(fileName);

  await fileRef.save(file.buffer, {
    metadata: {
      contentType: file.mimetype,
    },
  });

  // Rendre le fichier public (optionnel mais pratique)
  await fileRef.makePublic();

  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
  return publicUrl;
};
