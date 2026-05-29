const socket = io();

const homeView = document.getElementById("homeView");
const roomView = document.getElementById("roomView");
const connectionStatus = document.getElementById("connectionStatus");
const nicknameInput = document.getElementById("nicknameInput");
const roomIdInput = document.getElementById("roomIdInput");
const createRoomButton = document.getElementById("createRoomButton");
const joinRoomButton = document.getElementById("joinRoomButton");
const errorMessage = document.getElementById("errorMessage");
const roomIdText = document.getElementById("roomIdText");
const roomCountText = document.getElementById("roomCountText");
const playerRangeText = document.getElementById("playerRangeText");
const playerIdText = document.getElementById("playerIdText");
const playerList = document.getElementById("playerList");
const copyRoomButton = document.getElementById("copyRoomButton");
const renameButton = document.getElementById("renameButton");
const leaveRoomButton = document.getElementById("leaveRoomButton");
const roomNotice = document.getElementById("roomNotice");
const maxPlayersInput = document.getElementById("maxPlayersInput");
const updateMaxPlayersButton = document.getElementById("updateMaxPlayersButton");
const roomLimitHint = document.getElementById("roomLimitHint");
const roundSecondsInput = document.getElementById("roundSecondsInput");
const drawTimesSelect = document.getElementById("drawTimesSelect");
const updateGameSettingsButton = document.getElementById("updateGameSettingsButton");
const gameSettingsHint = document.getElementById("gameSettingsHint");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const sendChatButton = document.getElementById("sendChatButton");
const chatError = document.getElementById("chatError");
const drawingCanvas = document.getElementById("drawingCanvas");
const canvasWrap = drawingCanvas.parentElement;
const brushToolButton = document.getElementById("brushToolButton");
const eraserToolButton = document.getElementById("eraserToolButton");
const brushColorInput = document.getElementById("brushColorInput");
const colorPresetButtons = Array.from(document.querySelectorAll(".color-swatch"));
const brushSizeInput = document.getElementById("brushSizeInput");
const brushSizeText = document.getElementById("brushSizeText");
const undoCanvasButton = document.getElementById("undoCanvasButton");
const clearCanvasButton = document.getElementById("clearCanvasButton");
const startGameButton = document.getElementById("startGameButton");
const gameStatusText = document.getElementById("gameStatusText");
const roundTimerText = document.getElementById("roundTimerText");
const canvasTimerText = document.getElementById("canvasTimerText");
const currentDrawerText = document.getElementById("currentDrawerText");
const wordPanel = document.getElementById("wordPanel");
const wordLabel = document.getElementById("wordLabel");
const wordText = document.getElementById("wordText");
const leaderboardList = document.getElementById("leaderboardList");
const drawingRoleText = document.getElementById("drawingRoleText");

let currentPlayerId = "";
let currentRoomId = "";
let currentRoom = null;
let currentGameState = null;
let canDrawOnCanvas = true;
let drawingContext = null;
let drawingTool = "brush";
let isDrawing = false;
let activePointerId = null;
let lastPoint = null;
let lastSyncedPoint = null;
let activeDrawStyle = null;
let activeStrokeId = "";
let pendingSyncPoint = null;
let pendingSyncStyle = null;
let drawSyncTimer = null;
let lastDrawSentAt = 0;
let canvasPixelRatio = 1;
let canvasResizeObserver = null;
let canvasResizeFrame = 0;
const chatMessageMaxLength = 100;
const drawSendIntervalMs = 25;
const defaultRoundSeconds = 60;
const defaultDrawTimesPerPlayer = 1;

function setConnectionStatus(text, className) {
  connectionStatus.textContent = text;
  connectionStatus.className = `connection ${className}`;
}

function showError(message) {
  errorMessage.textContent = message;
}

function clearError() {
  showError("");
}

function showNotice(message) {
  roomNotice.textContent = message;
}

function showChatError(message) {
  chatError.textContent = message;
}

function setDrawingEnabled(enabled) {
  canDrawOnCanvas = enabled;
  drawingCanvas.classList.toggle("drawing-disabled", !enabled);
  brushToolButton.disabled = !enabled;
  eraserToolButton.disabled = !enabled;
  brushColorInput.disabled = !enabled;
  brushSizeInput.disabled = !enabled;
  undoCanvasButton.disabled = !enabled;
  clearCanvasButton.disabled = !enabled;
  colorPresetButtons.forEach((button) => {
    button.disabled = !enabled;
  });
}

function getNickname() {
  return nicknameInput.value.trim();
}

function getRoomId() {
  return roomIdInput.value.trim();
}

