// End-to-end test: spawns the server and simulates full games in both modes.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { io } = require('socket.io-client');

const PORT = 3456;
const URL = `http://localhost:${PORT}`;

function connect() { return io(URL, { transports: ['websocket'] }); }
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function teamsGame(players, states, names) {
  const code = await new Promise(res =>
    players[names[0]].emit('create_room', { name: names[0] }, r => res(r.code)));
  console.log('teams room:', code);
  for (const n of names.slice(1)) {
    await new Promise((res, rej) => players[n].emit('join_room', { code, name: n }, r => r.error ? rej(new Error(r.error)) : res()));
  }
  players[names[0]].emit('set_team', { team: 'blue' });
  players[names[1]].emit('set_team', { team: 'blue' });
  players[names[2]].emit('set_team', { team: 'red' });
  players[names[3]].emit('set_team', { team: 'red' });
  await wait(300);
  players[names[0]].emit('start_game');
  await wait(300);
  assert(states[names[0]].game && states[names[0]].game.phase === 'clue', 'teams game did not start');

  const byId = id => names.find(n => states[n].you === id);
  const teamOf = n => states[n].players.find(p => p.id === states[n].you).team;

  {
    const g = states[names[0]].game;
    const psychic = byId(g.psychicId);
    const t1 = states[psychic].game.target;
    players[psychic].emit('action', { type: 'reroll_target' });
    await wait(200);
    const t2 = states[psychic].game.target;
    assert(states[psychic].game.rerolls.target === true, 'reroll flag not set');
    players[psychic].emit('action', { type: 'reroll_target' });
    await wait(200);
    assert(states[psychic].game.target === t2, 'second target reroll should be rejected');
    const c1 = states[psychic].game.card.join('|');
    players[psychic].emit('action', { type: 'reroll_card' });
    await wait(200);
    assert(states[psychic].game.card.join('|') !== c1, 'card reroll did not change card');
    players[psychic].emit('action', { type: 'reroll_card' });
    await wait(200);
    console.log(`rerolls OK (target ${t1}->${t2}, second rejected)`);
  }

  let tieTested = false;
  let rounds = 0;
  while (rounds < 80) {
    rounds++;
    const g = states[names[0]].game;
    const psychicName = byId(g.psychicId);
    const active = g.activeTeam;
    const guesser = names.find(n => teamOf(n) === active && n !== psychicName);
    const counterers = names.filter(n => teamOf(n) !== active);

    players[psychicName].emit('action', { type: 'clue', clue: `clue ${g.round}` });
    await wait(200);

    const target = states[psychicName].game.target;
    const guessPos = Math.max(0, Math.min(100, target + (Math.random() * 20 - 10)));
    players[guesser].emit('dial', { pos: guessPos });
    await wait(150);
    players[guesser].emit('action', { type: 'lock' });
    await wait(250);

    let phase = states[names[0]].game.phase;
    if (phase === 'counter') {
      if (!tieTested) {
        players[counterers[0]].emit('action', { type: 'counter', dir: 'left' });
        players[counterers[1]].emit('action', { type: 'counter', dir: 'right' });
        await wait(300);
        const gg = states[counterers[0]].game;
        assert(gg.phase === 'counter', 'tie should stay in counter phase');
        assert(gg.counterTie === true, 'counterTie flag missing after 50/50');
        assert(gg.votesIn === 0, 'votes should reset after tie');
        console.log('tie -> revote OK');
        tieTested = true;
      }
      const dir = Math.random() < 0.5 ? 'left' : 'right';
      players[counterers[0]].emit('action', { type: 'counter', dir });
      await wait(150);
      assert(states[names[0]].game.phase === 'counter', 'should wait for all votes');
      players[counterers[1]].emit('action', { type: 'counter', dir });
      await wait(250);
      phase = states[names[0]].game.phase;
    }

    const g2 = states[names[0]].game;
    if (phase === 'gameover') {
      console.log(`teams GAME OVER after ${rounds} rounds — ${g2.winner} wins ${g2.scores.blue}-${g2.scores.red}`);
      break;
    }
    assert(phase === 'reveal', 'expected reveal/gameover, got ' + phase);
    const d = Math.abs(g2.result.target - g2.dialPos);
    const expected = d <= 4 ? 4 : d <= 8 ? 3 : d <= 12 ? 2 : 0;
    assert(g2.result.guessPts === expected, `scoring wrong: d=${d} got ${g2.result.guessPts}`);
    players[guesser].emit('action', { type: 'next' });
    await wait(250);
  }
  assert(states[names[0]].game.phase === 'gameover', 'teams game never finished');
}

