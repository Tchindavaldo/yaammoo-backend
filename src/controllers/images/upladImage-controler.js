const { uploadImageToFirebase } = require('../../services/images/upladImage.service');

exports.handleUpload = async (req, res) => {
  try {
    // console.log('upload appeler', req.file);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const imageUrl = await uploadImageToFirebase(req.file);
    res.status(200).json({ message: 'photo uploader avec succès.', data: imageUrl });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
