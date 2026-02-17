let ws;
let myId = null;
let gameState = null;
let cellPositions = [];
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// Подключение к WebSocket
function connectWS() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('Connected to server');
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleMessage(msg);
  };

  ws.onclose = () => {
    console.log('Disconnected');
    setTimeout(connectWS, 3000);
  };

  ws.onerror = (err) => {
    console.error('WS error:', err);
  };
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'roomCreated':
      myId = msg.playerId;
      gameState = msg.state;
      document.getElementById('waitingMessage').style.display = 'block';
      document.getElementById('displayRoomCode').textContent = msg.roomId;
      document.getElementById('btnCreate').style.display = 'none';
      document.querySelector('.join-section').style.display = 'none';
      break;

    case 'roomJoined':
      myId = msg.playerId;
      gameState = msg.state;
      showGameScreen();
      break;

    case 'gameStarted':
      gameState = msg.state;
      showGameScreen();
      break;

    case 'turnResult':
      gameState = msg.state;
      processEvents(msg.events);
      updateUI();
      break;

    case 'gameState':
      gameState = msg.state;
      myId = msg.yourId;
      updateUI();
      break;

    case 'error':
      showToast(msg.text);
      break;

    case 'playerDisconnected':
      showModal('Соединение', msg.text);
      break;
  }
}

function createRoom() {
  const name = document.getElementById('playerName').value.trim() || 'Игрок 1';
  ws.send(JSON.stringify({ type: 'createRoom', name }));
}

function joinRoom() {
  const name = document.getElementById('playerName').value.trim() || 'Игрок 2';
  const roomId = document.getElementById('roomCode').value.trim();
  if (!roomId) {
    showToast('Введите код комнаты');
    return;
  }
  ws.send(JSON.stringify({ type: 'joinRoom', name, roomId }));
}

function copyRoomCode() {
  const code = document.getElementById('displayRoomCode').textContent;
  navigator.clipboard.writeText(code).then(() => {
    showToast('Код скопирован!');
  });
}

function showGameScreen() {
  document.getElementById('lobby').classList.remove('active');
  document.getElementById('gameScreen').classList.add('active');
  document.getElementById('gameScreen').style.display = 'flex';

  // Создаём поле
  cellPositions = createBoard(gameState.board);

  // Масштабируем поле
  scaleBoardToFit();
  window.addEventListener('resize', scaleBoardToFit);

  updateUI();
}

function scaleBoardToFit() {
  const container = document.querySelector('.board-container');
  const board = document.querySelector('.board');
  if (!container || !board) return;

  const containerW = container.clientWidth - 20;
  const containerH = container.clientHeight - 20;
  const boardSize = 740;

  const scale = Math.min(containerW / boardSize, containerH / boardSize, 1);
  board.style.transform = `scale(${scale})`;
}

function updateUI() {
  if (!gameState) return;

  // Обновляем информацию об игроках
  gameState.players.forEach((player, i) => {
    const idx = i + 1;
    document.getElementById(`p${idx}Token`).textContent = player.token;
    document.getElementById(`p${idx}Name`).textContent = player.name;
    document.getElementById(`p${idx}Money`).textContent = `$${player.money}`;

    // Подсветка активного игрока
    const infoEl = document.getElementById(`player${idx}Info`);
    infoEl.classList.toggle('active-player', gameState.currentPlayerIndex === i);

    // Цвет денег
    const moneyEl = document.getElementById(`p${idx}Money`);
    moneyEl.style.color = player.money < 0 ? '#e74c3c' : '#2ecc71';

    // Свойства игрока
    const propsEl = document.getElementById(`p${idx}Properties`);
    propsEl.innerHTML = '';
    player.properties.forEach(propId => {
      const cell = gameState.board[propId];
      const dot = document.createElement('span');
      dot.className = 'prop-dot';
      dot.style.background = COLOR_MAP[cell.color] || COLOR_MAP[cell.type] || '#999';
      dot.setAttribute('data-name', cell.name);

      const houses = player.houses[propId] || 0;
      if (houses > 0) {
        dot.textContent = houses === 5 ? 'H' : houses;
      }

      propsEl.appendChild(dot);
    });
  });

  // Информация о ходе
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const isMyTurn = currentPlayer && currentPlayer.id === myId;
  const turnInfo = document.getElementById('turnInfo');

  if (gameState.gameOver) {
    turnInfo.textContent = `Игра окончена!`;
    document.getElementById('winnerText').textContent = `${gameState.winner.name} победил!`;
    document.getElementById('winModal').style.display = 'flex';
  } else if (currentPlayer) {
    if (currentPlayer.inJail) {
      turnInfo.textContent = `${currentPlayer.token} ${currentPlayer.name} в тюрьме ${isMyTurn ? '(ваш ход)' : ''}`;
    } else {
      turnInfo.textContent = `${currentPlayer.token} ${currentPlayer.name} ${isMyTurn ? '— ваш ход!' : '— ходит...'}`;
    }
  }

  // Кнопки действий
  const btnRoll = document.getElementById('btnRoll');
  const btnBuy = document.getElementById('btnBuy');
  const btnPass = document.getElementById('btnPass');
  const btnPayFine = document.getElementById('btnPayFine');

  btnRoll.style.display = 'none';
  btnBuy.style.display = 'none';
  btnPass.style.display = 'none';
  btnPayFine.style.display = 'none';

  if (isMyTurn && !gameState.gameOver) {
    if (gameState.awaitingAction && gameState.awaitingAction.type === 'buy_or_pass') {
      btnBuy.style.display = 'block';
      btnPass.style.display = 'block';
      const cell = gameState.board[gameState.awaitingAction.cellId];
      btnBuy.textContent = `💰 Купить "${cell.name}" за $${cell.price}`;
    } else {
      btnRoll.style.display = 'block';
      if (currentPlayer.inJail) {
        btnRoll.textContent = '🎲 Бросить кубики (попытка выйти)';
        if (currentPlayer.money >= 50) {
          btnPayFine.style.display = 'block';
        }
      } else {
        btnRoll.textContent = '🎲 Бросить кубики';
      }
    }
  }

  // Кубики
  updateDice(gameState.lastDice);

  // Фишки на поле
  updateTokensOnBoard();

  // Маркеры владельцев
  updateOwnerMarkers();

  // Дома на поле
  updateHousesOnBoard();

  // Секция строительства
  updateBuildSection();
}

