// End-to-end test: spawns the server, simulates 4 players playing until someone wins.
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3456;
const URL = `http://localhost:${PORT}`;

function connect() { return io(URL, { transports: ['websocket'] }); }
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const server = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT }, stdio: 'pipe',
  });
  await wait(1000);

  const players = {};
  const states = {};
  const names = ['Casper', 'Alice', 'Bob', 'Cleo'];
  for (const n of names) {
    players[n] = connect();
    players[n].on('state', s => { states[n] = s; });
  }
  await wait(300);

  // Create + join
  const code = await new Promise(res =>
    players['Casper'].emit('create_room', { name: 'Casper' }, r => res(r.code)));
  console.log('room code:', code);
  for (const n of names.slice(1)) {
    await new Promise(res => players[n].emit('join_room', { code, name: n }, r => {
      if (r.error) throw new Error(r.error);
      res();
    }));
  }

  // Teams: Casper+Alice blue, Bob+Cleo red
  players['Casper'].emit('set_team', { team: 'blue' });
  players['Alice'].emit('set_team', { team: 'blue' });
  players['Bob'].emit('set_team', { team: 'red' });
  players['Cleo'].emit('set_team', { team: 'red' });
  await wait(300);

  // Non-host start should fail silently; host start should work
  players['Bob'].emit('start_game');
  await wait(200);
  if (states['Bob'].game) throw new Error('non-host was able to start the game!');
  players['Casper'].emit('start_game');
  await wait(300);
  if (!states['Casper'].game || states['Casper'].game.phase !== 'clue') throw new Error('game did not start');
  console.log('game started, active team:', states['Casper'].game.activeTeam);

  // Redaction check: only psychic should see target during clue phase
  for (const n of names) {
    const g = states[n].game;
    const isPsychic = g.psychicId === states[n].you;
    if (isPsychic && g.target === null) throw new Error('psychic cannot see target');
    if (!isPsychic && g.target !== null) throw new Error(`${n} can see the target but is not psychic!`);
  }
  console.log('target redaction OK');

  const byId = id => names.find(n => states[n].you === id);

  let rounds = 0;
  while (rounds < 60) {
    rounds++;
    const g = states['Casper'].game;
    const psychicName = byId(g.psychicId);
    const active = g.activeTeam;
    const teamOf = n => states[n].players.find(p => p.id === states[n].you).team;
    const guesser = names.find(n => teamOf(n) === active && n !== psychicName);
    const counterer = names.find(n => teamOf(n) !== active);

    // clue
    players[psychicName].emit('action', { type: 'clue', clue: `clue round ${g.round}` });
    await wait(200);

    // guesser moves dial near-ish the target (they can't see it, but we can via psychic's state)
    const target = states[psychicName].game.target;
    const guessPos = Math.max(0, Math.min(100, target + (Math.random() * 20 - 10)));
    players[guesser].emit('dial', { pos: guessPos });
    await wait(150);
    players[guesser].emit('action', { type: 'lock' });
    await wait(250);

    let phase = states['Casper'].game.phase;
    if (phase === 'counter') {
      players[counterer].emit('action', { type: 'counter', dir: Math.random() < 0.5 ? 'left' : 'right' });
      await wait(250);
      phase = states['Casper'].game.phase;
    }

    const g2 = states['Casper'].game;
    if (phase === 'gameover') {
      console.log(`GAME OVER after ${rounds} rounds — winner: ${g2.winner}, score ${g2.scores.blue}-${g2.scores.red}`);
      if (g2.scores[g2.winner] < g2.winScore) throw new Error('winner below win score');
      break;
    }
    if (phase !== 'reveal') throw new Error('expected reveal/gameover, got ' + phase);
    if (!g2.result) throw new Error('no result at reveal');
    const d = Math.abs(g2.result.target - g2.dialPos);
    const expected = d <= 4 ? 4 : d <= 8 ? 3 : d <= 12 ? 2 : 0;
    if (g2.result.guessPts !== expected) throw new Error(`scoring wrong: d=${d} got ${g2.result.guessPts} expected ${expected}`);

    players[guesser].emit('action', { type: 'next' });
    await wait(250);
  }

  // Reconnection test: Alice drops and rejoins by name
  players['Alice'].disconnect();
  await wait(300);
  const alice2 = connect();
  await wait(200);
  const rj = await new Promise(res => alice2.emit('join_room', { code, name: 'Alice' }, res));
  if (rj.error) throw new Error('rejoin failed: ' + rj.error);
  console.log('reconnect-by-name OK');

  console.log('\nALL TESTS PASSED');
  server.kill();
  process.exit(0);
}

main().catch(e => { console.error('TEST FAILED:', e.message); process.exit(1); });
