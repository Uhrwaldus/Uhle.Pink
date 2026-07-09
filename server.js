// Mini Games server — rooms + Socket.IO transport + co-op leaderboard.
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');

const GAMES = {
  wavelength: require('./games/wavelength'),
  themind: require('./games/themind'),
  spyfall: require('./games/spyfall'),
  loveletter: require('./games/loveletter'),
  coup: require('./games/coup'),
  codenames: require('./games/codenames'),
  hanabi: require('./games/hanabi'),
  werewolf: require('./games/werewolf'),
};

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server);

const rooms = new Map(); // code -> room

// ---- co-op leaderboard (JSON file; per rounds-bracket) ----
const LB_FILE = path.join(__dirname, 'leaderboard.json');
let leaderboard = { 10: [], 20: [], 30: [] };
try { leaderboard = { ...leaderboard, ...JSON.parse(fs.readFileSync(LB_FILE, 'utf8')) }; } catch {}

function saveLeaderboard() {
  try { fs.writeFileSync(LB_FILE, JSON.stringify(leaderboard)); } catch (e) { console.error('leaderboard save failed:', e.message); }
}

function recordCoopScore(room) {
  const s = room.state;
  const entry = {
    name: (room.teamName || 'Anonymous').slice(0, 24),
    score: s.scores.total,
    max: s.totalRounds * 4,
    players: [...room.players.values()].map(p => p.name).slice(0, 8),
    date: new Date().toISOString().slice(0, 10),
  };
  const bracket = leaderboard[s.totalRounds] || (leaderboard[s.totalRounds] = []);
  bracket.push(entry);
  bracket.sort((a, b) => b.score - a.score);
  leaderboard[s.totalRounds] = bracket.slice(0, 50);
  saveLeaderboard();
  return leaderboard[s.totalRounds].indexOf(entry) + 1 || null;
}

app.get('/leaderboard', (req, res) => {
  const rounds = parseInt(req.query.rounds, 10);
  const bracket = leaderboard[rounds] || [];
  res.json({ rounds, top: bracket.slice(0, 10) });
});

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

function broadcast(room) {
  const game = GAMES[room.gameName];
  for (const p of room.players.values()) {
    if (!p.socketId) continue;
    io.to(p.socketId).emit('state', {
      code: room.code,
      you: p.id,
      hostId: room.hostId,
      gameName: room.gameName,
      mode: room.mode || 'teams',
      coopRounds: room.coopRounds || 10,
      teamName: room.teamName || '',
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
    room.broadcast = () => broadcast(room);
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

  function inLobby(r) {
    return !r.state || r.state.phase === 'lobby' || r.state.phase === 'gameover';
  }

  socket.on('set_game', ({ game }) => {
    if (!room || !player || player.id !== room.hostId) return;
    if (!GAMES[game]) return;
    if (!inLobby(room)) return;
    room.gameName = game;
    room.state = null; // back to lobby if a finished game was on screen
    broadcast(room);
  });

  // Host can pull everyone back to the lobby at any time (keeps the room).
  socket.on('to_lobby', () => {
    if (!room || !player || player.id !== room.hostId) return;
    room.state = null;
    broadcast(room);
  });

  socket.on('set_mode', ({ mode }) => {
    if (!room || !player || player.id !== room.hostId) return;
    if (mode !== 'teams' && mode !== 'coop') return;
    if (!inLobby(room)) return;
    room.mode = mode;
    broadcast(room);
  });

  socket.on('set_rounds', ({ rounds }) => {
    if (!room || !player || player.id !== room.hostId) return;
    if (![10, 20, 30].includes(rounds)) return;
    if (!inLobby(room)) return;
    room.coopRounds = rounds;
    broadcast(room);
  });

  socket.on('set_team_name', ({ name }) => {
    if (!room || !player || player.id !== room.hostId) return;
    if (!inLobby(room)) return;
    room.teamName = String(name || '').trim().slice(0, 24);
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
      if (changed) {
        const s = room.state;
        if (room.gameName === 'wavelength' && s && s.phase === 'gameover' && s.mode === 'coop' && !s.recorded) {
          s.recorded = true;
          s.lbRank = recordCoopScore(room);
        }
        broadcast(room);
      }
    } catch (e) {
      console.error('action error', e);
    }
  });

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
    const r = room;
    setTimeout(() => {
      if ([...r.players.values()].every(p => !p.connected)) rooms.delete(r.code);
    }, 10 * 60 * 1000);
    broadcast(room);
  });
});

// ---- public share link (tunnel) ----
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
