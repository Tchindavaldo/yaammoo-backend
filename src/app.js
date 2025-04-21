// src/app.js
const express = require('express');
const cors = require("cors");
const userRoutes = require('./routes/userRoutes');

const app = express();

app.use(express.json());
app.use(cors({ origin: "*", methods: "*", allowedHeaders: "*", credentials: true, }));



app.use('/api', userRoutes);

module.exports = app;

