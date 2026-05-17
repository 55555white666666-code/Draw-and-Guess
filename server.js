const path = require("path");
const crypto = require("crypto");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3001;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const CHAT_MESSAGE_MAX_LENGTH = 100;
const DRAW_MIN_SIZE = 1;
const DRAW_MAX_SIZE = 80;
const rooms = new Map();

app.use(express.static(path.join(__dirname, "public")));

function createPlayerId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return crypto.randomBytes(16).toString("hex");
}

function createRoomId() {
  let roomId;

  do {
    roomId = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(roomId));

  return roomId;
}

function validateNickname(nickname) {
  if (typeof nickname !== "string" || nickname.trim() === "") {
    return "\u6635\u79f0\u4e0d\u80fd\u4e3a\u7a7a";
  }

  if (nickname.trim().length > 20) {
    return "\u6635\u79f0\u4e0d\u80fd\u8d85\u8fc7 20 \u4e2a\u5b57\u7b26";
  }

  return "";
}

function validateRoomId(roomId) {
  if (typeof roomId !== "string" || roomId.trim() === "") {
    return "\u623f\u95f4\u53f7\u4e0d\u80fd\u4e3a\u7a7a";
  }

  if (!/^\d{6}$/.test(roomId.trim())) {
    return "\u623f\u95f4\u53f7\u5fc5\u987b\u662f 6 \u4f4d\u6570\u5b57";
  }

  return "";
}

function validateMaxPlayers(maxPlayers, currentPlayers = MIN_PLAYERS) {
  const parsedMaxPlayers = Number(maxPlayers);

  if (!Number.isInteger(parsedMaxPlayers)) {
    return "\u623f\u95f4\u4eba\u6570\u5fc5\u987b\u662f\u6574\u6570";
  }

  if (parsedMaxPlayers < MIN_PLAYERS || parsedMaxPlayers > MAX_PLAYERS) {
    return `\u623f\u95f4\u4eba\u6570\u5fc5\u987b\u5728 ${MIN_PLAYERS}-${MAX_PLAYERS} \u4eba\u4e4b\u95f4`;
  }

  if (parsedMaxPlayers < currentPlayers) {
    return "\u623f\u95f4\u4eba\u6570\u4e0d\u80fd\u5c0f\u4e8e\u5f53\u524d\u5df2\u52a0\u5165\u4eba\u6570";
  }

  return "";
}

function validateChatMessage(message) {
  if (typeof message !== "string" || message.trim() === "") {
    return "\u6d88\u606f\u4e0d\u80fd\u4e3a\u7a7a";
  }

  if (message.trim().length > CHAT_MESSAGE_MAX_LENGTH) {
    return `\u6d88\u606f\u4e0d\u80fd\u8d85\u8fc7 ${CHAT_MESSAGE_MAX_LENGTH} \u4e2a\u5b57`;
  }

  return "";
}

