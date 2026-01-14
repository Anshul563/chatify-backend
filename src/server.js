// src/server.js
require("dotenv").config();
const express = require("express");
const http = require("http");
// const socket = require("socket.io"); // <-- REMOVED: Redundant
const admin = require("./config/firebase");
const { Server } = require("socket.io");
const cors = require("cors");
const connectDB = require("./config/db");
const User = require("./models/User"); // Import User model for FCM
const userRoutes = require("./routes/userRoutes");
const chatRoutes = require("./routes/chatRoutes");
const messageRoutes = require("./routes/messageRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const statusRoutes = require("./routes/statusRoutes");

// Connect to MongoDB
connectDB();

// App Config
const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json()); // Allow JSON data in request body

// Test Route
app.get("/", (req, res) => {
  res.send("Chatify Backend is Running!");
});

// API Routes
app.use("/api/user", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/message", messageRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/status", statusRoutes);

// Error Handling Middleware
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
app.use(notFound);
app.use(errorHandler);

// Socket.IO Setup
const io = new Server(server, {
  pingTimeout: 60000,
  cors: { origin: "*" }, // Allow all origins for dev
});

app.set("io", io); // Make io accessible in controllers

io.on("connection", (socket) => {
  console.log("Connected to socket.io: " + socket.id);

  // 1. SETUP: User joins their own room
  socket.on("setup", async (userData) => {
    socket.join(userData._id);
    socket.userData = userData; // Store for disconnect
    console.log("User Joined Personal Room: " + userData._id);

    // Update DB: Online
    await User.findByIdAndUpdate(userData._id, { isOnline: true });

    // Broadcast to everyone (simplified for prototype)
    socket.broadcast.emit("user_online", userData._id);

    socket.emit("connected");
  });

  // 2. CHAT: Join a specific Chat Room
  socket.on("join_chat", (room) => {
    socket.join(room);
    console.log("User Joined Chat Room: " + room);
  });

  // 3. TYPING INDICATORS
  socket.on("typing", (room) => socket.in(room).emit("typing"));
  socket.on("stop_typing", (room) => socket.in(room).emit("stop_typing"));

  // 4. MESSAGING: New Message
  socket.on("new_message", (newMessageReceived) => {
    var chat = newMessageReceived.chat;

    if (!chat.users) return console.log("chat.users not defined");

    chat.users.forEach((user) => {
      // Don't send it back to the sender
      if (user._id == newMessageReceived.sender._id) return;

      // Emit to the user's personal room
      socket.in(user._id).emit("message_received", newMessageReceived);
    });
  });

  // E. Disconnect
  socket.on("disconnect", async () => {
    console.log("USER DISCONNECTED");
    if (socket.userData && socket.userData._id) {
      const userId = socket.userData._id;
      // Update DB: Offline & Last Seen
      await User.findByIdAndUpdate(userId, {
        isOnline: false,
        lastSeen: new Date(),
      });
      socket.broadcast.emit("user_offline", userId);
    }
  });
}); // <--- CRITICAL: This closing bracket MUST be here (End of io.on connection)

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); // Restart
