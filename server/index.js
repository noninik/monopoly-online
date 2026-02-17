const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Game = require('./game');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const games = new Map();
const playerSockets = new Map();

function broadcast(roomId, message) {
  wss.clients.forEach(client => {
    const info = playerSockets.get(client);
    if (info && info.roomId === roomId && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

function sendTo(ws, message) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

wss.on('connection', (ws) => {
  console.log('New connection');

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch (e) { return; }

    switch (msg.type) {
      case 'createRoom': {
        const roomId = uuidv4().substring(0, 6).toUpperCase();
        const playerId = uuidv4();
        const maxPlayers = Math.min(Math.max(parseInt(msg.maxPlayers) || 2, 2), 3);
        const game = new Game(roomId, maxPlayers);
        game.addPlayer(playerId, msg.name || 'Игрок 1');
        games.set(roomId, game);
        playerSockets.set(ws, { playerId, roomId });
        sendTo(ws, { type: 'roomCreated', roomId, playerId, state: game.getState() });
        break;
      }

      case 'joinRoom': {
        const roomId = msg.roomId?.toUpperCase();
        const game = games.get(roomId);
        if (!game) { sendTo(ws, { type: 'error', text: 'Комната не найдена' }); return; }
        if (game.players.length >= game.maxPlayers) { sendTo(ws, { type: 'error', text: 'Комната полна' }); return; }
        if (game.started) { sendTo(ws, { type: 'error', text: 'Игра уже идёт' }); return; }

        const playerId = uuidv4();
        game.addPlayer(playerId, msg.name || `Игрок ${game.players.length}`);
        playerSockets.set(ws, { playerId, roomId });

        sendTo(ws, { type: 'roomJoined', roomId, playerId, state: game.getState() });

        // Если набрано нужное кол-во — старт
        if (game.players.length >= game.maxPlayers) {
          game.started = true;
          broadcast(roomId, { type: 'gameStarted', state: game.getState() });
        } else {
          broadcast(roomId, { type: 'playerJoined', state: game.getState() });
        }
        break;
      }

      case 'startEarly': {
        const info = playerSockets.get(ws);
        if (!info) return;
        const game = games.get(info.roomId);
        if (!game || game.started) return;
        if (game.players.length < 2) { sendTo(ws, { type: 'error', text: 'Минимум 2 игрока' }); return; }
        // Только создатель может стартовать раньше
        if (game.players[0].id !== info.playerId) { sendTo(ws, { type: 'error', text: 'Только создатель может начать' }); return; }
        game.started = true;
        broadcast(info.roomId, { type: 'gameStarted', state: game.getState() });
        break;
      }

      case 'rollDice': {
        const info = playerSockets.get(ws);
        if (!info) return;
        const game = games.get(info.roomId);
        if (!game || !game.started || game.gameOver) return;
        const result = game.processTurn(info.playerId);
        if (result.error) { sendTo(ws, { type: 'error', text: result.error }); return; }
        broadcast(info.roomId, { type: 'turnResult', events: result.events, state: game.getState() });
        break;
      }

      case 'buyProperty': {
        const info = playerSockets.get(ws);
        if (!info) return;
        const game = games.get(info.roomId);
        if (!game) return;
        const result = game.buyProperty(info.playerId, msg.cellId);
        if (result.error) { sendTo(ws, { type: 'error', text: result.error }); return; }
        broadcast(info.roomId, { type: 'turnResult', events: result.events, state: game.getState() });
        break;
      }

      case 'passProperty': {
        const info = playerSockets.get(ws);
        if (!info) return;
        const game = games.get(info.roomId);
        if (!game) return;
        const result = game.passProperty(info.playerId);
        if (result.error) { sendTo(ws, { type: 'error', text: result.error }); return; }
        broadcast(info.roomId, { type: 'turnResult', events: result.events, state: game.getState() });
        break;
      }

      case 'buyHouse': {
        const info = playerSockets.get(ws);
        if (!info) return;
        const game = games.get(info.roomId);
        if (!game) return;
        const result = game.buyHouse(info.playerId, msg.cellId);
        if (result.error) { sendTo(ws, { type: 'error', text: result.error }); return; }
        broadcast(info.roomId, { type: 'turnResult', events: result.events, state: game.getState() });
        break;
      }

      case 'payJailFine': {
        const info = playerSockets.get(ws);
        if (!info) return;
        const game = games.get(info.roomId);
        if (!game) return;
        const result = game.payJailFine(info.playerId);
        if (result.error) { sendTo(ws, { type: 'error', text: result.error }); return; }
        broadcast(info.roomId, { type: 'turnResult', events: result.events, state: game.getState() });
        break;
      }

      case 'surrender': {
        const info = playerSockets.get(ws);
        if (!info) return;
        const game = games.get(info.roomId);
        if (!game || !game.started) return;
        const result = game.surrender(info.playerId);
        if (result.error) { sendTo(ws, { type: 'error', text: result.error }); return; }
        broadcast(info.roomId, { type: 'turnResult', events: result.events, state: game.getState() });
        break;
      }
    }
  });

  ws.on('close', () => {
    const info = playerSockets.get(ws);
    if (info) {
      broadcast(info.roomId, { type: 'playerDisconnected', text: 'Игрок отключился' });
      setTimeout(() => {
        const game = games.get(info.roomId);
        if (game) {
          const allDisconnected = game.players.every(p => {
            let found = false;
            wss.clients.forEach(c => {
              const ci = playerSockets.get(c);
              if (ci && ci.playerId === p.id && c.readyState === WebSocket.OPEN) found = true;
            });
            return !found;
          });
          if (allDisconnected) games.delete(info.roomId);
        }
      }, 120000);
      playerSockets.delete(ws);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Monopoly server on port ${PORT}`));
