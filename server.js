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
const WORDS = [
  "\u82f9\u679c",
  "\u81ea\u884c\u8f66",
  "\u5927\u6811",
  "\u706b\u7bad",
  "\u732b",
  "\u96e8\u4f1e",
  "\u7535\u8111",
  "\u86cb\u7cd5",
  "\u592a\u9633",
  "\u6708\u4eae",
  "\u98de\u673a",
  "\u623f\u5b50",
  "\u897f\u74dc",
  "\u9c7c",
  "\u624b\u673a",
  "\u661f\u661f",
  "\u94a5\u5319",
  "\u773c\u955c",
  "\u96ea\u4eba",
  "\u6c7d\u8f66",
];
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

function createGameState() {
  return {
    status: "waiting",
    drawOrder: [],
    currentRoundIndex: -1,
    currentDrawerId: "",
    currentWord: "",
    scores: {},
    guessedPlayerIds: new Set(),
    leaderboard: [],
    message: "\u7b49\u5f85\u5f00\u59cb\u6e38\u620f",
  };
}

function shuffleItems(items) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

function chooseWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
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

function getScoreList(room) {
  return getRoomPlayers(room)
    .map((player) => ({
      playerId: player.playerId,
      nickname: player.nickname,
      score: room.game.scores[player.playerId] || 0,
    }))
    .sort((left, right) => right.score - left.score || left.nickname.localeCompare(right.nickname));
}

function buildGameStateForPlayer(roomId, playerId) {
  const room = rooms.get(roomId);
  const { game } = room;
  const currentDrawer = getRoomPlayers(room).find((player) => player.playerId === game.currentDrawerId);
  const isDrawer = game.status === "playing" && game.currentDrawerId === playerId;

  return {
    status: game.status,
    message: game.message,
    isOwner: room.ownerPlayerId === playerId,
    canStart: room.ownerPlayerId === playerId && getRoomPlayers(room).length >= MIN_PLAYERS && game.status !== "playing",
    isDrawer,
    currentDrawerId: game.currentDrawerId,
    currentDrawerNickname: currentDrawer?.nickname || "",
    word: isDrawer ? game.currentWord : "",
    roundNumber: game.status === "playing" ? game.currentRoundIndex + 1 : 0,
    totalRounds: game.drawOrder.length,
    scores: getScoreList(room),
    leaderboard: game.status === "ended" ? game.leaderboard : [],
  };
}

function emitRoomUpdate(roomId) {
  if (rooms.has(roomId)) {
    io.to(roomId).emit("room:update", buildRoomState(roomId));
  }
}

function emitGameState(roomId) {
  if (!rooms.has(roomId)) {
    return;
  }

  const room = rooms.get(roomId);

  room.players.forEach((player, socketId) => {
    io.to(socketId).emit("game:state", buildGameStateForPlayer(roomId, player.playerId));
  });
}

