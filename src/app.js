// src/app.js

const cors = require('cors');
const express = require('express');

const smsRoutes = require('./routes/smsRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const orderRoutes = require('./routes/orderRoutes');
const menuRoutes = require('./routes/menuRoutes');
const fastfoodRoutes = require('./routes/fastfoodRoutes');

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: '*',
    methods: '*',
    allowedHeaders: '*',
    credentials: true,
  })
);

app.use('/sms', smsRoutes);

app.use('/auth', authRoutes);

app.use('/user', userRoutes);

app.use('/order', orderRoutes);

app.use('/menu', menuRoutes);

app.use('/users', userRoutes);

app.use('/fastFood', fastfoodRoutes);

module.exports = app;
