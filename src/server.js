const express = require("express");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const app = require("./app"); // 🔁 on importe l'app configurée
const socket = require("./socket");
const PORT = process.env.PORT || 5000;

// Création du serveur HTTP
const server = http.createServer(app);

// Configuration de Socket.io
socket.init(server);
server.listen(PORT, () => 
{
    console.log(`🚀 Serveur lancé sur http://localhost:$
{
    PORT}`); });