async function coopGame(players, states, trio) {
  const code = await new Promise(res =>
    players[trio[0]].emit('create_room', { name: trio[0] }, r => res(r.code)));
  console.log('coop room:', code);
  for (const n of trio.slice(1)) {
    await new Promise((res, rej) => players[n].emit('join_room', { code, name: n }, r => r.error ? rej(new Error(r.error)) : res()));
  }
  players[trio[0]].emit('set_mode', { mode: 'coop' });
  players[trio[0]].emit('set_rounds', { rounds: 10 });
  players[trio[0]].emit('set_team_name', { name: 'Testtelepaterne' });
  await wait(300);
  assert(states[trio[0]].mode === 'coop', 'mode not set');
  assert(states[trio[1]].coopRounds === 10, 'rounds not synced');
  assert(states[trio[2]].teamName === 'Testtelepaterne', 'team name not synced');

  players[trio[0]].emit('start_game');
  await wait(300);
  let g = states[trio[0]].game;
  assert(g && g.phase === 'clue' && g.mode === 'coop' && g.totalRounds === 10, 'coop game did not start correctly');

  const byId = id => trio.find(n => states[n].you === id);
  const psychicsSeen = new Set();

  for (let r = 1; r <= 10; r++) {
    g = states[trio[0]].game;
    assert(g.round === r, `expected round ${r}, got ${g.round}`);
    const psychicName = byId(g.psychicId);
    psychicsSeen.add(psychicName);
    const guesser = trio.find(n => n !== psychicName);
    players[psychicName].emit('action', { type: 'clue', clue: `coop clue ${r}` });
    await wait(200);
    const target = states[psychicName].game.target;
    players[guesser].emit('dial', { pos: Math.max(0, Math.min(100, target + (Math.random() * 12 - 6))) });
    await wait(150);
    players[guesser].emit('action', { type: 'lock' });
    await wait(250);
    g = states[trio[0]].game;
    if (r < 10) {
      assert(g.phase === 'reveal', `round ${r}: expected reveal, got ` + g.phase);
      players[guesser].emit('action', { type: 'next' });
      await wait(250);
    }
  }
  g = states[trio[0]].game;
  assert(g.phase === 'gameover', 'coop should end after 10 rounds, got ' + g.phase);
  assert(g.scores.total > 0, 'coop total should be > 0');
  assert(psychicsSeen.size === 3, 'psychic should rotate through all players');
  assert(typeof g.lbRank === 'number' && g.lbRank >= 1, 'leaderboard rank missing');
  console.log(`coop GAME OVER — ${g.scores.total}/40, leaderboard rank #${g.lbRank}`);

  const res = await fetch(`${URL}/leaderboard?rounds=10`).then(r => r.json());
  assert(res.top.some(e => e.name === 'Testtelepaterne' && e.score === g.scores.total), 'leaderboard entry missing');
  console.log('leaderboard endpoint OK');
}

async function main() {
  try { fs.unlinkSync(path.join(__dirname, '..', 'leaderboard.json')); } catch {}
  const server = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT, TUNNEL: 'off' }, stdio: 'pipe',
  });
  await wait(1000);

  const names = ['Casper', 'Alice', 'Bob', 'Cleo'];
  const players = {}, states = {};
  for (const n of names) {
    players[n] = connect();
    players[n].on('state', s => { states[n] = s; });
  }
  await wait(300);

  const which = process.argv[2] || 'all';
  if (which === 'all' || which === 'teams') await teamsGame(players, states, names);

  for (const n of names) players[n].disconnect();
  await wait(200);
  const names2 = ['Xerxes', 'Ylva', 'Zed'];
  for (const n of names2) {
    players[n] = connect();
    players[n].on('state', s => { states[n] = s; });
  }
  await wait(300);
  if (which === 'all' || which === 'coop') await coopGame(players, states, names2);

  console.log('\nALL TESTS PASSED');
  server.kill();
  process.exit(0);
}

main().catch(e => { console.error('TEST FAILED:', e.message); process.exit(1); });
