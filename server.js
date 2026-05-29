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
const MIN_ROUND_SECONDS = 30;
const MAX_ROUND_SECONDS = 180;
const DEFAULT_ROUND_SECONDS = 60;
const ALLOWED_DRAW_TIMES = [1, 2];
const DEFAULT_DRAW_TIMES_PER_PLAYER = 1;
const WORDS = [
  "苹果",
  "自行车",
  "大树",
  "火箭",
  "猫",
  "雨伞",
  "电脑",
  "蛋糕",
  "太阳",
  "月亮",
  "飞机",
  "房子",
  "西瓜",
  "鱼",
  "手机",
  "星星",
  "钥匙",
  "眼镜",
  "雪人",
  "汽车",
  "香蕉",
  "草莓",
  "葡萄",
  "云朵",
  "小狗",
  "小猫",
  "兔子",
  "熊猫",
  "小鸟",
  "乌龟",
  "蝴蝶",
  "鸭子",
  "大象",
  "杯子",
  "椅子",
  "桌子",
  "书包",
  "电视",
  "相机",
  "耳机",
  "手表",
  "火车",
  "冰淇淋",
  "汉堡",
  "薯条",
  "披萨",
  "篮球",
  "足球",
  "羽毛球",
  "乒乓球",
  "滑板",
  "游泳",
  "跑步",
  "跳舞",
  "唱歌",
  "画画",
  "医生",
  "老师",
  "警察",
  "厨师",
  "消防员",
  "超市",
  "学校",
  "医院",
  "电影院",
  "游乐园",
  "电梯",
  "红绿灯",
  "斑马线",
  "公交车",
  "地铁",
  "生日蛋糕",
  "圣诞树",
  "红包",
  "灯笼",
  "风筝",
  "牙刷",
  "拖鞋",
  "枕头",
  "镜子",
  "闹钟",
  "奶茶",
  "火锅",
  "饺子",
  "泡面",
  "糖葫芦",
  "外卖员",
  "程序员",
  "摄影师",
  "宇航员",
  "魔术师",
  "潜水艇",
  "热气球",
  "摩天轮",
  "过山车",
  "旋转木马",
  "显微镜",
  "望远镜",
  "打印机",
  "充电宝",
  "无人机",
  "龙卷风",
  "火山爆发",
  "彩虹",
  "海啸",
  "沙漠",
  "剪刀石头布",
  "捉迷藏",
  "拔河",
  "跳绳",
  "打喷嚏",
  "熬夜",
  "迟到",
  "考试",
  "加班",
  "放假",
  "吃瓜群众",
  "社恐",
  "破防",
  "emo",
  "点赞",
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
    remainingSeconds: 0,
    roundEndsAt: 0,
    roundTimerId: null,
  };
}

