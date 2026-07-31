// End-to-end tests for Wavelength (phase-based) + room/reconnect behaviour.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { io } = require('socket.io-client');

const PORT = 3456;
const URL = `http://localhost:${PORT}`;
const connect = () => io(URL, { transports: ['websocket'] });
const wait = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error(m); };

async function room(names, setup) {
  const players = {}, states = {};
  for (const n of names) {
    players[n] = connect();
    players[n].on('state', s => { states[n] = s; });
  }
  await wait(300);
  const code = await new Promise(res => players[names[0]].emit('create_room', { name: names[0] }, r => res(r.code)));
  for (const n of names.slice(1)) {
    await new Promise((res, rej) => players[n].emit('join_room', { code, name: n }, r => r.error ? rej(new Error(r.error)) : res()));
  }
  await wait(250);
  if (setup) await setup(players, states, code);
  return { players, states, code };
}
const byId = (states, names, id) => names.find(n => states[n].you === id);

// everyone writes all their clues
async function writeAll(players, states, names) {
  for (const n of names) {
    const list = states[n].game.yourPrompts;
    for (let i = 0; i < list.length; i++) {
      players[n].emit('action', { type: 'clue', idx: i, clue: `${n}-clue-${i}` });
      await wait(80);
    }
  }
  await wait(300);
}

async function testTeams() {
  const names = ['Casper', 'Alice', 'Bob', 'Cleo'];
  const { players, states } = await room(names, async (pl) => {
    pl.Casper.emit('set_team', { team: 'blue' });
    pl.Alice.emit('set_team', { team: 'blue' });
    pl.Bob.emit('set_team', { team: 'red' });
    pl.Cleo.emit('set_team', { team: 'red' });
    await wait(200);
    pl.Casper.emit('set_prompts', { prompts: 3 });
    await wait(200);
  });
  players.Casper.emit('start_game');
  await wait(400);
  let g = states.Casper.game;
  assert(g && g.phase === 'write', 'should start in write phase, got ' + (g && g.phase));
  assert(g.yourPrompts.length === 3, 'each player writes 3, got ' + g.yourPrompts.length);
  assert(g.yourPrompts.every(p => typeof p.target === 'number'), 'writer sees own targets');

  // reroll changes the target and clears the clue
  players.Casper.emit('action', { type: 'clue', idx: 0, clue: 'temp' });
  await wait(150);
  const t0 = states.Casper.game.yourPrompts[0].target;
  players.Casper.emit('action', { type: 'reroll_target', idx: 0 });
  await wait(200);
  assert(states.Casper.game.yourPrompts[0].target !== t0 || states.Casper.game.yourPrompts[0].clue === null, 'reroll changed target');
  assert(states.Casper.game.yourPrompts[0].clue === null, 'reroll clears the stale clue');
  console.log('teams: write phase + per-prompt rerolls OK');

  await writeAll(players, states, names);
  g = states.Casper.game;
  assert(g.phase === 'guess', 'all clues in -> guess phase, got ' + g.phase);
  assert(g.promptTotal === 12, 'queue = 4 players x 3, got ' + g.promptTotal);
  // nobody but the writer knows the target
  for (const n of names) {
    const v = states[n].game;
    if (v.writerId === states[n].you) assert(v.target !== null, 'writer sees target');
    else assert(v.target === null, n + ' must not see the target');
  }
  console.log('teams: queue built, targets hidden');

  let tieTested = false, guard = 0;
  const writersSeen = [];
  while (states.Casper.game.phase !== 'gameover' && guard++ < 200) {
    g = states.Casper.game;
    const writer = byId(states, names, g.writerId);
    const teamOf = n => states[n].players.find(p => p.id === states[n].you).team;
    const guesser = names.find(n => n !== writer && teamOf(n) === teamOf(writer));
    const counterers = names.filter(n => teamOf(n) !== teamOf(writer));

    if (g.phase === 'guess') {
      assert(states[writer].game.youCanGuess === false, 'writer cannot guess own clue');
      const teamGuessers = names.filter(n => n !== writer && teamOf(n) === teamOf(writer));
      assert(g.locksNeeded === teamGuessers.length, `locksNeeded should equal team guessers (${teamGuessers.length}), got ${g.locksNeeded}`);
      players[guesser].emit('dial', { pos: 20 + Math.random() * 60 });
      await wait(120);
      players[guesser].emit('action', { type: 'lock' });
      await wait(200);
    } else if (g.phase === 'counter') {
      if (!tieTested) {
        players[counterers[0]].emit('action', { type: 'counter', dir: 'left' });
        players[counterers[1]].emit('action', { type: 'counter', dir: 'right' });
        await wait(300);
        assert(states.Casper.game.phase === 'counter' && states.Casper.game.counterTie, 'tie -> revote');
        tieTested = true;
        console.log('teams: counter tie revote OK');
      }
      const dir = Math.random() < 0.5 ? 'left' : 'right';
      players[counterers[0]].emit('action', { type: 'counter', dir });
      await wait(120);
      players[counterers[1]].emit('action', { type: 'counter', dir });
      await wait(200);
    } else if (g.phase === 'reveal') {
      writersSeen.push(writer);
      players[names.find(n => n !== writer)].emit('action', { type: 'next' });
      await wait(250);
    }
  }
  g = states.Casper.game;
  assert(g.phase === 'gameover', 'game should finish, guard=' + guard);
  assert(['blue', 'red', 'draw'].includes(g.winner), 'winner decided: ' + g.winner);
  assert(g.promptNum > g.promptTotal || g.qi === undefined, 'all prompts played');
  // rotation: the same person must never write two prompts in a row
  const repeats = writersSeen.filter((w, i) => i > 0 && w === writersSeen[i - 1]);
  assert(repeats.length === 0, 'writers must rotate, got ' + writersSeen.join(','));
  // and teams must alternate
  const teamSeq = writersSeen.map(n => states[n].players.find(p => p.id === states[n].you).team);
  assert(!teamSeq.some((t, i) => i > 0 && t === teamSeq[i - 1]), 'teams must alternate: ' + teamSeq.join(','));
  console.log('teams: writer rotation + team alternation OK (' + writersSeen.join(' → ') + ')');
  console.log(`teams: full game OK — ${g.scores.blue}-${g.scores.red}, winner ${g.winner}`);
  Object.values(players).forEach(p => p.disconnect());
}