function validateNickname(nickname) {
  if (!nickname.trim()) {
    return "\u6635\u79f0\u4e0d\u80fd\u4e3a\u7a7a";
  }

  if (nickname.trim().length > 20) {
    return "\u6635\u79f0\u4e0d\u80fd\u8d85\u8fc7 20 \u4e2a\u5b57\u7b26";
  }

  return "";
}

function validateRoomId() {
  const roomId = getRoomId();

  if (!roomId) {
    return "\u623f\u95f4\u53f7\u4e0d\u80fd\u4e3a\u7a7a";
  }

  if (!/^\d{6}$/.test(roomId)) {
    return "\u623f\u95f4\u53f7\u5fc5\u987b\u662f 6 \u4f4d\u6570\u5b57";
  }

  return "";
}

function validateMaxPlayers(value) {
  const nextMaxPlayers = Number(value);

  if (!Number.isInteger(nextMaxPlayers)) {
    return "\u623f\u95f4\u4eba\u6570\u5fc5\u987b\u662f\u6574\u6570";
  }

  if (!currentRoom) {
    return "\u623f\u95f4\u72b6\u6001\u4e0d\u5b58\u5728";
  }

  if (nextMaxPlayers < currentRoom.minPlayers || nextMaxPlayers > currentRoom.maxAllowedPlayers) {
    return `\u623f\u95f4\u4eba\u6570\u5fc5\u987b\u5728 ${currentRoom.minPlayers}-${currentRoom.maxAllowedPlayers} \u4eba\u4e4b\u95f4`;
  }

  if (nextMaxPlayers < currentRoom.currentPlayers) {
    return "\u623f\u95f4\u4eba\u6570\u4e0d\u80fd\u5c0f\u4e8e\u5f53\u524d\u5df2\u52a0\u5165\u4eba\u6570";
  }

  return "";
}

function validateGameSettings() {
  if (!currentRoom) {
    return "\u623f\u95f4\u72b6\u6001\u4e0d\u5b58\u5728";
  }

  const roundSeconds = Number(roundSecondsInput.value);
  const drawTimesPerPlayer = Number(drawTimesSelect.value);
  const minRoundSeconds = currentRoom.settingLimits?.minRoundSeconds || 30;
  const maxRoundSeconds = currentRoom.settingLimits?.maxRoundSeconds || 180;
  const allowedDrawTimes = currentRoom.settingLimits?.allowedDrawTimes || [1, 2];

  if (!Number.isInteger(roundSeconds)) {
    return "\u6bcf\u8f6e\u65f6\u95f4\u5fc5\u987b\u662f\u6574\u6570";
  }

  if (roundSeconds < minRoundSeconds || roundSeconds > maxRoundSeconds) {
    return `\u6bcf\u8f6e\u65f6\u95f4\u5fc5\u987b\u5728 ${minRoundSeconds}-${maxRoundSeconds} \u79d2\u4e4b\u95f4`;
  }

  if (!allowedDrawTimes.includes(drawTimesPerPlayer)) {
    return "\u6bcf\u4eba\u7ed8\u753b\u6b21\u6570\u53ea\u80fd\u9009\u62e9 1 \u6b21\u6216 2 \u6b21";
  }

  return "";
}

function validateChatMessage(message) {
  const content = message.trim();

  if (!content) {
    return "\u6d88\u606f\u4e0d\u80fd\u4e3a\u7a7a";
  }

  if (content.length > chatMessageMaxLength) {
    return `\u6d88\u606f\u4e0d\u80fd\u8d85\u8fc7 ${chatMessageMaxLength} \u4e2a\u5b57`;
  }

  return "";
}