function createDefaultSettings() {
  return {
    roundSeconds: DEFAULT_ROUND_SECONDS,
    drawTimesPerPlayer: DEFAULT_DRAW_TIMES_PER_PLAYER,
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

function validateRoundSeconds(roundSeconds) {
  const parsedRoundSeconds = Number(roundSeconds);

  if (!Number.isInteger(parsedRoundSeconds)) {
    return "\u6bcf\u8f6e\u65f6\u95f4\u5fc5\u987b\u662f\u6574\u6570";
  }

  if (parsedRoundSeconds < MIN_ROUND_SECONDS || parsedRoundSeconds > MAX_ROUND_SECONDS) {
    return `\u6bcf\u8f6e\u65f6\u95f4\u5fc5\u987b\u5728 ${MIN_ROUND_SECONDS}-${MAX_ROUND_SECONDS} \u79d2\u4e4b\u95f4`;
  }

  return "";
}

function validateDrawTimesPerPlayer(drawTimesPerPlayer) {
  const parsedDrawTimesPerPlayer = Number(drawTimesPerPlayer);

  if (!Number.isInteger(parsedDrawTimesPerPlayer)) {
    return "\u6bcf\u4eba\u7ed8\u753b\u6b21\u6570\u5fc5\u987b\u662f\u6574\u6570";
  }

  if (!ALLOWED_DRAW_TIMES.includes(parsedDrawTimesPerPlayer)) {
    return "\u6bcf\u4eba\u7ed8\u753b\u6b21\u6570\u53ea\u80fd\u9009\u62e9 1 \u6b21\u6216 2 \u6b21";
  }

  return "";
}

function validateGameSettings({ roundSeconds, drawTimesPerPlayer } = {}) {
  return validateRoundSeconds(roundSeconds) || validateDrawTimesPerPlayer(drawTimesPerPlayer);
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
    settings: room.settings,
    settingLimits: {
      minRoundSeconds: MIN_ROUND_SECONDS,
      maxRoundSeconds: MAX_ROUND_SECONDS,
      allowedDrawTimes: ALLOWED_DRAW_TIMES,
    },
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

function buildDrawOrder(players, drawTimesPerPlayer) {
  const playerIds = players.map((player) => player.playerId);
  const drawOrder = [];

  for (let count = 0; count < drawTimesPerPlayer; count += 1) {
    drawOrder.push(...shuffleItems(playerIds));
  }

  return drawOrder;
}

function updateRemainingSeconds(room) {
  if (room.game.status !== "playing" || !room.game.roundEndsAt) {
    room.game.remainingSeconds = 0;
    return 0;
  }

  room.game.remainingSeconds = Math.max(0, Math.ceil((room.game.roundEndsAt - Date.now()) / 1000));
  return room.game.remainingSeconds;
}

function buildGameStateForPlayer(roomId, playerId) {
  const room = rooms.get(roomId);
  const { game } = room;
  const currentDrawer = getRoomPlayers(room).find((player) => player.playerId === game.currentDrawerId);
  const isDrawer = game.status === "playing" && game.currentDrawerId === playerId;
  const remainingSeconds = updateRemainingSeconds(room);

  return {
    status: game.status,
    message: game.message,
    isOwner: room.ownerPlayerId === playerId,
    canStart: room.ownerPlayerId === playerId && getRoomPlayers(room).length >= MIN_PLAYERS && game.status !== "playing",
    canUpdateSettings: room.ownerPlayerId === playerId && game.status !== "playing",
    isDrawer,
    currentDrawerId: game.currentDrawerId,
    currentDrawerNickname: currentDrawer?.nickname || "",
    word: isDrawer ? game.currentWord : "",
    roundNumber: game.status === "playing" ? game.currentRoundIndex + 1 : 0,
    totalRounds: game.drawOrder.length,
    remainingSeconds,
    roundSeconds: room.settings.roundSeconds,
    drawTimesPerPlayer: room.settings.drawTimesPerPlayer,
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

function clearRoundTimer(room) {
  if (room.game.roundTimerId) {
    clearInterval(room.game.roundTimerId);
    room.game.roundTimerId = null;
  }
}

function emitRoundTimer(roomId) {
  if (!rooms.has(roomId)) {
    return;
  }

  const room = rooms.get(roomId);

  io.to(roomId).emit("game:timer", {
    remainingSeconds: updateRemainingSeconds(room),
    roundSeconds: room.settings.roundSeconds,
  });
}

function handleRoundTimerTick(roomId) {
  if (!rooms.has(roomId)) {
    return;
  }

  const room = rooms.get(roomId);

  if (room.game.status !== "playing") {
    clearRoundTimer(room);
    return;
  }

  const remainingSeconds = updateRemainingSeconds(room);
  emitRoundTimer(roomId);

  if (remainingSeconds > 0) {
    return;
  }

  const answer = room.game.currentWord;
  clearRoundTimer(room);
  room.game.roundEndsAt = 0;
  room.game.remainingSeconds = 0;

  if (answer) {
    emitSystemMessage(roomId, `\u65f6\u95f4\u5230\uff01\u7b54\u6848\u662f\uff1a${answer}`);
  } else {
    emitSystemMessage(roomId, "\u65f6\u95f4\u5230\uff0c\u8fdb\u5165\u4e0b\u4e00\u8f6e");
  }

  startNextRound(roomId);
}

function startRoundTimer(roomId) {
  if (!rooms.has(roomId)) {
    return;
  }

  const room = rooms.get(roomId);

  clearRoundTimer(room);
  room.game.remainingSeconds = room.settings.roundSeconds;
  room.game.roundEndsAt = Date.now() + room.settings.roundSeconds * 1000;
  room.game.roundTimerId = setInterval(() => {
    handleRoundTimerTick(roomId);
  }, 1000);
  emitRoundTimer(roomId);
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
  clearRoundTimer(room);
  room.game.status = "ended";
  room.game.currentDrawerId = "";
  room.game.currentWord = "";
  room.game.guessedPlayerIds = new Set();
  room.game.leaderboard = getScoreList(room);
  room.game.message = message;
  room.game.remainingSeconds = 0;
  room.game.roundEndsAt = 0;
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
  clearRoundTimer(room);

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
    finishGame(roomId, "\u6240\u6709\u56de\u5408\u90fd\u5df2\u5b8c\u6210\uff0c\u6e38\u620f\u7ed3\u675f");
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
  startRoundTimer(roomId);
  emitGameState(roomId);
}

function startGame(roomId) {
  const room = rooms.get(roomId);
  const players = getRoomPlayers(room);

  clearRoundTimer(room);
  room.game = createGameState();
  room.game.status = "playing";
  room.game.drawOrder = buildDrawOrder(players, room.settings.drawTimesPerPlayer);
  room.game.scores = Object.fromEntries(players.map((player) => [player.playerId, 0]));
  room.game.message = "\u6e38\u620f\u5df2\u5f00\u59cb";
  room.drawHistory = [];

  emitSystemMessage(roomId, "\u6e38\u620f\u5f00\u59cb");
  emitRoomUpdate(roomId);
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
    clearRoundTimer(room);
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
      settings: createDefaultSettings(),
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

  socket.on("game:updateSettings", ({ roundSeconds, drawTimesPerPlayer } = {}, callback) => {
    const { roomId, playerId } = socket.data;

    if (!roomId || !rooms.has(roomId)) {
      callback?.({ ok: false, message: "\u4f60\u5df2\u4e0d\u5728\u623f\u95f4\u4e2d" });
      return;
    }

    const room = rooms.get(roomId);

    if (room.ownerPlayerId !== playerId) {
      callback?.({ ok: false, message: "\u53ea\u6709\u623f\u4e3b\u53ef\u4ee5\u4fee\u6539\u6e38\u620f\u8bbe\u7f6e" });
      return;
    }

    if (room.game.status === "playing") {
      callback?.({ ok: false, message: "\u6e38\u620f\u5f00\u59cb\u540e\u4e0d\u80fd\u4fee\u6539\u8bbe\u7f6e" });
      return;
    }

    const settingsError = validateGameSettings({ roundSeconds, drawTimesPerPlayer });

    if (settingsError) {
      callback?.({ ok: false, message: settingsError });
      return;
    }

    room.settings = {
      roundSeconds: Number(roundSeconds),
      drawTimesPerPlayer: Number(drawTimesPerPlayer),
    };

    emitRoomUpdate(roomId);
    emitGameState(roomId);
    emitSystemMessage(
      roomId,
      `\u6e38\u620f\u8bbe\u7f6e\u5df2\u66f4\u65b0\uff1a\u6bcf\u8f6e ${room.settings.roundSeconds} \u79d2\uff0c\u6bcf\u4eba\u4f5c\u753b ${room.settings.drawTimesPerPlayer} \u6b21`
    );

    callback?.({ ok: true, room: buildRoomState(roomId) });
  });

  socket.on("game:start", (callback) => {
    const respond = typeof callback === "function" ? callback : () => {};
    const { roomId, playerId } = socket.data;

    if (!roomId || !rooms.has(roomId)) {
      respond({ ok: false, message: "\u4f60\u5df2\u4e0d\u5728\u623f\u95f4\u4e2d" });
      return;
    }

    const room = rooms.get(roomId);

    if (room.ownerPlayerId !== playerId) {
      respond({ ok: false, message: "\u53ea\u6709\u623f\u4e3b\u53ef\u4ee5\u5f00\u59cb\u6e38\u620f" });
      return;
    }

    if (getRoomPlayers(room).length < MIN_PLAYERS) {
      respond({ ok: false, message: "\u81f3\u5c11 2 \u4eba\u624d\u80fd\u5f00\u59cb\u6e38\u620f" });
      return;
    }

    if (getRoomPlayers(room).length > MAX_PLAYERS) {
      respond({ ok: false, message: "\u6bcf\u5c40\u6700\u591a 8 \u4eba" });
      return;
    }

    if (room.game.status === "playing") {
      respond({ ok: false, message: "\u6e38\u620f\u5df2\u7ecf\u5f00\u59cb" });
      return;
    }

    startGame(roomId);
    respond({ ok: true });
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
