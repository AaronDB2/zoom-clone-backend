const express = require("express");
const http = require("http");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");
const twilio = require("twilio");

// Define PORT
const PORT = process.env.PORT || 3001;

// Init express app
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Middleware for CORS
app.use(cors());

var connectedUsers = [];
var rooms = [];

// Create route to check if room exists
app.get("/api/room-exists/:roomId", (req, res) => {
  const { roomId } = req.params;
  const room = rooms.find((room) => room.id === roomId);

  // Check if room exists
  if (room) {
    // Check if room is full
    if (room.connectedUsers.length > 3) {
      return res.send({ roomExists: true, full: true });
    } else {
      return res.send({ roomExists: true, full: false });
    }
  } else {
    return res.send({ roomExists: false });
  }
});

// Init socket
const io = require("socket.io")(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Listen for connections
io.on("connection", (socket) => {
  console.log(`user connected ${socket.id}`);

  // Listening for create-new-room event
  socket.on("create-new-room", (data) => {
    createNewRoomHandler(data, socket);
  });

  // Listening for join-room event
  socket.on("join-room", (data) => {
    joinRoomHandler(data, socket);
  });

  // Listening for disconnect event
  socket.on("disconnect", (data) => {
    disconnectHandler(socket);
  });

  // Listening for conn-signal event
  socket.on("conn-signal", (data) => {
    signalingHandler(data, socket);
  });

  // Listening for conn-init event
  socket.on("conn-init", (data) => {
    initializeConnectionHandler(data, socket);
  });
});

// Socket.io handlers

// Handler for creating a new room
const createNewRoomHandler = (data, socket) => {
  console.log("host is creating new room");
  console.log(data);

  const { identity } = data;

  // Generate random UUID
  const roomId = uuidv4();

  // Create new user
  const newUser = {
    identity,
    id: uuidv4(),
    socketId: socket.id,
    roomId,
  };

  // Push that user to connectedUsers
  connectedUsers = [...connectedUsers, newUser];

  // Create new room
  const newRoom = {
    id: roomId,
    connectedUsers: [newUser],
  };

  // Join socket.io room
  socket.join(roomId);

  rooms = [...rooms, newRoom];

  // Emit to client that created the room the roomID
  socket.emit("room-id", { roomId });

  // Emit an event to all users connected to that room about a new user
  socket.emit("room-update", { connectedUsers: newRoom.connectedUsers });
};

// Handler for joining a room
const joinRoomHandler = (data, socket) => {
  const { identity, roomId } = data;

  // Create new user
  const newUser = {
    identity,
    id: uuidv4(),
    socketId: socket.id,
    roomId,
  };

  // join room as user which is passing room id to join the room
  const room = rooms.find((room) => room.id === roomId);
  room.connectedUsers = [...room.connectedUsers, newUser];

  // Join socket.io room
  socket.join(roomId);

  // add new user to connected users array
  connectedUsers = [...connectedUsers, newUser];

  // emit to all users which are already in this room to prepare peer connection
  room.connectedUsers.forEach((user) => {
    if (user.socketId !== socket.id) {
      const data = {
        connUserSocketId: socket.id,
      };

      io.to(roomId).emit("conn-prepare", data);
    }
  });

  // Send room-update event to all connected users in the room
  io.to(roomId).emit("room-update", { connectedUsers: room.connectedUsers });
};

// Handler for disconnecting from a room
const disconnectHandler = (socket) => {
  // Find if user has been registerd
  // If yes remove him/her from room and connected users array
  const user = connectedUsers.find((user) => user.socketId === socket.id);

  if (user) {
    const room = rooms.find((room) => room.id === user.roomId);
    // remove user from room in server
    room.connectedUsers = room.connectedUsers.filter(
      (user) => user.socketId !== socket.id
    );

    // leave socket io room
    socket.leave(user.roomId);

    // close the room if there are no more users in the room
    if (room.connectedUsers.length > 0) {
      // emit to all users in the room that a user has disconnected
      io.to(room.id).emit("user-disconnected", { socketId: socket.id });

      // emit an event to the rest of the users in the room the updated connectedUsers array
      io.to(room.id).emit("room-update", {
        connectedUsers: room.connectedUsers,
      });
    } else {
      rooms = rooms.filter((r) => r.id !== room.id);
    }
  }
};

// Handler for signaling data
const signalingHandler = (data, socket) => {
  const { connUserSocketId, signal } = data;

  const signalingData = { signal, connUserSocketId: socket.id };

  io.to(connUserSocketId).emit("conn-signal", signalingData);
};

// Handler for initializing connection
const initializeConnectionHandler = (data, socket) => {
  const { connUserSocketId } = data;

  const initData = { connUserSocketId: socket.id };
  io.to(connUserSocketId).emit("conn-init", initData);
};

// Start server
server.listen(PORT, () => {
  console.log(`Server is listening on ${PORT}`);
});