function updateDice(values) {
  document.getElementById('dice1').textContent = DICE_FACES[values[0] - 1] || '⚀';
  document.getElementById('dice2').textContent = DICE_FACES[values[1] - 1] || '⚀';
}

function animateDice(callback) {
  const d1 = document.getElementById('dice1');
  const d2 = document.getElementById('dice2');
  d1.classList.add('rolling');
  d2.classList.add('rolling');

  let count = 0;
  const interval = setInterval(() => {
    d1.textContent = DICE_FACES[Math.floor(Math.random() * 6)];
    d2.textContent = DICE_FACES[Math.floor(Math.random() * 6)];
    count++;
    if (count > 10) {
      clearInterval(interval);
      d1.classList.remove('rolling');
      d2.classList.remove('rolling');
      if (callback) callback();
    }
  }, 60);
}

function updateTokensOnBoard() {
  // Удаляем старые фишки
  document.querySelectorAll('.token').forEach(el => el.remove());

  const board = document.getElementById('board');

  gameState.players.forEach((player, i) => {
    const center = getCellCenter(cellPositions, player.position);
    const offset = getTokenOffset(i);

    const token = document.createElement('div');
    token.className = 'token';
    token.id = `token-${i}`;
    token.textContent = player.token;
    token.style.left = (center.x + offset.x - 10) + 'px';
    token.style.top = (center.y + offset.y - 10) + 'px';
    board.appendChild(token);
  });
}

function updateOwnerMarkers() {
  document.querySelectorAll('.owner-marker').forEach(el => el.remove());
  const board = document.getElementById('board');

  gameState.players.forEach(player => {
    player.properties.forEach(propId => {
      const cellEl = document.getElementById(`cell-${propId}`);
      if (!cellEl) return;

      const marker = document.createElement('div');
      marker.className = 'owner-marker';
      marker.style.background = player.color;

      const pos = cellPositions[propId];
      if (pos.side === 'bottom') {
        marker.style.left = (pos.x + pos.w - 12) + 'px';
        marker.style.top = (pos.y + pos.h - 12) + 'px';
      } else if (pos.side === 'top') {
        marker.style.left = (pos.x + 4) + 'px';
        marker.style.top = (pos.y + 4) + 'px';
      } else if (pos.side === 'left') {
        marker.style.left = (pos.x + 4) + 'px';
        marker.style.top = (pos.y + pos.h - 12) + 'px';
      } else if (pos.side === 'right') {
        marker.style.left = (pos.x + pos.w - 12) + 'px';
        marker.style.top = (pos.y + 4) + 'px';
      }

      board.appendChild(marker);
    });
  });
}

