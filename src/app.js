// src/app.js

const cors = require("cors");
const express = require('express');

const userRoutes = require('./routes/userRoutes');
const orderRoutes = require('./routes/orderRoutes');
const fastfoodRoutes = require('./routes/fastfoodRoutes');

const app = express();

app.use(express.json());
app.use(cors(
{
    origin: "*", methods: "*", allowedHeaders: "*", credentials: true, }));

app.use('/order', orderRoutes);
app.use('/users', userRoutes);
app.use('/fastfood', fastfoodRoutes);

module.exports = app;

