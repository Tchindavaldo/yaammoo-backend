const { admin, db } = require("../../config/firebase");















const createFastfood = async (data) => {

    const dataSend = { namefasfood: 'fastfood from api' }
    const time = admin.firestore.FieldValue.serverTimestamp()


    const fastfoodData = { ...dataSend, createdAt: time };
    const docRef = await db.collection('fastfoods').add(fastfoodData);

    const data1 = { id: docRef.id, ...fastfoodData, }
    const dataFinal = { data1, data2: docRef }
    return { dataFinal };


};

module.exports = createFastfood