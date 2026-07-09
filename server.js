// Mini Games server — rooms + Socket.IO transport.
// Each game lives in games/<name>.js and implements:
//   create(room)                    -> game state
//   handleAction(room, player, msg) -> mutates state, returns true if state changed
//   viewFor(room, player)           -> redacted state for that player
const path = require('path');
const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');

const wavelength = require('./games/wavelength');
const GAMES = { wavelength };

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server);

const rooms = new Map(); // code -> room

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function publicPlayers(room) {
  return [...room.players.values()].map(p => ({
    id: p.id, name: p.name, team: p.team, connected: p.connected,
  }));
}

// Send each player their own (possibly redacted) view.
function broadcast(room) {
  const game = GAMES[room.gameName];
  for (const p of room.players.values()) {
    if (!p.socketId) continue;
    io.to(p.socketId).emit('state', {
      code: room.code,
      you: p.id,
      hostId: room.hostId,
      players: publicPlayers(room),
      game: room.state ? game.viewFor(room, p) : null,
    });
  }
}

io.on('connection', (socket) => {
  let room = null;
  let player = null;

  socket.on('create_room', ({ name }, cb) => {
    name = String(name || '').trim().slice(0, 20);
    if (!name) return cb({ error: 'Name required' });
    const code = makeCode();
    player = { id: 'p' + Math.random().toString(36).slice(2, 10), name, team: null, connected: true, socketId: socket.id };
    room = {
      code,
      gameName: 'wavelength',
      hostId: player.id,
      players: new Map([[player.id, player]]),
      state: null,
    };
    rooms.set(code, room);
    socket.join(code);
    cb({ ok: true, code, playerId: player.id });
    broadcast(room);
  });

  socket.on('join_room', ({ code, name }, cb) => {
    code = String(code || '').trim().toUpperCase();
    name = String(name || '').trim().slice(0, 20);
    const r = rooms.get(code);
    if (!r) return cb({ error: 'Room not found' });
    if (!name) return cb({ error: 'Name required' });

    // Reclaim seat if a disconnected player has this name.
    let existing = [...r.players.values()].find(p => p.name.toLowerCase() === name.toLowerCase());
    if (existing && existing.connected) return cb({ error: 'That name is taken in this room' });

    if (existing) {
      existing.connected = true;
      existing.socketId = socket.id;
      player = existing;
    } else {
      if (r.state && r.state.phase !== 'lobby') return cb({ error: 'Game already in progress — ask them to finish the round, or rejoin with the name you used before' });
      player = { id: 'p' + Math.random().toString(36).slice(2, 10), name, team: null, connected: true, socketId: socket.id };
      r.players.set(player.id, player);
    }
    room = r;
    socket.join(code);
    cb({ ok: true, code, playerId: player.id });
    broadcast(room);
  });

  socket.on('set_team', ({ team }) => {
    if (!room || !player) return;
    if (team !== 'blue' && team !== 'red') return;
    if (room.state && room.state.phase !== 'lobby' && room.state.phase !== 'gameover') return;
    player.team = team;
    broadcast(room);
  });

  socket.on('start_game', () => {
    if (!room || !player || player.id !== room.hostId) return;
    const game = GAMES[room.gameName];
    const err = game.canStart(room);
    if (err) {
      socket.emit('toast', err);
      return;
    }
    room.state = game.create(room);
    broadcast(room);
  });

  socket.on('action', (msg) => {
    if (!room || !player || !room.state) return;
    const game = GAMES[room.gameName];
    try {
      const changed = game.handleAction(room, player, msg || {});
      if (changed) broadcast(room);
    } catch (e) {
      console.error('action error', e);
    }
  });

  // Lightweight live dial movement — no full state broadcast.
  socket.on('dial', ({ pos }) => {
    if (!room || !player || !room.state) return;
    const game = GAMES[room.gameName];
    if (game.handleDial && game.handleDial(room, player, pos)) {
      socket.to(room.code).emit('dial', { pos: room.state.dialPos, by: player.name });
    }
  });

  socket.on('disconnect', () => {
    if (!room || !player) return;
    player.connected = false;
    player.socketId = null;
    // Drop empty rooms after a grace period.
    const r = room;
    setTimeout(() => {
      if ([...r.players.values()].every(p => !p.connected)) rooms.delete(r.code);
    }, 10 * 60 * 1000);
    broadcast(room);
  });
});

// ---- public share link (tunnel) ----
// Opens a free localtunnel so friends anywhere can join. If it fails,
// the game still works locally. Disable with TUNNEL=off.
let shareInfo = null;
app.get('/share', (req, res) => res.json(shareInfo || {}));

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let d = '';
      res.on('data', c => (d += c));
      res.on('end', () => resolve(d.trim()));
    }).on('error', reject);
  });
}

async function startTunnel(port) {
  // No tunnel needed when running on a hosting platform — it has a public URL already.
  const hosted = process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || process.env.FLY_APP_NAME
    || process.env.NODE_ENV === 'production';
  if (process.env.TUNNEL === 'off' || hosted) return;
  try {
    const localtunnel = require('localtunnel');
    const tunnel = await localtunnel({ port });
    let password = null;
    try { password = await fetchText('https://ipv4.icanhazip.com'); } catch {}
    shareInfo = { url: tunnel.url, password };
    console.log('');
    console.log('  Friends can join from anywhere at:');
    console.log('  ' + tunnel.url);
    if (password) console.log(`  (first visit asks for a "tunnel password" — it is: ${password})`);
    console.log('');
    tunnel.on('close', () => { shareInfo = null; });
    tunnel.on('error', () => { shareInfo = null; });
  } catch (e) {
    console.log('Could not create a public link (' + e.message + ') — playing on this network still works.');
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Mini Games running → http://localhost:${PORT}`);
  startTunnel(PORT);
});