function isValidDrawCoordinate(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validateDrawStroke(stroke, socket) {
  if (!stroke || typeof stroke !== "object") {
    return "\u7ed8\u753b\u6570\u636e\u65e0\u6548";
  }

  if (stroke.roomId !== socket.data.roomId) {
    return "\u7ed8\u753b\u623f\u95f4\u4e0d\u5339\u914d";
  }

  if (!["brush", "eraser"].includes(stroke.tool)) {
    return "\u7ed8\u753b\u5de5\u5177\u65e0\u6548";
  }

  if (!/^#[0-9a-fA-F]{6}$/.test(stroke.color)) {
    return "\u753b\u7b14\u989c\u8272\u65e0\u6548";
  }

  if (!Number.isFinite(stroke.size) || stroke.size < DRAW_MIN_SIZE || stroke.size > DRAW_MAX_SIZE) {
    return "\u753b\u7b14\u7c97\u7ec6\u65e0\u6548";
  }

  if (
    !isValidDrawCoordinate(stroke.fromX) ||
    !isValidDrawCoordinate(stroke.fromY) ||
    !isValidDrawCoordinate(stroke.toX) ||
    !isValidDrawCoordinate(stroke.toY)
  ) {
    return "\u7ed8\u753b\u5750\u6807\u65e0\u6548";
  }

  return "";
}

function buildDrawStroke(stroke, socket) {
  return {
    roomId: socket.data.roomId,
    fromX: stroke.fromX,
    fromY: stroke.fromY,
    toX: stroke.toX,
    toY: stroke.toY,
    color: stroke.color,
    size: stroke.size,
    tool: stroke.tool,
  };
}

function getRoomPlayers(room) {
  return Array.from(room.players.values());
}

function getCurrentPlayer(socket) {
  const { roomId } = socket.data;

  if (!roomId || !rooms.has(roomId)) {
    return null;
  }

  return rooms.get(roomId).players.get(socket.id) || null;
}

function buildRoomState(roomId) {
  const room = rooms.get(roomId);
  const players = getRoomPlayers(room).map((player) => ({
    playerId: player.playerId,
    nickname: player.nickname,
    isOwner: player.playerId === room.ownerPlayerId,
  }));

  return {
    roomId,
    players,
    currentPlayers: players.length,
    minPlayers: MIN_PLAYERS,
    maxPlayers: room.maxPlayers,
    maxAllowedPlayers: MAX_PLAYERS,
    ownerPlayerId: room.ownerPlayerId,
  };
}

function emitRoomUpdate(roomId) {
  if (rooms.has(roomId)) {
    io.to(roomId).emit("room:update", buildRoomState(roomId));
  }
}

function createChatTime() {
  return new Date().toISOString();
}

function emitSystemMessage(roomId, content) {
  if (!rooms.has(roomId)) {
    return;
  }

  io.to(roomId).emit("chat:message", {
    type: "system",
    content,
    time: createChatTime(),
  });
}

function emitPlayerMessage(roomId, player, content) {
  if (!rooms.has(roomId)) {
    return;
  }

  io.to(roomId).emit("chat:message", {
    type: "player",
    playerId: player.playerId,
    nickname: player.nickname,
    content,
    time: createChatTime(),
  });
}

function leaveCurrentRoom(socket) {
  const { roomId, playerId } = socket.data;

  if (!roomId || !rooms.has(roomId)) {
    socket.data.roomId = "";
    socket.data.playerId = "";
    socket.data.nickname = "";
    return;
  }

  const room = rooms.get(roomId);
  room.players.delete(socket.id);
  socket.leave(roomId);

  if (room.players.size === 0) {
    rooms.delete(roomId);
    console.log(`Room removed: ${roomId}`);
  } else {
    const ownerStillInRoom = getRoomPlayers(room).some((player) => player.playerId === room.ownerPlayerId);

    if (!ownerStillInRoom || room.ownerPlayerId === playerId) {
      room.ownerPlayerId = getRoomPlayers(room)[0].playerId;
    }

    emitRoomUpdate(roomId);
  }

  socket.data.roomId = "";
  socket.data.playerId = "";
  socket.data.nickname = "";
}

function enterRoom(socket, roomId, nickname) {
  leaveCurrentRoom(socket);

  const room = rooms.get(roomId);
  const player = {
    playerId: createPlayerId(),
    nickname: nickname.trim(),
    socketId: socket.id,
  };

  room.players.set(socket.id, player);
  socket.data.roomId = roomId;
  socket.data.playerId = player.playerId;
  socket.data.nickname = player.nickname;
  socket.join(roomId);

  emitRoomUpdate(roomId);

  return player;
}

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("chat:send", ({ message } = {}, callback) => {
    const { roomId } = socket.data;
    const messageError = validateChatMessage(message);

    if (messageError) {
      callback?.({ ok: false, message: messageError });
      return;
    }

    if (!roomId || !rooms.has(roomId)) {
      callback?.({ ok: false, message: "\u4f60\u5df2\u4e0d\u5728\u623f\u95f4\u4e2d" });
      return;
    }

    const player = getCurrentPlayer(socket);

    if (!player) {
      callback?.({ ok: false, message: "\u73a9\u5bb6\u4e0d\u5b58\u5728" });
      return;
    }

    emitPlayerMessage(roomId, player, message.trim());
    callback?.({ ok: true });
  });

  socket.on("room:create", ({ nickname } = {}, callback) => {
    const nicknameError = validateNickname(nickname);

    if (nicknameError) {
      callback?.({ ok: false, message: nicknameError });
      return;
    }

    const roomId = createRoomId();
    const ownerPlayerId = createPlayerId();

    rooms.set(roomId, {
      ownerPlayerId,
      maxPlayers: MAX_PLAYERS,
      drawHistory: [],
      players: new Map(),
    });

    leaveCurrentRoom(socket);

    const player = {
      playerId: ownerPlayerId,
      nickname: nickname.trim(),
      socketId: socket.id,
    };

    rooms.get(roomId).players.set(socket.id, player);
    socket.data.roomId = roomId;
    socket.data.playerId = player.playerId;
    socket.data.nickname = player.nickname;
    socket.join(roomId);

    console.log(`Room created: ${roomId} by ${player.nickname} (${player.playerId})`);

    callback?.({
      ok: true,
      room: buildRoomState(roomId),
      player,
      drawHistory: rooms.get(roomId).drawHistory,
    });

    emitRoomUpdate(roomId);
    emitSystemMessage(roomId, `${player.nickname} \u521b\u5efa\u5e76\u8fdb\u5165\u623f\u95f4`);
  });

  socket.on("room:join", ({ nickname, roomId } = {}, callback) => {
    const nicknameError = validateNickname(nickname);
    const roomIdError = validateRoomId(roomId);

    if (nicknameError || roomIdError) {
      callback?.({ ok: false, message: nicknameError || roomIdError });
      return;
    }

    const normalizedRoomId = roomId.trim();

    if (!rooms.has(normalizedRoomId)) {
      callback?.({ ok: false, message: "\u623f\u95f4\u4e0d\u5b58\u5728" });
      return;
    }

    const room = rooms.get(normalizedRoomId);

    if (room.players.size >= room.maxPlayers) {
      callback?.({ ok: false, message: "\u623f\u95f4\u5df2\u6ee1" });
      return;
    }

    const player = enterRoom(socket, normalizedRoomId, nickname);
    console.log(`Room joined: ${normalizedRoomId} by ${player.nickname} (${player.playerId})`);

    callback?.({
      ok: true,
      room: buildRoomState(normalizedRoomId),
      player,
      drawHistory: room.drawHistory,
    });

    emitSystemMessage(normalizedRoomId, `${player.nickname} \u52a0\u5165\u623f\u95f4`);
  });

  socket.on("player:updateNickname", ({ nickname } = {}, callback) => {
    const nicknameError = validateNickname(nickname);
    const { roomId } = socket.data;

    if (nicknameError) {
      callback?.({ ok: false, message: nicknameError });
      return;
    }

    if (!roomId || !rooms.has(roomId)) {
      callback?.({ ok: false, message: "\u4f60\u5df2\u4e0d\u5728\u623f\u95f4\u4e2d" });
      return;
    }

    const player = rooms.get(roomId).players.get(socket.id);

    if (!player) {
      callback?.({ ok: false, message: "\u73a9\u5bb6\u4e0d\u5b58\u5728" });
      return;
    }

    const previousNickname = player.nickname;
    player.nickname = nickname.trim();
    socket.data.nickname = player.nickname;
    emitRoomUpdate(roomId);
    emitSystemMessage(roomId, `${previousNickname} \u5c06\u6635\u79f0\u4fee\u6539\u4e3a ${player.nickname}`);

    callback?.({ ok: true, player, room: buildRoomState(roomId) });
  });

  socket.on("room:updateMaxPlayers", ({ maxPlayers } = {}, callback) => {
    const { roomId, playerId } = socket.data;

    if (!roomId || !rooms.has(roomId)) {
      callback?.({ ok: false, message: "\u4f60\u5df2\u4e0d\u5728\u623f\u95f4\u4e2d" });
      return;
    }

    const room = rooms.get(roomId);

    if (room.ownerPlayerId !== playerId) {
      callback?.({ ok: false, message: "\u53ea\u6709\u623f\u4e3b\u53ef\u4ee5\u4fee\u6539\u623f\u95f4\u4eba\u6570" });
      return;
    }

    const maxPlayersError = validateMaxPlayers(maxPlayers, room.players.size);

    if (maxPlayersError) {
      callback?.({ ok: false, message: maxPlayersError });
      return;
    }

    room.maxPlayers = Number(maxPlayers);
    emitRoomUpdate(roomId);

    callback?.({ ok: true, room: buildRoomState(roomId) });
  });

  socket.on("draw", (stroke) => {
    const { roomId } = socket.data;

    if (!roomId || !rooms.has(roomId) || !getCurrentPlayer(socket)) {
      return;
    }

    const strokeError = validateDrawStroke(stroke, socket);

    if (strokeError) {
      return;
    }

    const drawStroke = buildDrawStroke(stroke, socket);
    rooms.get(roomId).drawHistory.push(drawStroke);
    socket.to(roomId).emit("draw", drawStroke);
  });

  socket.on("draw:clear", ({ roomId } = {}, callback) => {
    if (!roomId || roomId !== socket.data.roomId || !rooms.has(roomId) || !getCurrentPlayer(socket)) {
      callback?.({ ok: false, message: "\u4f60\u5df2\u4e0d\u5728\u623f\u95f4\u4e2d" });
      return;
    }

    rooms.get(roomId).drawHistory = [];
    socket.to(roomId).emit("draw:clear", { roomId });
    callback?.({ ok: true });
  });

  socket.on("room:leave", (callback) => {
    const roomId = socket.data.roomId;
    const nickname = socket.data.nickname;
    leaveCurrentRoom(socket);

    if (roomId && rooms.has(roomId) && nickname) {
      emitSystemMessage(roomId, `${nickname} \u79bb\u5f00\u623f\u95f4`);
    }

    console.log(`Socket left room: ${socket.id}. Room: ${roomId || "none"}`);
    callback?.({ ok: true });
  });

  socket.on("disconnect", (reason) => {
    const { roomId, nickname, playerId } = socket.data;
    leaveCurrentRoom(socket);

    if (roomId && rooms.has(roomId) && nickname) {
      emitSystemMessage(roomId, `${nickname} \u5df2\u65ad\u5f00\u8fde\u63a5`);
    }

    console.log(
      `Socket disconnected: ${socket.id}. Player: ${nickname || "unknown"} (${playerId || "none"}). Room: ${
        roomId || "none"
      }. Reason: ${reason}`
    );
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
