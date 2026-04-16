const { db } = require('../../config/firebase');

exports.updateFastFoodService = async (fastFoodId, data) => {
  // Validate that fastfood exists
  const docRef = db.collection('fastfoods').doc(fastFoodId);
  const doc = await docRef.get();

  if (!doc.exists) {
    const error = new Error('Fastfood non trouvé');
    error.code = 404;
    throw error;
  }

  const existingData = doc.data();

  // Build update object - only include fields that are provided
  const updateData = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.number !== undefined) updateData.number = data.number;
  if (data.openTime !== undefined) updateData.openTime = data.openTime;
  if (data.closeTime !== undefined) updateData.closeTime = data.closeTime;
  if (data.image !== undefined) updateData.image = data.image;
  if (data.orderLeadTime !== undefined) updateData.orderLeadTime = data.orderLeadTime;
  if (data.deliveryHours !== undefined) updateData.deliveryHours = data.deliveryHours;

  // Add timestamp
  updateData.updatedAt = new Date().toISOString();

  // Perform update
  await docRef.update(updateData);

  // Return the updated document
  const updatedDoc = await docRef.get();
  return {
    id: updatedDoc.id,
    ...updatedDoc.data()
  };
};