function updateHousesOnBoard() {
  document.querySelectorAll('.house-indicator').forEach(el => el.remove());
  const board = document.getElementById('board');

  gameState.players.forEach(player => {
    Object.entries(player.houses).forEach(([propId, count]) => {
      if (count <= 0) return;

      const pos = cellPositions[propId];
      if (!pos) return;

      const indicator = document.createElement('div');
      indicator.className = 'house-indicator';

      if (count === 5) {
        indicator.innerHTML = '<span class="house-icon">🏨</span>';
      } else {
        for (let h = 0; h < count; h++) {
          indicator.innerHTML += '<span class="house-icon">🏠</span>';
        }
      }

      // Позиционируем рядом с цветной полосой
      if (pos.side === 'bottom') {
        indicator.style.left = (pos.x + 2) + 'px';
        indicator.style.top = (pos.y + 2) + 'px';
      } else if (pos.side === 'top') {
        indicator.style.left = (pos.x + 2) + 'px';
        indicator.style.top = (pos.y + pos.h - 14) + 'px';
      } else if (pos.side === 'left') {
        indicator.style.left = (pos.x + pos.w - 16) + 'px';
        indicator.style.top = (pos.y + 2) + 'px';
      } else if (pos.side === 'right') {
        indicator.style.left = (pos.x + 2) + 'px';
        indicator.style.top = (pos.y + 2) + 'px';
      }

      board.appendChild(indicator);
    });
  });
}

function updateBuildSection() {
  const section = document.getElementById('buildSection');
  const container = document.getElementById('buildableProperties');
  const me = gameState.players.find(p => p.id === myId);

  if (!me || gameState.gameOver) {
    section.style.display = 'none';
    return;
  }

  // Находим свойства, на которых можно строить
  const buildable = [];
  const groups = gameState.propertyGroups;

  for (const [color, groupIds] of Object.entries(groups)) {
    if (color === 'railroad' || color === 'utility') continue;
    if (!groupIds.every(id => me.properties.includes(id))) continue;

    groupIds.forEach(id => {
      const cell = gameState.board[id];
      const houses = me.houses[id] || 0;
      if (houses < 5 && me.money >= cell.houseCost) {
        // Проверяем равномерность
        const minHouses = Math.min(...groupIds.map(gid => me.houses[gid] || 0));
        if (houses <= minHouses) {
          buildable.push({ id, cell, houses, cost: cell.houseCost, color });
        }
      }
    });
  }

  if (buildable.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  container.innerHTML = '';

  buildable.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'build-btn';
    const housesLabel = item.houses === 4 ? 'Отель' : `Дом ${item.houses + 1}`;
    btn.innerHTML = `
      <span><span class="color-bar" style="display:inline-block;background:${COLOR_MAP[item.color]}"></span> ${item.cell.name}</span>
      <span>${housesLabel} ($${item.cost})</span>
    `;
    btn.onclick = () => buildHouse(item.id);
    container.appendChild(btn);
  });
}

function processEvents(events) {
  const logEl = document.getElementById('eventLog');

  events.forEach(event => {
    let className = 'log-entry';

    switch (event.type) {
      case 'dice':
        animateDice(() => {
          updateDice(gameState.lastDice);
        });
        addLog(`🎲 ${event.player}: ${event.values[0]} + ${event.values[1]} = ${event.values[0] + event.values[1]}`, className);
        break;

      case 'move':
        // Анимация движения обрабатывается через updateTokensOnBoard
        break;

      case 'message':
        addLog(event.text, className);
        break;

      case 'offer':
        addLog(`🏠 ${event.text}`, className);
        break;

      case 'rent':
        addLog(`💸 ${event.text}`, `${className} rent-event`);
        break;

      case 'buy':
        addLog(`✅ ${event.text}`, `${className} buy-event`);
        break;

      case 'card':
        addLog(`🃏 ${event.text}`, `${className} card-event`);
        break;

      case 'build':
        addLog(`🏗 ${event.text}`, `${className} buy-event`);
        break;
    }
  });
}

function addLog(text, className) {
  const logEl = document.getElementById('eventLog');
  const entry = document.createElement('div');
  entry.className = className || 'log-entry';
  entry.textContent = text;
  logEl.insertBefore(entry, logEl.firstChild);

  // Ограничиваем количество записей
  while (logEl.children.length > 100) {
    logEl.removeChild(logEl.lastChild);
  }
}

// Действия игрока
function rollDice() {
  ws.send(JSON.stringify({ type: 'rollDice' }));
}

function buyProperty() {
  if (gameState.awaitingAction) {
    ws.send(JSON.stringify({ type: 'buyProperty', cellId: gameState.awaitingAction.cellId }));
  }
}

function passProperty() {
  ws.send(JSON.stringify({ type: 'passProperty' }));
}

function buildHouse(cellId) {
  ws.send(JSON.stringify({ type: 'buyHouse', cellId }));
}

function payJailFine() {
  ws.send(JSON.stringify({ type: 'payJailFine' }));
}

// UI helpers
function showModal(title, text) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalText').textContent = text;
  document.getElementById('modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
}

let toastTimeout;
function showToast(text) {
  // Простой toast notification
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #e74c3c;
      color: white;
      padding: 12px 24px;
      border-radius: 10px;
      z-index: 2000;
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      box-shadow: 0 5px 20px rgba(0,0,0,0.3);
      transition: opacity 0.3s;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.style.opacity = '1';
  toast.style.display = 'block';

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { toast.style.display = 'none'; }, 300);
  }, 3000);
}

// Инициализация
connectWS();