function emitGameStateToSocket(socket) {
  const { roomId, playerId } = socket.data;

  if (roomId && playerId && rooms.has(roomId)) {
    socket.emit("game:state", buildGameStateForPlayer(roomId, playerId));
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

function finishGame(roomId, message = "\u672c\u5c40\u7ed3\u675f") {
  if (!rooms.has(roomId)) {
    return;
  }

  const room = rooms.get(roomId);
  room.game.status = "ended";
  room.game.currentDrawerId = "";
  room.game.currentWord = "";
  room.game.guessedPlayerIds = new Set();
  room.game.leaderboard = getScoreList(room);
  room.game.message = message;
  emitSystemMessage(roomId, message);
  emitGameState(roomId);
}

function endGameForNotEnoughPlayers(roomId) {
  if (!rooms.has(roomId)) {
    return;
  }

  finishGame(roomId, "\u4eba\u6570\u4e0d\u8db3\uff0c\u6e38\u620f\u5df2\u7ed3\u675f");
}

function startNextRound(roomId) {
  if (!rooms.has(roomId)) {
    return;
  }

  const room = rooms.get(roomId);

  if (getRoomPlayers(room).length < MIN_PLAYERS) {
    endGameForNotEnoughPlayers(roomId);
    return;
  }

  room.game.currentRoundIndex += 1;

  while (
    room.game.currentRoundIndex < room.game.drawOrder.length &&
    !getRoomPlayers(room).some((player) => player.playerId === room.game.drawOrder[room.game.currentRoundIndex])
  ) {
    room.game.currentRoundIndex += 1;
  }

  if (room.game.currentRoundIndex >= room.game.drawOrder.length) {
    finishGame(roomId, "\u6240\u6709\u73a9\u5bb6\u90fd\u5df2\u5b8c\u6210\u4e00\u6b21\u4f5c\u753b\uff0c\u6e38\u620f\u7ed3\u675f");
    return;
  }

  room.game.status = "playing";
  room.game.currentDrawerId = room.game.drawOrder[room.game.currentRoundIndex];
  room.game.currentWord = chooseWord();
  room.game.guessedPlayerIds = new Set();
  room.game.message = "\u65b0\u4e00\u8f6e\u5f00\u59cb";
  room.drawHistory = [];

  const drawer = getRoomPlayers(room).find((player) => player.playerId === room.game.currentDrawerId);
  io.to(roomId).emit("draw:clear", { roomId });
  emitSystemMessage(roomId, `\u7b2c ${room.game.currentRoundIndex + 1} \u8f6e\u5f00\u59cb\uff0c${drawer.nickname} \u662f\u753b\u624b`);
  emitGameState(roomId);
}

function startGame(roomId) {
  const room = rooms.get(roomId);
  const players = getRoomPlayers(room);

  room.game = createGameState();
  room.game.status = "playing";
  room.game.drawOrder = shuffleItems(players.map((player) => player.playerId));
  room.game.scores = Object.fromEntries(players.map((player) => [player.playerId, 0]));
  room.game.message = "\u6e38\u620f\u5df2\u5f00\u59cb";
  room.drawHistory = [];

  emitSystemMessage(roomId, "\u6e38\u620f\u5f00\u59cb");
  startNextRound(roomId);
}

function handlePlayerLeftGame(roomId, playerId) {
  if (!rooms.has(roomId)) {
    return;
  }

  const room = rooms.get(roomId);

  if (room.game.status !== "playing") {
    emitGameState(roomId);
    return;
  }

  if (getRoomPlayers(room).length < MIN_PLAYERS) {
    endGameForNotEnoughPlayers(roomId);
    return;
  }

  if (room.game.currentDrawerId === playerId) {
    emitSystemMessage(roomId, "\u5f53\u524d\u753b\u624b\u5df2\u79bb\u5f00\uff0c\u8fdb\u5165\u4e0b\u4e00\u8f6e");
    startNextRound(roomId);
    return;
  }

  emitGameState(roomId);
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
    handlePlayerLeftGame(roomId, playerId);
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

    const content = message.trim();
    const room = rooms.get(roomId);
    const { game } = room;

    if (game.status === "playing" && player.playerId === game.currentDrawerId && content === game.currentWord) {
      callback?.({ ok: false, message: "\u753b\u624b\u4e0d\u80fd\u53d1\u9001\u5f53\u524d\u7b54\u6848" });
      return;
    }

    const isCorrectGuess =
      game.status === "playing" &&
      player.playerId !== game.currentDrawerId &&
      !game.guessedPlayerIds.has(player.playerId) &&
      content === game.currentWord;

    if (isCorrectGuess) {
      game.scores[player.playerId] = (game.scores[player.playerId] || 0) + 1;
      game.scores[game.currentDrawerId] = (game.scores[game.currentDrawerId] || 0) + 1;
      game.guessedPlayerIds.add(player.playerId);
      emitSystemMessage(roomId, `${player.nickname} \u731c\u4e2d\u4e86\uff01\u7b54\u6848\u662f\uff1a${game.currentWord}`);
      startNextRound(roomId);
      callback?.({ ok: true, guessed: true });
      return;
    }

    emitPlayerMessage(roomId, player, content);
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
      game: createGameState(),
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
      gameState: buildGameStateForPlayer(roomId, player.playerId),
    });

    emitRoomUpdate(roomId);
    emitGameState(roomId);
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
    room.game.scores[player.playerId] = room.game.scores[player.playerId] || 0;
    console.log(`Room joined: ${normalizedRoomId} by ${player.nickname} (${player.playerId})`);

    callback?.({
      ok: true,
      room: buildRoomState(normalizedRoomId),
      player,
      drawHistory: room.drawHistory,
      gameState: buildGameStateForPlayer(normalizedRoomId, player.playerId),
    });

    emitSystemMessage(normalizedRoomId, `${player.nickname} \u52a0\u5165\u623f\u95f4`);
    emitGameState(normalizedRoomId);
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
    emitGameState(roomId);

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

  socket.on("game:start", (callback) => {
    const { roomId, playerId } = socket.data;

    if (!roomId || !rooms.has(roomId)) {
      callback?.({ ok: false, message: "\u4f60\u5df2\u4e0d\u5728\u623f\u95f4\u4e2d" });
      return;
    }

    const room = rooms.get(roomId);

    if (room.ownerPlayerId !== playerId) {
      callback?.({ ok: false, message: "\u53ea\u6709\u623f\u4e3b\u53ef\u4ee5\u5f00\u59cb\u6e38\u620f" });
      return;
    }

    if (getRoomPlayers(room).length < MIN_PLAYERS) {
      callback?.({ ok: false, message: "\u81f3\u5c11 2 \u4eba\u624d\u80fd\u5f00\u59cb\u6e38\u620f" });
      return;
    }

    if (getRoomPlayers(room).length > MAX_PLAYERS) {
      callback?.({ ok: false, message: "\u6bcf\u5c40\u6700\u591a 8 \u4eba" });
      return;
    }

    if (room.game.status === "playing") {
      callback?.({ ok: false, message: "\u6e38\u620f\u5df2\u7ecf\u5f00\u59cb" });
      return;
    }

    startGame(roomId);
    callback?.({ ok: true });
  });

  socket.on("draw", (stroke) => {
    const { roomId } = socket.data;

    if (!roomId || !rooms.has(roomId)) {
      return;
    }

    const player = getCurrentPlayer(socket);
    const room = rooms.get(roomId);

    if (!player) {
      return;
    }

    if (room.game.status === "playing" && room.game.currentDrawerId !== player.playerId) {
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

    const room = rooms.get(roomId);
    const player = getCurrentPlayer(socket);

    if (room.game.status === "playing" && room.game.currentDrawerId !== player.playerId) {
      callback?.({ ok: false, message: "\u53ea\u6709\u5f53\u524d\u753b\u624b\u53ef\u4ee5\u6e05\u7a7a\u753b\u677f" });
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
