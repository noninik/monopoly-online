// Данные поля для клиента — используем для отрисовки
const COLOR_MAP = {
  brown: '#8B4513',
  lightblue: '#87CEEB',
  pink: '#FF69B4',
  orange: '#FF8C00',
  red: '#FF0000',
  yellow: '#FFD700',
  green: '#228B22',
  darkblue: '#00008B',
  railroad: '#333',
  utility: '#666'
};

const CELL_ICONS = {
  start: '🏁',
  jail: '🔒',
  parking: '🅿️',
  gotojail: '👮',
  chance: '❓',
  chest: '💰',
  tax: '💸',
  railroad: '🚂',
  utility: '💡'
};

function createBoard(boardData) {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  const cellSize = 56;
  const cornerSize = 90;
  const boardSize = 740;

  // Позиции для каждой ячейки
  const positions = [];

  // Нижний ряд (0-10): справа налево
  // Ячейка 0 — правый нижний угол
  positions[0] = { x: boardSize - cornerSize, y: boardSize - cornerSize, w: cornerSize, h: cornerSize, side: 'corner' };

  for (let i = 1; i <= 9; i++) {
    positions[i] = {
      x: boardSize - cornerSize - i * cellSize,
      y: boardSize - cornerSize,
      w: cellSize,
      h: cornerSize,
      side: 'bottom'
    };
  }

  positions[10] = { x: 0, y: boardSize - cornerSize, w: cornerSize, h: cornerSize, side: 'corner' };

  // Левый ряд (11-19): снизу вверх
  for (let i = 1; i <= 9; i++) {
    positions[10 + i] = {
      x: 0,
      y: boardSize - cornerSize - i * cellSize,
      w: cornerSize,
      h: cellSize,
      side: 'left'
    };
  }

  positions[20] = { x: 0, y: 0, w: cornerSize, h: cornerSize, side: 'corner' };

  // Верхний ряд (21-29): слева направо
  for (let i = 1; i <= 9; i++) {
    positions[20 + i] = {
      x: cornerSize + (i - 1) * cellSize,
      y: 0,
      w: cellSize,
      h: cornerSize,
      side: 'top'
    };
  }

  positions[30] = { x: boardSize - cornerSize, y: 0, w: cornerSize, h: cornerSize, side: 'corner' };

  // Правый ряд (31-39): сверху вниз
  for (let i = 1; i <= 9; i++) {
    positions[30 + i] = {
      x: boardSize - cornerSize,
      y: cornerSize + (i - 1) * cellSize,
      w: cornerSize,
      h: cellSize,
      side: 'right'
    };
  }

  // Создаём ячейки
  boardData.forEach((cell, i) => {
    const pos = positions[i];
    if (!pos) return;

    const cellEl = document.createElement('div');
    cellEl.className = `cell ${pos.side}`;
    cellEl.id = `cell-${i}`;
    cellEl.style.left = pos.x + 'px';
    cellEl.style.top = pos.y + 'px';
    cellEl.style.width = pos.w + 'px';
    cellEl.style.height = pos.h + 'px';

    let content = '';

    // Цветная полоса для свойств
    if (cell.color && COLOR_MAP[cell.color]) {
      content += `<div class="color-stripe" style="color: ${COLOR_MAP[cell.color]}; background: ${COLOR_MAP[cell.color]};"></div>`;
    }

    // Иконка для специальных ячеек
    const icon = CELL_ICONS[cell.type] || '';

    if (pos.side === 'corner') {
      content += `<div class="cell-name">${icon} ${cell.name}</div>`;
    } else {
      content += `<div class="cell-name">${icon} ${cell.name}</div>`;
      if (cell.price) {
        content += `<div class="cell-price">$${cell.price}</div>`;
      }
      if (cell.amount) {
        content += `<div class="cell-price">$${cell.amount}</div>`;
      }
    }

    cellEl.innerHTML = content;
    cellEl.setAttribute('data-cell-id', i);
    boardEl.appendChild(cellEl);
  });

  // Центр поля
  const center = document.createElement('div');
  center.className = 'board-center';
  center.innerHTML = '<h1>МОНОПОЛИЯ</h1><p>Онлайн</p>';
  boardEl.appendChild(center);

  return positions;
}

function getCellCenter(positions, cellIndex) {
  const pos = positions[cellIndex];
  if (!pos) return { x: 0, y: 0 };
  return {
    x: pos.x + pos.w / 2,
    y: pos.y + pos.h / 2
  };
}

function getTokenOffset(playerIndex) {
  // Смещаем фишки чтобы не перекрывались
  const offsets = [
    { x: -12, y: -12 },
    { x: 12, y: 12 }
  ];
  return offsets[playerIndex] || { x: 0, y: 0 };
}
