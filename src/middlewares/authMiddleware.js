// src/middlewares/firebaseAuth.js
const 
{
    admin } = require('../config/firebase');

module.exports = async (req, res, next) => 
{
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) 
{
    return res.status(401).json(
{
    error: 'Authorization header missing or malformed.' });
    }

    const token = authHeader.split(' ')[1];

    try 
{
    const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) 

{
    res.status(401).json(
{
    error: 'Invalid or expired token.' });
    }
};
