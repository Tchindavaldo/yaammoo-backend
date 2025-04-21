const express = require("express");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const app = require("./app"); // 🔁 on importe l'app configurée
const PORT = process.env.PORT || 5000;

// Création du serveur HTTP
const server = http.createServer(app);

// Configuration de Socket.io
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["*"],
        allowedHeaders: ["*"],
        credentials: true,
    },
});

// Exemple d'écoute côté serveur Socket.io
io.on("connection", (socket) => {
    console.log("🟢 Un client est connecté : " + socket.id);

    socket.on("disconnect", () => {
        console.log("🔴 Client déconnecté : " + socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
});