async function testCoop() {
  const names = ['X', 'Y', 'Z'];
  const { players, states } = await room(names, async (pl) => {
    pl.X.emit('set_mode', { mode: 'coop' });
    pl.X.emit('set_prompts', { prompts: 3 });
    pl.X.emit('set_team_name', { name: 'Testtelepaterne' });
    await wait(250);
  });
  assert(states.Y.promptsEach === 3, 'prompts synced to everyone');
  assert(states.Z.teamName === 'Testtelepaterne', 'team name synced');
  players.X.emit('start_game');
  await wait(400);
  let g = states.X.game;
  assert(g.phase === 'write' && g.mode === 'coop', 'coop starts in write');
  await writeAll(players, states, names);
  g = states.X.game;
  assert(g.phase === 'guess' && g.promptTotal === 9, 'coop queue = 9, got ' + g.promptTotal);

  let guard = 0, resetTested = false;
  const coopWriters = [];
  while (states.X.game.phase !== 'gameover' && guard++ < 100) {
    g = states.X.game;
    const writer = byId(states, names, g.writerId);
    const others = names.filter(n => n !== writer);
    if (g.phase === 'guess') {
      assert(g.locksNeeded === 2, 'coop: both non-writers must lock, got ' + g.locksNeeded);
      const target = states[writer].game.target;
      players[others[0]].emit('dial', { pos: Math.max(0, Math.min(100, target + (Math.random() * 6 - 3))) });
      await wait(120);
      players[others[0]].emit('action', { type: 'lock' });
      await wait(200);
      assert(states.X.game.phase === 'guess', 'one lock must not resolve the guess');
      assert(states.X.game.locksIn === 1, 'locksIn should be 1, got ' + states.X.game.locksIn);
      if (!resetTested) {
        // someone nudges the dial -> every lock clears
        players[others[1]].emit('dial', { pos: 55 });
        await wait(250);
        assert(states.X.game.locksIn === 0, 'moving the dial must clear locks, got ' + states.X.game.locksIn);
        players[others[0]].emit('action', { type: 'lock' });
        await wait(150);
        resetTested = true;
        console.log('coop: dial move clears locks OK');
      }
      players[others[1]].emit('action', { type: 'lock' });
      await wait(250);
    } else if (g.phase === 'reveal') {
      coopWriters.push(writer);
      players[others[0]].emit('action', { type: 'next' });
      await wait(200);
    }
  }
  g = states.X.game;
  assert(g.phase === 'gameover', 'coop finished');
  assert(g.maxScore === 36, 'max = 9 prompts x 4, got ' + g.maxScore);
  assert(g.scores.total > 0, 'scored something');
  assert(typeof g.lbRank === 'number', 'leaderboard rank recorded');
  const lb = await fetch(`${URL}/leaderboard?prompts=3`).then(r => r.json());
  assert(lb.top.some(e => e.name === 'Testtelepaterne'), 'leaderboard entry saved');
  assert(!coopWriters.some((w, i) => i > 0 && w === coopWriters[i - 1]), 'coop writers rotate: ' + coopWriters.join(','));
  assert(coopWriters.slice(0, 3).join(',') === coopWriters.slice(3, 6).join(','), 'rotation repeats in the same order: ' + coopWriters.join(','));
  console.log('coop: writer rotation OK (' + coopWriters.join(' → ') + ')');
  console.log(`coop: full game OK — ${g.scores.total}/${g.maxScore}, rank #${g.lbRank}, leaderboard OK`);
  Object.values(players).forEach(p => p.disconnect());
}

async function testRoom() {
  const names = ['H', 'J'];
  const { players, states, code } = await room(names);
  assert(states.J.code === code, 'joined the room');
  players.H.emit('leave_room', () => {});
  await wait(300);
  assert(states.J.hostId === states.J.you, 'host handover on leave');
  // reconnect by name
  players.J.disconnect();
  await wait(200);
  const j2 = connect();
  await wait(200);
  const res = await new Promise(r => j2.emit('join_room', { code, name: 'J' }, r));
  assert(!res.error, 'rejoin by name works: ' + JSON.stringify(res));
  console.log('rooms: leave + host handover + rejoin OK');
  j2.disconnect();
}

async function main() {
  try { fs.unlinkSync(path.join(__dirname, '..', 'leaderboard.json')); } catch {}
  const server = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT, TUNNEL: 'off' }, stdio: 'pipe',
  });
  let serr = '';
  server.stderr.on('data', d => serr += d);
  await wait(1000);
  const only = process.argv[2];
  try {
    if (!only || only === 'teams') await testTeams();
    if (!only || only === 'coop') await testCoop();
    if (!only || only === 'room') await testRoom();
    console.log('\nALL TESTS PASSED');
  } catch (e) {
    console.error('TEST FAILED:', e.message);
    if (serr) console.error('server stderr:', serr.slice(-600));
    server.kill();
    process.exit(1);
  }
  server.kill();
  process.exit(0);
}
main();
