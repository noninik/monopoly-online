const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Game = require('./game');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Хранилище игр
const games = new Map();
const playerSockets = new Map(); // ws -> { playerId, roomId }

function broadcast(roomId, message) {
  const game = games.get(roomId);
  if (!game) return;

  wss.clients.forEach(client => {
    const info = playerSockets.get(client);
    if (info && info.roomId === roomId && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

function sendTo(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendGameState(roomId) {
  const game = games.get(roomId);
  if (!game) return;

  wss.clients.forEach(client => {
    const info = playerSockets.get(client);
    if (info && info.roomId === roomId && client.readyState === WebSocket.OPEN) {
      sendTo(client, {
        type: 'gameState',
        state: game.getState(),
        yourId: info.playerId
      });
    }
  });
}

wss.on('connection', (ws) => {
  console.log('New connection');

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (e) {
      return;
    }

    switch (msg.type) {
      case 'createRoom': {
        const roomId = uuidv4().substring(0, 6).toUpperCase();
        const playerId = uuidv4();
        const game = new Game(roomId);
        game.addPlayer(playerId, msg.name || 'Игрок 1');
        games.set(roomId, game);
        playerSockets.set(ws, { playerId, roomId });

        sendTo(ws, {
          type: 'roomCreated',
          roomId,
          playerId,
          state: game.getState()
        });
        console.log(`Room created: ${roomId} by ${msg.name}`);
        break;
      }

      case 'joinRoom': {
        const roomId = msg.roomId?.toUpperCase();
        const game = games.get(roomId);
        if (!game) {
          sendTo(ws, { type: 'error', text: 'Комната не найдена' });
          return;
        }
        if (game.players.length >= 2) {
          sendTo(ws, { type: 'error', text: 'Комната полна' });
          return;
        }

        const playerId = uuidv4();
        game.addPlayer(playerId, msg.name || 'Игрок 2');
        game.started = true;
        playerSockets.set(ws, { playerId, roomId });

        sendTo(ws, {
          type: 'roomJoined',
          roomId,
          playerId,
          state: game.getState()
        });

        broadcast(roomId, {
          type: 'gameStarted',
          state: game.getState()
        });

        console.log(`${msg.name} joined room ${roomId}`);
        break;
      }

      case 'rollDice': {
        const info = playerSockets.get(ws);
        if (!info) return;
        const game = games.get(info.roomId);
        if (!game || !game.started || game.gameOver) return;

        const result = game.processTurn(info.playerId);
        if (result.error) {
          sendTo(ws, { type: 'error', text: result.error });
          return;
        }

        broadcast(info.roomId, {
          type: 'turnResult',
          events: result.events,
          state: game.getState()
        });
        break;
      }

      case 'buyProperty': {
        const info = playerSockets.get(ws);
        if (!info) return;
        const game = games.get(info.roomId);
        if (!game) return;

        const result = game.buyProperty(info.playerId, msg.cellId);
        if (result.error) {
          sendTo(ws, { type: 'error', text: result.error });
          return;
        }

        broadcast(info.roomId, {
          type: 'turnResult',
          events: result.events,
          state: game.getState()
        });
        break;
      }

      case 'passProperty': {
        const info = playerSockets.get(ws);
        if (!info) return;
        const game = games.get(info.roomId);
        if (!game) return;

        const result = game.passProperty(info.playerId);
        if (result.error) {
          sendTo(ws, { type: 'error', text: result.error });
          return;
        }

        broadcast(info.roomId, {
          type: 'turnResult',
          events: result.events,
          state: game.getState()
        });
        break;
      }

      case 'buyHouse': {
        const info = playerSockets.get(ws);
        if (!info) return;
        const game = games.get(info.roomId);
        if (!game) return;

        const result = game.buyHouse(info.playerId, msg.cellId);
        if (result.error) {
          sendTo(ws, { type: 'error', text: result.error });
          return;
        }

        broadcast(info.roomId, {
          type: 'turnResult',
          events: result.events,
          state: game.getState()
        });
        break;
      }

      case 'payJailFine': {
        const info = playerSockets.get(ws);
        if (!info) return;
        const game = games.get(info.roomId);
        if (!game) return;

        const result = game.payJailFine(info.playerId);
        if (result.error) {
          sendTo(ws, { type: 'error', text: result.error });
          return;
        }

        broadcast(info.roomId, {
          type: 'turnResult',
          events: result.events,
          state: game.getState()
        });

        sendGameState(info.roomId);
        break;
      }
    }
  });

  ws.on('close', () => {
    const info = playerSockets.get(ws);
    if (info) {
      const game = games.get(info.roomId);
      if (game) {
        broadcast(info.roomId, {
          type: 'playerDisconnected',
          text: 'Соперник отключился'
        });
        // Удаляем комнату через некоторое время
        setTimeout(() => {
          games.delete(info.roomId);
        }, 60000);
      }
      playerSockets.delete(ws);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Monopoly server running on port ${PORT}`);
});
