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
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const sendChatButton = document.getElementById("sendChatButton");
const chatError = document.getElementById("chatError");
const drawingCanvas = document.getElementById("drawingCanvas");
const brushToolButton = document.getElementById("brushToolButton");
const eraserToolButton = document.getElementById("eraserToolButton");
const brushColorInput = document.getElementById("brushColorInput");
const colorPresetButtons = Array.from(document.querySelectorAll(".color-swatch"));
const brushSizeInput = document.getElementById("brushSizeInput");
const brushSizeText = document.getElementById("brushSizeText");
const clearCanvasButton = document.getElementById("clearCanvasButton");

let currentPlayerId = "";
let currentRoomId = "";
let currentRoom = null;
let drawingContext = null;
let drawingTool = "brush";
let isDrawing = false;
let activePointerId = null;
let lastPoint = null;
let canvasPixelRatio = 1;
let canvasResizeObserver = null;
const chatMessageMaxLength = 100;

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

function applyDrawingStyle() {
  const context = getCanvasContext();

  context.lineWidth = Number(brushSizeInput.value);

  if (drawingTool === "eraser") {
    context.globalCompositeOperation = "destination-out";
    context.strokeStyle = "rgba(0, 0, 0, 1)";
  } else {
    context.globalCompositeOperation = "source-over";
    context.strokeStyle = brushColorInput.value;
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

function drawLine(point) {
  const context = getCanvasContext();

  applyDrawingStyle();
  context.beginPath();
  context.moveTo(lastPoint.x, lastPoint.y);
  context.lineTo(point.x, point.y);
  context.stroke();
  lastPoint = point;
}

function drawDot(point) {
  const context = getCanvasContext();

  applyDrawingStyle();
  context.beginPath();
  context.arc(point.x, point.y, Number(brushSizeInput.value) / 2, 0, Math.PI * 2);
  context.fillStyle = drawingTool === "eraser" ? "rgba(0, 0, 0, 1)" : brushColorInput.value;
  context.fill();
}

function beginDrawing(event) {
  if (event.button !== undefined && event.button !== 0) {
    return;
  }

  resizeDrawingCanvas();
  event.preventDefault();

  isDrawing = true;
  activePointerId = event.pointerId;
  lastPoint = getCanvasPoint(event);
  drawingCanvas.setPointerCapture(event.pointerId);
  drawDot(lastPoint);
}

function continueDrawing(event) {
  if (!isDrawing || event.pointerId !== activePointerId) {
    return;
  }

  event.preventDefault();
  drawLine(getCanvasPoint(event));
}

function endDrawing(event) {
  if (event.pointerId !== activePointerId) {
    return;
  }

  event.preventDefault();
  isDrawing = false;
  activePointerId = null;
  lastPoint = null;

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
    isDrawing = false;
    activePointerId = null;
    lastPoint = null;
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
  clearCanvasButton.addEventListener("click", clearDrawingCanvas);
  window.addEventListener("resize", resizeDrawingCanvas);

  if ("ResizeObserver" in window) {
    canvasResizeObserver = new ResizeObserver(() => resizeDrawingCanvas());
    canvasResizeObserver.observe(drawingCanvas);
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

function renderRoom(room) {
  currentRoom = room;
  currentRoomId = room.roomId;
  roomIdText.textContent = room.roomId;
  roomCountText.textContent = `\u5f53\u524d\u4eba\u6570\uff1a${room.currentPlayers}/${room.maxPlayers}`;
  playerRangeText.textContent = `${room.currentPlayers}/${room.maxPlayers} \u4eba`;
  maxPlayersInput.min = room.minPlayers;
  maxPlayersInput.max = room.maxAllowedPlayers;
  maxPlayersInput.value = room.maxPlayers;

  const isOwner = room.ownerPlayerId === currentPlayerId;
  maxPlayersInput.disabled = !isOwner;
  updateMaxPlayersButton.disabled = !isOwner;
  roomLimitHint.textContent = isOwner
    ? `\u53ef\u8bbe\u7f6e ${room.minPlayers}-${room.maxAllowedPlayers} \u4eba\uff0c\u4e0d\u80fd\u5c0f\u4e8e\u5f53\u524d\u4eba\u6570`
    : "\u53ea\u6709\u623f\u4e3b\u53ef\u4ee5\u4fee\u6539\u623f\u95f4\u4eba\u6570";
  renderPlayers(room);
}

function showRoom(room, player) {
  currentPlayerId = player.playerId;
  playerIdText.textContent = player.playerId;
  clearChatMessages();
  renderRoom(room);

  homeView.classList.add("hidden");
  roomView.classList.remove("hidden");
  requestAnimationFrame(() => {
    resizeDrawingCanvas();
    clearDrawingCanvas();
  });
  showNotice("");
}

function showHome() {
  currentPlayerId = "";
  currentRoomId = "";
  currentRoom = null;
  playerIdText.textContent = "";
  playerList.innerHTML = "";
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

  showRoom(response.room, response.player);
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
