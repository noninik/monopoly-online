const { BOARD_DATA, CHANCE_CARDS, CHEST_CARDS, PROPERTY_GROUPS } = require('./board');

class Game {
  constructor(roomId, maxPlayers) {
    this.roomId = roomId;
    this.maxPlayers = maxPlayers || 3;
    this.players = [];
    this.currentPlayerIndex = 0;
    this.board = JSON.parse(JSON.stringify(BOARD_DATA));
    this.started = false;
    this.gameOver = false;
    this.winner = null;
    this.lastDice = [0, 0];
    this.doublesCount = 0;
    this.awaitingAction = null;
    this.chanceCards = this.shuffle([...CHANCE_CARDS]);
    this.chestCards = this.shuffle([...CHEST_CARDS]);
    this.chanceIndex = 0;
    this.chestIndex = 0;
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  addPlayer(id, name) {
    if (this.players.length >= this.maxPlayers) return false;
    const tokens = ['🚗', '🎩', '⚓'];
    const colors = ['#e74c3c', '#3498db', '#2ecc71'];
    this.players.push({
      id, name,
      money: 1500,
      position: 0,
      token: tokens[this.players.length],
      color: colors[this.players.length],
      properties: [],
      inJail: false,
      jailTurns: 0,
      bankrupt: false,
      houses: {}
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

  getActivePlayers() {
    return this.players.filter(p => !p.bankrupt);
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
    this.awaitingAction = null;
    const active = this.getActivePlayers();
    if (active.length <= 1) {
      this.gameOver = true;
      this.winner = active[0] || null;
      return;
    }
    do {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    } while (this.players[this.currentPlayerIndex].bankrupt);
  }

  processTurn(playerId) {
    const player = this.getCurrentPlayer();
    if (!player || player.id !== playerId) return { error: "Не ваш ход" };
    if (this.awaitingAction) return { error: "Сначала выполните действие" };
    if (player.bankrupt) return { error: "Вы банкрот" };

    const events = [];

    if (player.inJail) {
      const [d1, d2] = this.rollDice();
      events.push({ type: 'dice', values: [d1, d2], player: player.name });
      if (d1 === d2) {
        player.inJail = false;
        player.jailTurns = 0;
        events.push({ type: 'message', text: `${player.name} выбросил дубль и вышел из тюрьмы!` });
        events.push(...this.movePlayer(player, d1 + d2));
      } else {
        player.jailTurns++;
        if (player.jailTurns >= 3) {
          player.inJail = false;
          player.jailTurns = 0;
          player.money -= 50;
          events.push({ type: 'message', text: `${player.name} заплатил 50$ и вышел из тюрьмы` });
          events.push(...this.movePlayer(player, d1 + d2));
        } else {
          events.push({ type: 'message', text: `${player.name} в тюрьме (попытка ${player.jailTurns}/3)` });
        }
      }
      if (!this.awaitingAction) this.nextTurn();
      this.checkBankruptcy();
      return { events };
    }

    const [d1, d2] = this.rollDice();
    events.push({ type: 'dice', values: [d1, d2], player: player.name });

    if (this.isDoubles()) {
      this.doublesCount++;
      if (this.doublesCount >= 3) {
        player.position = 10;
        player.inJail = true;
        events.push({ type: 'message', text: `${player.name} — 3 дубля подряд — в тюрьму!` });
        events.push({ type: 'move', playerId: player.id, position: 10 });
        this.nextTurn();
        return { events };
      }
    }

    events.push(...this.movePlayer(player, d1 + d2));

    if (!this.awaitingAction) {
      if (this.isDoubles()) {
        events.push({ type: 'message', text: `${player.name} выбросил дубль! Ещё ход.` });
      } else {
        this.nextTurn();
      }
    }

    this.checkBankruptcy();
    return { events };
  }

  movePlayer(player, steps) {
    const events = [];
    const oldPos = player.position;
    const newPos = (oldPos + steps) % 40;
    if (newPos < oldPos) {
      player.money += 200;
      events.push({ type: 'message', text: `${player.name} прошёл СТАРТ +200$` });
    }
    player.position = newPos;
    events.push({ type: 'move', playerId: player.id, position: newPos });
    events.push(...this.landOnCell(player, this.board[newPos]));
    return events;
  }

  landOnCell(player, cell) {
    const events = [];
    switch (cell.type) {
      case 'start':
        player.money += 200;
        events.push({ type: 'message', text: `${player.name} на СТАРТЕ! +200$` });
        break;
      case 'property':
      case 'railroad':
      case 'utility': {
        const owner = this.getPropertyOwner(cell.id);
        if (!owner) {
          if (player.money >= cell.price) {
            this.awaitingAction = { type: 'buy_or_pass', cellId: cell.id };
            events.push({ type: 'offer', text: `${player.name} может купить "${cell.name}" за ${cell.price}$`, cellId: cell.id, price: cell.price });
          } else {
            events.push({ type: 'message', text: `${player.name} не хватает денег на "${cell.name}"` });
          }
        } else if (owner.id !== player.id && !owner.bankrupt) {
          const rent = this.calculateRent(cell, owner);
          player.money -= rent;
          owner.money += rent;
          events.push({ type: 'rent', text: `${player.name} платит ${rent}$ ренты ${owner.name} за "${cell.name}"`, from: player.id, to: owner.id, amount: rent });
        } else if (owner.id === player.id) {
          events.push({ type: 'message', text: `${player.name} на своём участке "${cell.name}"` });
        }
        break;
      }
      case 'tax':
        player.money -= cell.amount;
        events.push({ type: 'message', text: `${player.name} платит налог ${cell.amount}$` });
        break;
      case 'chance': {
        const card = this.chanceCards[this.chanceIndex];
        this.chanceIndex = (this.chanceIndex + 1) % this.chanceCards.length;
        events.push({ type: 'card', text: `Шанс: ${card.text}`, cardType: 'chance' });
        events.push(...this.applyCard(player, card));
        break;
      }
      case 'chest': {
        const card = this.chestCards[this.chestIndex];
        this.chestIndex = (this.chestIndex + 1) % this.chestCards.length;
        events.push({ type: 'card', text: `Казна: ${card.text}`, cardType: 'chest' });
        events.push(...this.applyCard(player, card));
        break;
      }
      case 'gotojail':
        player.position = 10;
        player.inJail = true;
        events.push({ type: 'message', text: `${player.name} в тюрьму!` });
        events.push({ type: 'move', playerId: player.id, position: 10 });
        break;
      case 'jail':
        events.push({ type: 'message', text: `${player.name} навещает тюрьму` });
        break;
      case 'parking':
        events.push({ type: 'message', text: `${player.name} на парковке` });
        break;
    }
    return events;
  }

  applyCard(player, card) {
    const events = [];
    switch (card.action) {
      case 'receive':
        player.money += card.value;
        events.push({ type: 'message', text: `${player.name} +${card.value}$` });
        break;
      case 'pay':
        player.money -= card.value;
        events.push({ type: 'message', text: `${player.name} -${card.value}$` });
        break;
      case 'goto': {
        const oldPos = player.position;
        if (card.value < oldPos) {
          player.money += 200;
          events.push({ type: 'message', text: `${player.name} прошёл СТАРТ +200$` });
        }
        player.position = card.value;
        events.push({ type: 'move', playerId: player.id, position: card.value });
        events.push(...this.landOnCell(player, this.board[card.value]));
        break;
      }
      case 'gotojail':
        player.position = 10;
        player.inJail = true;
        events.push({ type: 'message', text: `${player.name} в тюрьму!` });
        events.push({ type: 'move', playerId: player.id, position: 10 });
        break;
      case 'back':
        player.position = (player.position - card.value + 40) % 40;
        events.push({ type: 'move', playerId: player.id, position: player.position });
        events.push(...this.landOnCell(player, this.board[player.position]));
        break;
      case 'birthday':
        this.players.forEach(p => {
          if (p.id !== player.id && !p.bankrupt) {
            p.money -= card.value;
            player.money += card.value;
            events.push({ type: 'message', text: `${p.name} дарит ${card.value}$ ${player.name}` });
          }
        });
        break;
    }
    return events;
  }

  getPropertyOwner(cellId) {
    return this.players.find(p => p.properties.includes(cellId)) || null;
  }

  calculateRent(cell, owner) {
    if (cell.type === 'railroad') {
      const count = owner.properties.filter(id => this.board[id].type === 'railroad').length;
      return cell.rent[count - 1];
    }
    if (cell.type === 'utility') {
      const count = owner.properties.filter(id => this.board[id].type === 'utility').length;
      const sum = this.lastDice[0] + this.lastDice[1];
      return count === 1 ? sum * 4 : sum * 10;
    }
    const houses = owner.houses[cell.id] || 0;
    if (houses === 0) {
      const group = PROPERTY_GROUPS[cell.color];
      if (group && group.every(id => owner.properties.includes(id))) return cell.rent[0] * 2;
      return cell.rent[0];
    }
    return cell.rent[houses];
  }

  buyProperty(playerId, cellId) {
    const player = this.getCurrentPlayer();
    if (!player || player.id !== playerId) return { error: "Не ваш ход" };
    if (!this.awaitingAction || this.awaitingAction.cellId !== cellId) return { error: "Нельзя купить" };
    const cell = this.board[cellId];
    if (player.money < cell.price) return { error: "Нет денег" };
    player.money -= cell.price;
    player.properties.push(cellId);
    const events = [{ type: 'buy', text: `${player.name} купил "${cell.name}" за ${cell.price}$`, playerId, cellId }];
    this.awaitingAction = null;
    if (!this.isDoubles()) this.nextTurn();
    this.checkBankruptcy();
    return { events };
  }

  passProperty(playerId) {
    const player = this.getCurrentPlayer();
    if (!player || player.id !== playerId) return { error: "Не ваш ход" };
    if (!this.awaitingAction) return { error: "Нечего пропускать" };
    const cell = this.board[this.awaitingAction.cellId];
    const events = [{ type: 'message', text: `${player.name} отказался от "${cell.name}"` }];
    this.awaitingAction = null;
    if (!this.isDoubles()) this.nextTurn();
    return { events };
  }

  buyHouse(playerId, cellId) {
    const player = this.getPlayer(playerId);
    if (!player) return { error: "Игрок не найден" };
    const cell = this.board[cellId];
    if (!cell || cell.type !== 'property') return { error: "Нельзя строить" };
    if (!player.properties.includes(cellId)) return { error: "Не ваше" };
    const group = PROPERTY_GROUPS[cell.color];
    if (!group || !group.every(id => player.properties.includes(id))) return { error: "Нужна монополия" };
    const cur = player.houses[cellId] || 0;
    if (cur >= 5) return { error: "Максимум" };
    if (player.money < cell.houseCost) return { error: "Нет денег" };
    const minH = Math.min(...group.map(id => player.houses[id] || 0));
    if (cur > minH) return { error: "Стройте равномерно" };
    player.money -= cell.houseCost;
    player.houses[cellId] = cur + 1;
    const label = player.houses[cellId] === 5 ? 'отель' : `дом ${player.houses[cellId]}`;
    return { events: [{ type: 'build', text: `${player.name} построил ${label} на "${cell.name}"`, playerId, cellId, houses: player.houses[cellId] }] };
  }

  payJailFine(playerId) {
    const player = this.getCurrentPlayer();
    if (!player || player.id !== playerId) return { error: "Не ваш ход" };
    if (!player.inJail) return { error: "Вы не в тюрьме" };
    if (player.money < 50) return { error: "Нет денег" };
    player.money -= 50;
    player.inJail = false;
    player.jailTurns = 0;
    return { events: [{ type: 'message', text: `${player.name} заплатил 50$ — свобода!` }] };
  }

  surrender(playerId) {
    const player = this.getPlayer(playerId);
    if (!player) return { error: "Игрок не найден" };
    player.bankrupt = true;
    player.properties = [];
    player.houses = {};
    const events = [{ type: 'message', text: `${player.name} сдался!` }];

    // Если ожидалось действие от этого игрока
    if (this.awaitingAction && this.getCurrentPlayer()?.id === playerId) {
      this.awaitingAction = null;
    }

    const active = this.getActivePlayers();
    if (active.length <= 1) {
      this.gameOver = true;
      this.winner = active[0] || null;
      events.push({ type: 'message', text: `${this.winner?.name || '???'} победил!` });
    } else {
      if (this.getCurrentPlayer()?.id === playerId) {
        this.nextTurn();
      }
    }
    return { events };
  }

  checkBankruptcy() {
    this.players.forEach(p => {
      if (p.money < 0 && !p.bankrupt) {
        p.bankrupt = true;
        p.properties = [];
        p.houses = {};
      }
    });
    const active = this.getActivePlayers();
    if (active.length <= 1 && this.started) {
      this.gameOver = true;
      this.winner = active[0] || null;
    }
  }

  getState() {
    return {
      roomId: this.roomId,
      maxPlayers: this.maxPlayers,
      board: this.board,
      players: this.players.map(p => ({
        id: p.id, name: p.name, money: p.money, position: p.position,
        token: p.token, color: p.color, properties: p.properties,
        inJail: p.inJail, jailTurns: p.jailTurns, bankrupt: p.bankrupt, houses: p.houses
      })),
      currentPlayerIndex: this.currentPlayerIndex,
      currentPlayerId: this.getCurrentPlayer()?.id,
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
