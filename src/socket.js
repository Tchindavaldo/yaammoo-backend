// src/socket.js
let io;

module.exports = 

{
    init: (server) => 
{
    io = require("socket.io")(server, 
{
    cors: 
{
    origin: "*", methods: ["*"], allowedHeaders: ["*"], credentials: true, }, });

        io.on("connection", (socket) => 
{
    console.log("🟢 Client connecté :", socket.id);
            socket.on("join_fastfood", (fastfoodId) => 
{
    socket.join(fastfoodId); console.log(`🔐 Socket $
{
    socket.id} a rejoint la room fastfood: $
{
    fastfoodId}`); });
            socket.on("disconnect", () => 
{
    console.log("🔴 Client déconnecté :", socket.id); });

        });

        return io;

    },

    getIO: () => 
{
    if (!io) 

{
    throw new Error("Socket.io non initialisé !"); }
        return io;

    }
};
