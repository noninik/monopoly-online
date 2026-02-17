const { BOARD_DATA, CHANCE_CARDS, CHEST_CARDS, PROPERTY_GROUPS } = require('./board');

class Game {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = [];
    this.currentPlayerIndex = 0;
    this.board = JSON.parse(JSON.stringify(BOARD_DATA));
    this.properties = {};
    this.started = false;
    this.gameOver = false;
    this.winner = null;
    this.lastDice = [0, 0];
    this.doublesCount = 0;
    this.awaitingAction = null; // Ожидаемое действие от игрока

    // Перемешиваем карточки
    this.chanceCards = this.shuffle([...CHANCE_CARDS]);
    this.chestCards = this.shuffle([...CHEST_CARDS]);
    this.chanceIndex = 0;
    this.chestIndex = 0;
  }

  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  addPlayer(id, name) {
    if (this.players.length >= 2) return false;
    const tokens = ['🚗', '🎩'];
    const colors = ['#e74c3c', '#3498db'];
    this.players.push({
      id,
      name,
      money: 1500,
      position: 0,
      token: tokens[this.players.length],
      color: colors[this.players.length],
      properties: [],
      inJail: false,
      jailTurns: 0,
      bankrupt: false,
      houses: {} // propertyId -> number of houses (5 = hotel)
    });
    return true;
  }

  removePlayer(id) {
    this.players = this.players.filter(p => p.id !== id);
  }

  getPlayer(id) {
    return this.players.find(p => p.id === id);
  }

  getCurrentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  rollDice() {
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    this.lastDice = [d1, d2];
    return [d1, d2];
  }

  isDoubles() {
    return this.lastDice[0] === this.lastDice[1];
  }

  nextTurn() {
    this.doublesCount = 0;
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % 2;
    this.awaitingAction = null;
  }

  processTurn(playerId) {
    const player = this.getCurrentPlayer();
    if (player.id !== playerId) return { error: "Не ваш ход" };
    if (this.awaitingAction) return { error: "Сначала выполните требуемое действие" };

    const events = [];

    // В тюрьме
    if (player.inJail) {
      const [d1, d2] = this.rollDice();
      events.push({ type: 'dice', values: [d1, d2], player: player.name });

      if (d1 === d2) {
        player.inJail = false;
        player.jailTurns = 0;
        events.push({ type: 'message', text: `${player.name} выбросил дубль и вышел из тюрьмы!` });
        const moveEvents = this.movePlayer(player, d1 + d2);
        events.push(...moveEvents);
        this.nextTurn();
      } else {
        player.jailTurns++;
        if (player.jailTurns >= 3) {
          player.inJail = false;
          player.jailTurns = 0;
          player.money -= 50;
          events.push({ type: 'message', text: `${player.name} заплатил 50$ и вышел из тюрьмы` });
          const moveEvents = this.movePlayer(player, d1 + d2);
          events.push(...moveEvents);
        } else {
          events.push({ type: 'message', text: `${player.name} остаётся в тюрьме (попытка ${player.jailTurns}/3)` });
        }
        this.nextTurn();
      }
      return { events };
    }

    // Обычный ход
    const [d1, d2] = this.rollDice();
    events.push({ type: 'dice', values: [d1, d2], player: player.name });

    if (this.isDoubles()) {
      this.doublesCount++;
      if (this.doublesCount >= 3) {
        player.position = 10;
        player.inJail = true;
        events.push({ type: 'message', text: `${player.name} выбросил 3 дубля подряд — в тюрьму!` });
        this.nextTurn();
        return { events };
      }
    }

    const moveEvents = this.movePlayer(player, d1 + d2);
    events.push(...moveEvents);

    // Если дубль и нет ожидающего действия — ещё ход (но nextTurn не вызываем)
    if (!this.isDoubles() || this.awaitingAction) {
      if (!this.awaitingAction) {
        this.nextTurn();
      }
    } else {
      events.push({ type: 'message', text: `${player.name} выбросил дубль! Ещё один ход.` });
    }

    this.checkBankruptcy();
    return { events };
  }

  movePlayer(player, steps) {
    const events = [];
    const oldPos = player.position;
    const newPos = (oldPos + steps) % 40;

    // Прошёл через СТАРТ?
    if (newPos < oldPos && newPos !== 0) {
      player.money += 200;
      events.push({ type: 'message', text: `${player.name} прошёл через СТАРТ и получил 200$` });
    }

    player.position = newPos;
    events.push({ type: 'move', playerId: player.id, position: newPos, from: oldPos });

    const cell = this.board[newPos];
    const landEvents = this.landOnCell(player, cell);
    events.push(...landEvents);

    return events;
  }

  landOnCell(player, cell) {
    const events = [];

    switch (cell.type) {
      case 'start':
        player.money += 200;
        events.push({ type: 'message', text: `${player.name} попал на СТАРТ! +200$` });
        break;

      case 'property':
      case 'railroad':
      case 'utility': {
        const owner = this.getPropertyOwner(cell.id);
        if (!owner) {
          // Никем не куплено — предложить купить
          if (player.money >= cell.price) {
            this.awaitingAction = { type: 'buy_or_pass', cellId: cell.id };
            events.push({
              type: 'offer',
              text: `${player.name} может купить "${cell.name}" за ${cell.price}$`,
              cellId: cell.id,
              price: cell.price
            });
          } else {
            events.push({ type: 'message', text: `${player.name} не может позволить себе "${cell.name}"` });
          }
        } else if (owner.id !== player.id && !owner.bankrupt) {
          // Платим ренту
          const rent = this.calculateRent(cell, owner);
          player.money -= rent;
          owner.money += rent;
          events.push({
            type: 'rent',
            text: `${player.name} заплатил ${rent}$ аренды ${owner.name} за "${cell.name}"`,
            from: player.id,
            to: owner.id,
            amount: rent
          });
        } else {
          events.push({ type: 'message', text: `${player.name} на своей собственности "${cell.name}"` });
        }
        break;
      }

      case 'tax':
        player.money -= cell.amount;
        events.push({ type: 'message', text: `${player.name} заплатил налог ${cell.amount}$` });
        break;

      case 'chance': {
        const card = this.drawChanceCard();
        events.push({ type: 'card', text: `Шанс: ${card.text}`, cardType: 'chance' });
        const cardEvents = this.applyCard(player, card);
        events.push(...cardEvents);
        break;
      }

      case 'chest': {
        const card = this.drawChestCard();
        events.push({ type: 'card', text: `Казна: ${card.text}`, cardType: 'chest' });
        const cardEvents = this.applyCard(player, card);
        events.push(...cardEvents);
        break;
      }

      case 'gotojail':
        player.position = 10;
        player.inJail = true;
        events.push({ type: 'message', text: `${player.name} отправляется в тюрьму!` });
        events.push({ type: 'move', playerId: player.id, position: 10 });
        break;

      case 'jail':
        events.push({ type: 'message', text: `${player.name} просто посещает тюрьму` });
        break;

      case 'parking':
        events.push({ type: 'message', text: `${player.name} отдыхает на парковке` });
        break;
    }

    return events;
  }

  drawChanceCard() {
    const card = this.chanceCards[this.chanceIndex];
    this.chanceIndex = (this.chanceIndex + 1) % this.chanceCards.length;
    return card;
  }

  drawChestCard() {
    const card = this.chestCards[this.chestIndex];
    this.chestIndex = (this.chestIndex + 1) % this.chestCards.length;
    return card;
  }

  applyCard(player, card) {
    const events = [];
    switch (card.action) {
      case 'receive':
        player.money += card.value;
        events.push({ type: 'message', text: `${player.name} получил ${card.value}$` });
        break;
      case 'pay':
        player.money -= card.value;
        events.push({ type: 'message', text: `${player.name} заплатил ${card.value}$` });
        break;
      case 'goto': {
        const oldPos = player.position;
        if (card.value < oldPos && card.value !== 30) {
          player.money += 200;
          events.push({ type: 'message', text: `${player.name} прошёл через СТАРТ и получил 200$` });
        }
        player.position = card.value;
        events.push({ type: 'move', playerId: player.id, position: card.value });
        const cell = this.board[card.value];
        const landEvents = this.landOnCell(player, cell);
        events.push(...landEvents);
        break;
      }
      case 'gotojail':
        player.position = 10;
        player.inJail = true;
        events.push({ type: 'message', text: `${player.name} отправляется в тюрьму!` });
        events.push({ type: 'move', playerId: player.id, position: 10 });
        break;
      case 'back': {
        player.position = (player.position - card.value + 40) % 40;
        events.push({ type: 'move', playerId: player.id, position: player.position });
        const cell = this.board[player.position];
        const landEvents = this.landOnCell(player, cell);
        events.push(...landEvents);
        break;
      }
      case 'birthday': {
        const other = this.players.find(p => p.id !== player.id);
        if (other) {
          other.money -= card.value;
          player.money += card.value;
          events.push({ type: 'message', text: `${other.name} подарил ${card.value}$ ${player.name}` });
        }
        break;
      }
    }
    return events;
  }

  getPropertyOwner(cellId) {
    for (const p of this.players) {
      if (p.properties.includes(cellId)) return p;
    }
    return null;
  }

  calculateRent(cell, owner) {
    if (cell.type === 'railroad') {
      const railroads = owner.properties.filter(id =>
        this.board[id].type === 'railroad'
      ).length;
      return cell.rent[railroads - 1];
    }

    if (cell.type === 'utility') {
      const utilities = owner.properties.filter(id =>
        this.board[id].type === 'utility'
      ).length;
      const diceSum = this.lastDice[0] + this.lastDice[1];
      return utilities === 1 ? diceSum * 4 : diceSum * 10;
    }

    // Обычная собственность
    const houses = owner.houses[cell.id] || 0;

    if (houses === 0) {
      // Проверяем, есть ли монополия
      const group = PROPERTY_GROUPS[cell.color];
      if (group && group.every(id => owner.properties.includes(id))) {
        return cell.rent[0] * 2; // Двойная рента при монополии без домов
      }
      return cell.rent[0];
    }

    return cell.rent[houses]; // houses 1-5 (5 = отель)
  }

  buyProperty(playerId, cellId) {
    const player = this.getCurrentPlayer();
    if (player.id !== playerId) return { error: "Не ваш ход" };
    if (!this.awaitingAction || this.awaitingAction.type !== 'buy_or_pass' || this.awaitingAction.cellId !== cellId) {
      return { error: "Нельзя купить это сейчас" };
    }

    const cell = this.board[cellId];
    if (player.money < cell.price) return { error: "Недостаточно денег" };

    player.money -= cell.price;
    player.properties.push(cellId);

    const events = [
      { type: 'buy', text: `${player.name} купил "${cell.name}" за ${cell.price}$`, playerId, cellId, price: cell.price }
    ];

    this.awaitingAction = null;

    // Если был дубль, не переключаем ход
    if (!this.isDoubles()) {
      this.nextTurn();
    }

    this.checkBankruptcy();
    return { events };
  }

  passProperty(playerId) {
    const player = this.getCurrentPlayer();
    if (player.id !== playerId) return { error: "Не ваш ход" };
    if (!this.awaitingAction || this.awaitingAction.type !== 'buy_or_pass') {
      return { error: "Нет предложения для отклонения" };
    }

    const cell = this.board[this.awaitingAction.cellId];
    const events = [
      { type: 'message', text: `${player.name} отказался от покупки "${cell.name}"` }
    ];

    this.awaitingAction = null;

    if (!this.isDoubles()) {
      this.nextTurn();
    }

    return { events };
  }

  buyHouse(playerId, cellId) {
    const player = this.getPlayer(playerId);
    if (!player) return { error: "Игрок не найден" };

    const cell = this.board[cellId];
    if (!cell || cell.type !== 'property') return { error: "Нельзя строить здесь" };
    if (!player.properties.includes(cellId)) return { error: "Это не ваша собственность" };

    // Проверяем монополию
    const group = PROPERTY_GROUPS[cell.color];
    if (!group || !group.every(id => player.properties.includes(id))) {
      return { error: "Нужна монополия для строительства" };
    }

    const currentHouses = player.houses[cellId] || 0;
    if (currentHouses >= 5) return { error: "Максимум домов/отель уже построен" };

    if (player.money < cell.houseCost) return { error: "Недостаточно денег" };

    // Проверяем равномерность строительства
    const minHouses = Math.min(...group.map(id => player.houses[id] || 0));
    if (currentHouses > minHouses) {
      return { error: "Стройте равномерно! Сначала постройте на других участках группы." };
    }

    player.money -= cell.houseCost;
    player.houses[cellId] = currentHouses + 1;

    const buildingType = player.houses[cellId] === 5 ? 'отель' : `дом (${player.houses[cellId]})`;

    return {
      events: [{
        type: 'build',
        text: `${player.name} построил ${buildingType} на "${cell.name}" за ${cell.houseCost}$`,
        playerId,
        cellId,
        houses: player.houses[cellId]
      }]
    };
  }

  payJailFine(playerId) {
    const player = this.getCurrentPlayer();
    if (player.id !== playerId) return { error: "Не ваш ход" };
    if (!player.inJail) return { error: "Вы не в тюрьме" };
    if (player.money < 50) return { error: "Недостаточно денег" };

    player.money -= 50;
    player.inJail = false;
    player.jailTurns = 0;

    return {
      events: [{ type: 'message', text: `${player.name} заплатил 50$ и вышел из тюрьмы` }]
    };
  }

  checkBankruptcy() {
    for (const player of this.players) {
      if (player.money < 0) {
        player.bankrupt = true;
        this.gameOver = true;
        this.winner = this.players.find(p => p.id !== player.id);
      }
    }
  }

  getState() {
    return {
      roomId: this.roomId,
      board: this.board,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        money: p.money,
        position: p.position,
        token: p.token,
        color: p.color,
        properties: p.properties,
        inJail: p.inJail,
        jailTurns: p.jailTurns,
        bankrupt: p.bankrupt,
        houses: p.houses
      })),
      currentPlayerIndex: this.currentPlayerIndex,
      currentPlayerId: this.players[this.currentPlayerIndex]?.id,
      started: this.started,
      gameOver: this.gameOver,
      winner: this.winner ? { id: this.winner.id, name: this.winner.name } : null,
      lastDice: this.lastDice,
      awaitingAction: this.awaitingAction,
      propertyGroups: PROPERTY_GROUPS
    };
  }
}

module.exports = Game;