function formatMessageTime(time) {
  const date = new Date(time);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function clearChatMessages() {
  chatMessages.innerHTML = "";
  showChatError("");
  chatInput.value = "";
}

function createStrokeId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function appendChatMessage(message) {
  const item = document.createElement("div");
  const time = formatMessageTime(message.time);

  item.className = message.type === "system" ? "chat-message system-message" : "chat-message player-message";

  if (message.type === "system") {
    item.textContent = time ? `${time} ${message.content}` : message.content;
  } else {
    const meta = document.createElement("div");
    const content = document.createElement("div");

    meta.className = "chat-meta";
    content.className = "chat-content";
    meta.textContent = time ? `${message.nickname} · ${time}` : message.nickname;
    content.textContent = message.content;

    item.append(meta, content);
  }

  chatMessages.appendChild(item);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function getCanvasContext() {
  if (!drawingContext) {
    drawingContext = drawingCanvas.getContext("2d");
    drawingContext.lineCap = "round";
    drawingContext.lineJoin = "round";
  }

  return drawingContext;
}

function resetActiveDrawing() {
  flushPendingDrawStroke();
  isDrawing = false;

  if (activePointerId !== null && drawingCanvas.hasPointerCapture(activePointerId)) {
    drawingCanvas.releasePointerCapture(activePointerId);
  }

  activePointerId = null;
  lastPoint = null;
  lastSyncedPoint = null;
  activeDrawStyle = null;
  activeStrokeId = "";
}

function scheduleDrawingCanvasResize() {
  if (canvasResizeFrame) {
    cancelAnimationFrame(canvasResizeFrame);
  }

  canvasResizeFrame = requestAnimationFrame(() => {
    canvasResizeFrame = 0;
    resizeDrawingCanvas();
  });
}

function resizeDrawingCanvas() {
  const rect = drawingCanvas.getBoundingClientRect();

  if (rect.width === 0 || rect.height === 0) {
    return;
  }

  const nextPixelRatio = Math.max(window.devicePixelRatio || 1, 1);
  const nextWidth = Math.round(rect.width * nextPixelRatio);
  const nextHeight = Math.round(rect.height * nextPixelRatio);

  if (drawingCanvas.width === nextWidth && drawingCanvas.height === nextHeight) {
    return;
  }

  const previousWidth = drawingCanvas.width;
  const previousHeight = drawingCanvas.height;
  const snapshot = document.createElement("canvas");

  if (previousWidth > 0 && previousHeight > 0) {
    snapshot.width = previousWidth;
    snapshot.height = previousHeight;
    snapshot.getContext("2d").drawImage(drawingCanvas, 0, 0);
  }

  drawingCanvas.width = nextWidth;
  drawingCanvas.height = nextHeight;
  canvasPixelRatio = nextPixelRatio;

  const context = getCanvasContext();
  context.setTransform(canvasPixelRatio, 0, 0, canvasPixelRatio, 0, 0);
  context.lineCap = "round";
  context.lineJoin = "round";

  if (snapshot.width > 0 && snapshot.height > 0) {
    context.drawImage(
      snapshot,
      0,
      0,
      snapshot.width,
      snapshot.height,
      0,
      0,
      rect.width,
      rect.height
    );
  }
}

function getCanvasPoint(event) {
  const rect = drawingCanvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function clampRatio(value) {
  return Math.min(Math.max(value, 0), 1);
}

function getCurrentDrawStyle() {
  return {
    color: brushColorInput.value,
    size: Number(brushSizeInput.value),
    tool: drawingTool,
  };
}

function getNormalizedPoint(point) {
  const rect = drawingCanvas.getBoundingClientRect();

  return {
    x: clampRatio(point.x / rect.width),
    y: clampRatio(point.y / rect.height),
  };
}

function getCanvasPointFromRatio(x, y) {
  const rect = drawingCanvas.getBoundingClientRect();

  return {
    x: clampRatio(x) * rect.width,
    y: clampRatio(y) * rect.height,
  };
}

function applyDrawingStyle(style = getCurrentDrawStyle()) {
  const context = getCanvasContext();

  context.lineWidth = style.size;

  if (style.tool === "eraser") {
    context.globalCompositeOperation = "destination-out";
    context.strokeStyle = "rgba(0, 0, 0, 1)";
  } else {
    context.globalCompositeOperation = "source-over";
    context.strokeStyle = style.color;
  }
}

function normalizeColor(color) {
  return color.toLowerCase();
}

function renderSelectedColor() {
  const selectedColor = normalizeColor(brushColorInput.value);
  let matchedPreset = false;

  colorPresetButtons.forEach((button) => {
    const isActive = normalizeColor(button.dataset.color) === selectedColor;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
    matchedPreset = matchedPreset || isActive;
  });

  brushColorInput.classList.toggle("custom-color-active", !matchedPreset);
}

function setBrushColor(color) {
  brushColorInput.value = color;
  setDrawingTool("brush");
  renderSelectedColor();
}

function drawStrokeSegment(fromPoint, toPoint, style) {
  const context = getCanvasContext();

  applyDrawingStyle(style);
  context.beginPath();

  if (Math.abs(fromPoint.x - toPoint.x) < 0.01 && Math.abs(fromPoint.y - toPoint.y) < 0.01) {
    context.arc(toPoint.x, toPoint.y, style.size / 2, 0, Math.PI * 2);
    context.fillStyle = style.tool === "eraser" ? "rgba(0, 0, 0, 1)" : style.color;
    context.fill();
  } else {
    context.moveTo(fromPoint.x, fromPoint.y);
    context.lineTo(toPoint.x, toPoint.y);
    context.stroke();
  }
}

function drawLine(point) {
  const style = activeDrawStyle || getCurrentDrawStyle();

  drawStrokeSegment(lastPoint, point, style);
  lastPoint = point;
}

function drawDot(point) {
  const style = activeDrawStyle || getCurrentDrawStyle();

  drawStrokeSegment(point, point, style);
}

function createDrawStroke(fromPoint, toPoint, style) {
  const from = getNormalizedPoint(fromPoint);
  const to = getNormalizedPoint(toPoint);

  return {
    roomId: currentRoomId,
    strokeId: activeStrokeId,
    fromX: from.x,
    fromY: from.y,
    toX: to.x,
    toY: to.y,
    color: style.color,
    size: style.size,
    tool: style.tool,
  };
}

function emitDrawStroke(fromPoint, toPoint, style) {
  if (!currentRoomId) {
    return;
  }

  if (!activeStrokeId) {
    activeStrokeId = createStrokeId();
  }

  socket.emit("draw", createDrawStroke(fromPoint, toPoint, style));
  lastDrawSentAt = Date.now();
}

function flushPendingDrawStroke() {
  if (!pendingSyncPoint || !lastSyncedPoint || !pendingSyncStyle) {
    return;
  }

  emitDrawStroke(lastSyncedPoint, pendingSyncPoint, pendingSyncStyle);
  lastSyncedPoint = pendingSyncPoint;
  pendingSyncPoint = null;
  pendingSyncStyle = null;

  if (drawSyncTimer) {
    clearTimeout(drawSyncTimer);
    drawSyncTimer = null;
  }
}

function scheduleDrawStroke(point, style) {
  if (!lastSyncedPoint) {
    lastSyncedPoint = point;
  }

  pendingSyncPoint = point;
  pendingSyncStyle = style;

  const elapsed = Date.now() - lastDrawSentAt;

  if (elapsed >= drawSendIntervalMs) {
    flushPendingDrawStroke();
    return;
  }

  if (!drawSyncTimer) {
    drawSyncTimer = setTimeout(flushPendingDrawStroke, drawSendIntervalMs - elapsed);
  }
}

function renderRemoteDrawStroke(stroke) {
  if (!stroke || stroke.roomId !== currentRoomId) {
    return;
  }

  resizeDrawingCanvas();

  const fromPoint = getCanvasPointFromRatio(stroke.fromX, stroke.fromY);
  const toPoint = getCanvasPointFromRatio(stroke.toX, stroke.toY);
  const style = {
    color: stroke.color,
    size: stroke.size,
    tool: stroke.tool,
  };

  drawStrokeSegment(fromPoint, toPoint, style);
}

function replayDrawingHistory(history = []) {
  clearDrawingCanvas();
  history.forEach(renderRemoteDrawStroke);
}

function beginDrawing(event) {
  if (!canDrawOnCanvas) {
    return;
  }

  if (event.button !== undefined && event.button !== 0) {
    return;
  }

  resizeDrawingCanvas();
  event.preventDefault();

  isDrawing = true;
  activePointerId = event.pointerId;
  activeDrawStyle = getCurrentDrawStyle();
  activeStrokeId = createStrokeId();
  lastPoint = getCanvasPoint(event);
  lastSyncedPoint = lastPoint;
  drawingCanvas.setPointerCapture(event.pointerId);
  drawDot(lastPoint);
  emitDrawStroke(lastPoint, lastPoint, activeDrawStyle);
}

function continueDrawing(event) {
  if (!isDrawing || event.pointerId !== activePointerId) {
    return;
  }

  event.preventDefault();
  const point = getCanvasPoint(event);

  drawLine(point);
  scheduleDrawStroke(point, activeDrawStyle);
}

function endDrawing(event) {
  if (event.pointerId !== activePointerId) {
    return;
  }

  event.preventDefault();
  flushPendingDrawStroke();
  isDrawing = false;
  activePointerId = null;
  lastPoint = null;
  lastSyncedPoint = null;
  activeDrawStyle = null;
  activeStrokeId = "";

  if (drawingCanvas.hasPointerCapture(event.pointerId)) {
    drawingCanvas.releasePointerCapture(event.pointerId);
  }
}

function setDrawingTool(tool) {
  drawingTool = tool;
  brushToolButton.classList.toggle("active", drawingTool === "brush");
  eraserToolButton.classList.toggle("active", drawingTool === "eraser");
}

function clearDrawingCanvas() {
  const context = getCanvasContext();

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  context.restore();
  context.setTransform(canvasPixelRatio, 0, 0, canvasPixelRatio, 0, 0);
}

function initializeDrawingBoard() {
  getCanvasContext();
  setDrawingTool("brush");
  renderSelectedColor();
  brushSizeText.textContent = brushSizeInput.value;

  drawingCanvas.addEventListener("pointerdown", beginDrawing);
  drawingCanvas.addEventListener("pointermove", continueDrawing);
  drawingCanvas.addEventListener("pointerup", endDrawing);
  drawingCanvas.addEventListener("pointercancel", endDrawing);
  drawingCanvas.addEventListener("lostpointercapture", () => {
    flushPendingDrawStroke();
    isDrawing = false;
    activePointerId = null;
    lastPoint = null;
    lastSyncedPoint = null;
    activeDrawStyle = null;
    activeStrokeId = "";
  });

  brushToolButton.addEventListener("click", () => setDrawingTool("brush"));
  eraserToolButton.addEventListener("click", () => setDrawingTool("eraser"));
  colorPresetButtons.forEach((button) => {
    button.style.backgroundColor = button.dataset.color;
    button.setAttribute("aria-pressed", String(button.classList.contains("active")));
    button.addEventListener("click", () => setBrushColor(button.dataset.color));
  });
  brushColorInput.addEventListener("input", () => {
    setDrawingTool("brush");
    renderSelectedColor();
  });
  brushSizeInput.addEventListener("input", () => {
    brushSizeText.textContent = brushSizeInput.value;
  });
  undoCanvasButton.addEventListener("click", () => {
    if (!canDrawOnCanvas) {
      showNotice("\u53ea\u6709\u5f53\u524d\u753b\u624b\u53ef\u4ee5\u64a4\u56de\u7b14\u753b");
      return;
    }

    if (!currentRoomId) {
      return;
    }

    resetActiveDrawing();
    undoCanvasButton.disabled = true;

    socket.emit("draw:undo", { roomId: currentRoomId }, (response) => {
      undoCanvasButton.disabled = !canDrawOnCanvas;

      if (!response?.ok) {
        showNotice(response?.message || "\u64a4\u56de\u5931\u8d25");
      }
    });
  });
  clearCanvasButton.addEventListener("click", () => {
    if (!canDrawOnCanvas) {
      showNotice("\u53ea\u6709\u5f53\u524d\u753b\u624b\u53ef\u4ee5\u64cd\u4f5c\u753b\u677f");
      return;
    }

    resetActiveDrawing();
    clearDrawingCanvas();

    if (currentRoomId) {
      socket.emit("draw:clear", { roomId: currentRoomId });
    }
  });
  if ("ResizeObserver" in window) {
    canvasResizeObserver = new ResizeObserver(() => scheduleDrawingCanvasResize());
    canvasResizeObserver.observe(canvasWrap || drawingCanvas);
  }

  window.addEventListener("resize", scheduleDrawingCanvasResize);
  window.addEventListener("orientationchange", () => {
    resetActiveDrawing();
    scheduleDrawingCanvasResize();
    window.setTimeout(scheduleDrawingCanvasResize, 250);
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", scheduleDrawingCanvasResize);
  }
}

function renderPlayers(room) {
  playerList.innerHTML = "";

  room.players.forEach((player) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const badges = document.createElement("span");

    name.textContent = player.nickname;
    badges.className = "player-tags";

    if (player.isOwner) {
      const ownerTag = document.createElement("span");
      ownerTag.className = "tag owner-tag";
      ownerTag.textContent = "\u623f\u4e3b";
      badges.appendChild(ownerTag);
    }

    if (player.playerId === currentPlayerId) {
      const meTag = document.createElement("span");
      meTag.className = "tag me-tag";
      meTag.textContent = "\u6211";
      badges.appendChild(meTag);
    }

    item.append(name, badges);
    playerList.appendChild(item);
  });
}

function renderRoundTimer(remainingSeconds = 0) {
  if (!currentGameState || currentGameState.status !== "playing") {
    roundTimerText.classList.add("hidden");
    canvasTimerText.classList.add("hidden");
    roundTimerText.textContent = "\u5269\u4f59\u65f6\u95f4\uff1a-- \u79d2";
    canvasTimerText.textContent = "\u5269\u4f59 -- \u79d2";
    return;
  }

  const seconds = Math.max(0, Number(remainingSeconds) || 0);
  roundTimerText.classList.remove("hidden");
  canvasTimerText.classList.remove("hidden");
  roundTimerText.textContent = `\u5269\u4f59\u65f6\u95f4\uff1a${seconds} \u79d2`;
  canvasTimerText.textContent = `\u5269\u4f59 ${seconds} \u79d2`;
}

function updateGameSettingsControls() {
  if (!currentRoom) {
    return;
  }

  const isOwner = currentRoom.ownerPlayerId === currentPlayerId;
  const gameStatus = currentGameState?.status || "waiting";
  const canUpdateSettings = isOwner && gameStatus !== "playing";

  roundSecondsInput.disabled = !canUpdateSettings;
  drawTimesSelect.disabled = !canUpdateSettings;
  updateGameSettingsButton.disabled = !canUpdateSettings;

  if (!isOwner) {
    gameSettingsHint.textContent = "\u53ea\u6709\u623f\u4e3b\u53ef\u4ee5\u4fee\u6539\u6e38\u620f\u8bbe\u7f6e";
    return;
  }

  gameSettingsHint.textContent =
    gameStatus === "playing"
      ? "\u6e38\u620f\u8fdb\u884c\u4e2d\u4e0d\u53ef\u4fee\u6539\u8bbe\u7f6e"
      : "\u53ef\u8bbe\u7f6e 30-180 \u79d2\uff0c\u6bcf\u4eba\u4f5c\u753b 1 \u6b21\u6216 2 \u6b21";
}

function renderRoom(room) {
  currentRoom = room;
  currentRoomId = room.roomId;
  roomIdText.textContent = room.roomId;
  roomCountText.textContent = `\u5f53\u524d\u4eba\u6570\uff1a${room.currentPlayers}/${room.maxPlayers}`;
  playerRangeText.textContent = `${room.currentPlayers}/${room.maxPlayers} \u4eba`;
  roundSecondsInput.min = room.settingLimits?.minRoundSeconds || 30;
  roundSecondsInput.max = room.settingLimits?.maxRoundSeconds || 180;
  roundSecondsInput.value = room.settings?.roundSeconds || defaultRoundSeconds;
  drawTimesSelect.value = String(room.settings?.drawTimesPerPlayer || defaultDrawTimesPerPlayer);
  maxPlayersInput.min = room.minPlayers;
  maxPlayersInput.max = room.maxAllowedPlayers;
  maxPlayersInput.value = room.maxPlayers;

  const isOwner = room.ownerPlayerId === currentPlayerId;
  maxPlayersInput.disabled = !isOwner;
  updateMaxPlayersButton.disabled = !isOwner;
  roomLimitHint.textContent = isOwner
    ? `\u53ef\u8bbe\u7f6e ${room.minPlayers}-${room.maxAllowedPlayers} \u4eba\uff0c\u4e0d\u80fd\u5c0f\u4e8e\u5f53\u524d\u4eba\u6570`
    : "\u53ea\u6709\u623f\u4e3b\u53ef\u4ee5\u4fee\u6539\u623f\u95f4\u4eba\u6570";
  updateGameSettingsControls();
  renderPlayers(room);
}

function renderLeaderboard(items = []) {
  leaderboardList.innerHTML = "";

  items.forEach((player, index) => {
    const item = document.createElement("li");
    item.textContent = `${index + 1}. ${player.nickname} - ${player.score} \u5206`;
    leaderboardList.appendChild(item);
  });
}

function renderGameState(gameState) {
  currentGameState = gameState;

  if (!gameState) {
    roomView.classList.remove("is-drawer", "is-guesser");
    startGameButton.disabled = false;
    startGameButton.classList.remove("hidden");
    startGameButton.textContent = "\u5f00\u59cb\u6e38\u620f";
    gameStatusText.textContent = "\u7b49\u5f85\u623f\u4e3b\u5f00\u59cb\u6e38\u620f";
    renderRoundTimer(0);
    currentDrawerText.textContent = "";
    wordPanel.classList.add("hidden");
    wordText.textContent = "";
    drawingRoleText.textContent = "\u7b49\u5f85\u5f00\u59cb";
    leaderboardList.innerHTML = "";
    leaderboardList.classList.add("hidden");
    setDrawingEnabled(true);
    scheduleDrawingCanvasResize();
    return;
  }

  const isPlaying = gameState.status === "playing";
  const isEnded = gameState.status === "ended";
  const isDrawer = Boolean(gameState.isDrawer);

  roomView.classList.toggle("is-drawer", isPlaying && isDrawer);
  roomView.classList.toggle("is-guesser", isPlaying && !isDrawer);
  startGameButton.disabled = !gameState.canStart;
  startGameButton.classList.toggle("hidden", !gameState.isOwner);
  startGameButton.textContent = isEnded ? "\u518d\u6765\u4e00\u5c40" : "\u5f00\u59cb\u6e38\u620f";
  gameStatusText.textContent = gameState.message || "\u7b49\u5f85\u5f00\u59cb\u6e38\u620f";
  renderRoundTimer(gameState.remainingSeconds);
  currentDrawerText.textContent = isPlaying
    ? `\u7b2c ${gameState.roundNumber}/${gameState.totalRounds} \u8f6e\uff0c\u753b\u624b\uff1a${gameState.currentDrawerNickname}`
    : "";

  wordPanel.classList.toggle("hidden", !isPlaying);
  wordLabel.textContent = isDrawer ? "\u4f60\u7684\u9898\u76ee" : "\u63d0\u793a";
  wordText.textContent = isDrawer ? gameState.word : "\u7b49\u5f85\u753b\u624b\u4f5c\u753b";
  drawingRoleText.textContent = isPlaying
    ? isDrawer
      ? "\u4f60\u662f\u753b\u624b"
      : "\u4f60\u662f\u731c\u8bcd\u8005"
    : "\u7b49\u5f85\u5f00\u59cb";

  setDrawingEnabled(!isPlaying || isDrawer);
  renderLeaderboard(isEnded ? gameState.leaderboard : gameState.scores);
  leaderboardList.classList.toggle("hidden", !isEnded);
  updateGameSettingsControls();
  scheduleDrawingCanvasResize();
}

function showRoom(room, player, drawHistory = [], gameState = null) {
  currentPlayerId = player.playerId;
  playerIdText.textContent = player.playerId;
  clearChatMessages();
  renderRoom(room);
  renderGameState(gameState);

  homeView.classList.add("hidden");
  roomView.classList.remove("hidden");
  requestAnimationFrame(() => {
    resizeDrawingCanvas();
    replayDrawingHistory(drawHistory);
  });
  showNotice("");
}

function showHome() {
  currentPlayerId = "";
  currentRoomId = "";
  currentRoom = null;
  currentGameState = null;
  playerIdText.textContent = "";
  playerList.innerHTML = "";
  renderGameState(null);
  clearChatMessages();
  roomView.classList.add("hidden");
  homeView.classList.remove("hidden");
  showNotice("");
}

function setLobbyButtonsDisabled(disabled) {
  createRoomButton.disabled = disabled;
  joinRoomButton.disabled = disabled;
}

function setRoomButtonsDisabled(disabled) {
  copyRoomButton.disabled = disabled;
  renameButton.disabled = disabled;
  leaveRoomButton.disabled = disabled;
}

function handleRoomResponse(response, fallbackMessage) {
  setLobbyButtonsDisabled(false);

  if (!response?.ok) {
    showError(response?.message || fallbackMessage);
    return;
  }

  showRoom(response.room, response.player, response.drawHistory || [], response.gameState || null);
}

initializeDrawingBoard();

createRoomButton.addEventListener("click", () => {
  const nicknameError = validateNickname(getNickname());

  if (nicknameError) {
    showError(nicknameError);
    return;
  }

  clearError();
  setLobbyButtonsDisabled(true);

  socket.emit("room:create", { nickname: getNickname() }, (response) => {
    handleRoomResponse(response, "\u521b\u5efa\u623f\u95f4\u5931\u8d25");
  });
});

joinRoomButton.addEventListener("click", () => {
  const nicknameError = validateNickname(getNickname());
  const roomIdError = validateRoomId();

  if (nicknameError || roomIdError) {
    showError(nicknameError || roomIdError);
    return;
  }

  clearError();
  setLobbyButtonsDisabled(true);

  socket.emit("room:join", { nickname: getNickname(), roomId: getRoomId() }, (response) => {
    handleRoomResponse(response, "\u52a0\u5165\u623f\u95f4\u5931\u8d25");
  });
});

copyRoomButton.addEventListener("click", async () => {
  if (!currentRoomId) {
    return;
  }

  try {
    await navigator.clipboard.writeText(currentRoomId);
    showNotice("\u623f\u95f4\u53f7\u5df2\u590d\u5236");
  } catch (error) {
    showNotice(`\u623f\u95f4\u53f7\uff1a${currentRoomId}`);
  }
});

renameButton.addEventListener("click", () => {
  const currentName = nicknameInput.value.trim();
  const nextName = window.prompt("\u8f93\u5165\u65b0\u6635\u79f0", currentName);

  if (nextName === null) {
    return;
  }

  const nicknameError = validateNickname(nextName);

  if (nicknameError) {
    showNotice(nicknameError);
    return;
  }

  setRoomButtonsDisabled(true);

  socket.emit("player:updateNickname", { nickname: nextName.trim() }, (response) => {
    setRoomButtonsDisabled(false);

    if (!response?.ok) {
      showNotice(response?.message || "\u4fee\u6539\u6635\u79f0\u5931\u8d25");
      return;
    }

    nicknameInput.value = response.player.nickname;
    showNotice("\u6635\u79f0\u5df2\u66f4\u65b0");
  });
});

leaveRoomButton.addEventListener("click", () => {
  setRoomButtonsDisabled(true);

  socket.emit("room:leave", (response) => {
    setRoomButtonsDisabled(false);

    if (!response?.ok) {
      showNotice(response?.message || "\u79bb\u5f00\u623f\u95f4\u5931\u8d25");
      return;
    }

    showHome();
  });
});

updateMaxPlayersButton.addEventListener("click", () => {
  const maxPlayersError = validateMaxPlayers(maxPlayersInput.value);

  if (maxPlayersError) {
    showNotice(maxPlayersError);
    return;
  }

  updateMaxPlayersButton.disabled = true;

  socket.emit("room:updateMaxPlayers", { maxPlayers: Number(maxPlayersInput.value) }, (response) => {
    if (!response?.ok) {
      updateMaxPlayersButton.disabled = currentRoom?.ownerPlayerId !== currentPlayerId;
      showNotice(response?.message || "\u4fee\u6539\u623f\u95f4\u4eba\u6570\u5931\u8d25");
      return;
    }

    renderRoom(response.room);
    showNotice("\u623f\u95f4\u4eba\u6570\u5df2\u66f4\u65b0");
  });
});

updateGameSettingsButton.addEventListener("click", () => {
  const gameSettingsError = validateGameSettings();

  if (gameSettingsError) {
    showNotice(gameSettingsError);
    return;
  }

  updateGameSettingsButton.disabled = true;

  socket.emit(
    "game:updateSettings",
    {
      roundSeconds: Number(roundSecondsInput.value),
      drawTimesPerPlayer: Number(drawTimesSelect.value),
    },
    (response) => {
      if (!response?.ok) {
        updateGameSettingsControls();
        showNotice(response?.message || "\u4fee\u6539\u6e38\u620f\u8bbe\u7f6e\u5931\u8d25");
        return;
      }

      renderRoom(response.room);
      showNotice("\u6e38\u620f\u8bbe\u7f6e\u5df2\u66f4\u65b0");
    }
  );
});

startGameButton.addEventListener("click", () => {
  startGameButton.disabled = true;

  socket.emit("game:start", (response) => {
    if (!response?.ok) {
      showNotice(response?.message || "\u5f00\u59cb\u6e38\u620f\u5931\u8d25");
      startGameButton.disabled = currentGameState ? !currentGameState.canStart : false;
    }
  });
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const message = chatInput.value;
  const messageError = validateChatMessage(message);

  if (messageError) {
    showChatError(messageError);
    return;
  }

  showChatError("");
  sendChatButton.disabled = true;

  socket.emit("chat:send", { message: message.trim() }, (response) => {
    sendChatButton.disabled = false;

    if (!response?.ok) {
      showChatError(response?.message || "\u6d88\u606f\u53d1\u9001\u5931\u8d25");
      return;
    }

    chatInput.value = "";
    chatInput.focus();
  });
});

roomIdInput.addEventListener("input", () => {
  roomIdInput.value = roomIdInput.value.replace(/\D/g, "").slice(0, 6);
});

chatInput.addEventListener("input", () => {
  if (chatInput.value.length > chatMessageMaxLength) {
    chatInput.value = chatInput.value.slice(0, chatMessageMaxLength);
  }
});

socket.on("connect", () => {
  console.log("Connected to server:", socket.id);
  setConnectionStatus("\u5df2\u8fde\u63a5", "connected");
});

socket.on("disconnect", (reason) => {
  console.log("Disconnected from server:", reason);
  setConnectionStatus("\u5df2\u65ad\u5f00", "disconnected");
  showNotice("\u8fde\u63a5\u5df2\u65ad\u5f00");
});

socket.on("room:update", (room) => {
  if (room?.roomId) {
    renderRoom(room);
  }
});

socket.on("chat:message", (message) => {
  appendChatMessage(message);
});

socket.on("game:state", (gameState) => {
  renderGameState(gameState);
});

socket.on("game:timer", ({ remainingSeconds, roundSeconds } = {}) => {
  if (!currentGameState || currentGameState.status !== "playing") {
    return;
  }

  currentGameState.remainingSeconds = Math.max(0, Number(remainingSeconds) || 0);
  currentGameState.roundSeconds = Number(roundSeconds) || currentGameState.roundSeconds;
  renderRoundTimer(currentGameState.remainingSeconds);
});

socket.on("draw", (stroke) => {
  renderRemoteDrawStroke(stroke);
});

socket.on("draw:history", ({ roomId, history } = {}) => {
  if (roomId === currentRoomId) {
    resetActiveDrawing();
    replayDrawingHistory(history || []);
  }
});

socket.on("draw:clear", ({ roomId } = {}) => {
  if (roomId === currentRoomId) {
    resetActiveDrawing();
    clearDrawingCanvas();
  }
});
