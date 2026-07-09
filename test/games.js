// Simulation tests for the newer games. Usage: node test/games.js [game]
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3457;
const URL = `http://localhost:${PORT}`;
const connect = () => io(URL, { transports: ['websocket'] });
const wait = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error(m); };

async function setup(n, game) {
  const names = ['P1', 'P2', 'P3', 'P4'].slice(0, n);
  const players = {}, states = {};
  for (const nm of names) {
    players[nm] = connect();
    players[nm].on('state', s => { states[nm] = s; });
  }
  await wait(300);
  const code = await new Promise(res => players[names[0]].emit('create_room', { name: names[0] }, r => res(r.code)));
  for (const nm of names.slice(1)) {
    await new Promise((res, rej) => players[nm].emit('join_room', { code, name: nm }, r => r.error ? rej(new Error(r.error)) : res()));
  }
  players[names[0]].emit('set_game', { game });
  await wait(200);
  return { names, players, states, code };
}
const byId = (states, names, id) => names.find(n => states[n].you === id);

async function testTheMind() {
  const { names, players, states } = await setup(2, 'themind');
  players[names[0]].emit('start_game');
  await wait(300);
  let g = states[names[0]].game;
  assert(g && g.phase === 'playing' && g.level === 1, 'themind did not start');
  // play everything in the correct global order using both hands
  let safety = 0;
  while (states[names[0]].game.phase === 'playing' && safety++ < 200) {
    const hands = names.map(n => ({ n, hand: states[n].game.hand }));
    const holder = hands.filter(h => h.hand.length).sort((a, b) => a.hand[0] - b.hand[0])[0];
    players[holder.n].emit('action', { type: 'play', card: holder.hand[0] });
    await wait(120);
  }
  g = states[names[0]].game;
  assert(g.phase === 'win', 'perfect play should win, got ' + g.phase);
  assert(g.lives === 2 + 1, 'no lives should be lost (plus bonus)');
  console.log(`themind: perfect run wins all ${g.levelsTotal} levels OK`);
  // rematch and force a mistake
  players[names[0]].emit('action', { type: 'rematch' });
  await wait(300);
  const hands = names.map(n => ({ n, hand: states[n].game.hand }));
  const high = hands.sort((a, b) => b.hand[0] - a.hand[0])[0]; // play the HIGHER card first
  const low = hands[1];
  if (high.hand[0] > low.hand[0]) {
    players[high.n].emit('action', { type: 'play', card: high.hand[0] });
    await wait(200);
    const g2 = states[names[0]].game;
    assert(g2.lives === 1, 'mistake should cost a life, lives=' + g2.lives);
    console.log('themind: mistake detection OK');
  } else console.log('themind: (equal split, skip mistake check)');
  Object.values(players).forEach(p => p.disconnect());
}

async function testSpyfall() {
  const { names, players, states } = await setup(3, 'spyfall');
  players[names[0]].emit('start_game');
  await wait(300);
  const spy = names.find(n => states[n].game.isSpy);
  const others = names.filter(n => n !== spy);
  assert(spy && states[others[0]].game.location, 'roles not dealt');
  assert(!states[spy].game.location, 'spy must not see location');
  // vote out an innocent -> spy wins
  players[others[0]].emit('action', { type: 'accuse', pid: states[others[1]].you });
  await wait(200);
  players[spy].emit('action', { type: 'vote', yes: true });
  await wait(300);
  let g = states[names[0]].game;
  assert(g.phase === 'reveal' && g.winner === 'spy', 'innocent voted out should mean spy wins, got ' + g.winner);
  console.log('spyfall: vote flow OK');
  // rematch: spy guesses correctly
  players[names[0]].emit('action', { type: 'rematch' });
  await wait(300);
  const spy2 = names.find(n => states[n].game.isSpy);
  const loc = states[names.find(n => n !== spy2)].game.location;
  players[spy2].emit('action', { type: 'spy_guess', location: loc });
  await wait(200);
  g = states[names[0]].game;
  assert(g.winner === 'spy', 'correct guess should win for spy');
  console.log('spyfall: spy guess OK');
  Object.values(players).forEach(p => p.disconnect());
}

async function testLoveLetter() {
  const { names, players, states } = await setup(2, 'loveletter');
  players[names[0]].emit('start_game');
  await wait(300);
  let safety = 0;
  while (safety++ < 400) {
    const g = states[names[0]].game;
    if (g.phase === 'gameover') break;
    if (g.phase === 'roundend') { players[names[0]].emit('action', { type: 'next' }); await wait(150); continue; }
    if (g.phase === 'chancellor') {
      const who = byId(states, names, g.chancWho);
      players[who].emit('action', { type: 'chancellor_keep', card: states[who].game.chancYou[0] });
      await wait(150); continue;
    }
    const cur = byId(states, names, g.current);
    const mg = states[cur].game;
    const hand = mg.hand;
    // pick a legal card: prefer non-princess; countess rule (8 with 5/7)
    let card;
    if (hand.includes(8) && (hand.includes(5) || hand.includes(7))) card = 8;
    else card = hand.find(c => c !== 9) ?? hand[0];
    const msg = { type: 'play', card };
    if ([1, 2, 3, 7].includes(card) && mg.targetable.length) msg.target = mg.targetable[0];
    if (card === 5) msg.target = mg.targetable[0] || states[cur].you;
    if (card === 1) msg.guess = 5;
    players[cur].emit('action', msg);
    await wait(120);
  }
  const g = states[names[0]].game;
  assert(g.phase === 'gameover', 'loveletter never finished (safety=' + safety + ')');
  assert(g.tokens[g.winner] >= g.tokensToWin, 'winner lacks tokens');
  console.log(`loveletter: full game OK (${safety} steps, winner ${byId(states, names, g.winner)})`);
  Object.values(players).forEach(p => p.disconnect());
}

async function testCoup() {
  const { names, players, states } = await setup(3, 'coup');
  players[names[0]].emit('start_game');
  await wait(300);
  let safety = 0;
  while (safety++ < 300) {
    const g = states[names[0]].game;
    if (g.phase === 'gameover') break;
    if (g.phase === 'turn') {
      const cur = byId(states, names, g.current);
      const mg = states[cur].game;
      const targets = mg.order.filter(id => mg.counts[id] > 0 && id !== states[cur].you);
      if (mg.coins[states[cur].you] >= 7) players[cur].emit('action', { type: 'act', act: 'coup', target: targets[0] });
      else players[cur].emit('action', { type: 'act', act: 'income' });
    } else if (g.phase === 'lose') {
      const who = byId(states, names, g.losePick);
      players[who].emit('action', { type: 'lose_pick', role: states[who].game.yourCards[0] });
    } else if (g.phase === 'reaction' || g.phase === 'block_reaction') {
      for (const n of names) {
        const mg = states[n].game;
        const p = mg.pending;
        if (!p) continue;
        players[n].emit('action', { type: 'pass' });
      }
    }
    await wait(150);
  }
  let g = states[names[0]].game;
  assert(g.phase === 'gameover', 'coup never finished');
  console.log(`coup: income/coup game OK (winner ${byId(states, names, g.winner)})`);
  // test a challenge: rematch, current claims tax, next challenges
  players[names[0]].emit('action', { type: 'rematch' });
  await wait(300);
  g = states[names[0]].game;
  const cur = byId(states, names, g.current);
  players[cur].emit('action', { type: 'act', act: 'tax' });
  await wait(200);
  const challenger = names.find(n => n !== cur);
  players[challenger].emit('action', { type: 'challenge' });
  await wait(300);
  g = states[names[0]].game;
  const cards = names.reduce((sum, n) => sum + states[n].game.yourCards.length, 0);
  assert(cards === 5 || g.phase === 'lose', 'challenge should cost someone a card (or be pending pick)');
  console.log('coup: challenge flow OK');
  Object.values(players).forEach(p => p.disconnect());
}

async function testCodenames() {
  const { names, players, states } = await setup(4, 'codenames');
  players[names[0]].emit('set_team', { team: 'blue' });
  players[names[1]].emit('set_team', { team: 'blue' });
  players[names[2]].emit('set_team', { team: 'red' });
  players[names[3]].emit('set_team', { team: 'red' });
  await wait(300);
  players[names[0]].emit('start_game');
  await wait(300);
  let g = states[names[0]].game;
  assert(g && g.phase === 'clue', 'codenames did not start');
  const smBlue = byId(states, names, g.spymasters.blue);
  const smRed = byId(states, names, g.spymasters.red);
  assert(states[smBlue].game.key, 'spymaster must see key');
  const guesserOf = t => names.find(n => states[n].players.find(p => p.id === states[n].you).team === t && n !== smBlue && n !== smRed);
  let safety = 0;
  while (states[names[0]].game.phase !== 'gameover' && safety++ < 60) {
    g = states[names[0]].game;
    const t = g.turn;
    const sm = t === 'blue' ? smBlue : smRed;
    if (g.phase === 'clue') {
      players[sm].emit('action', { type: 'clue', word: 'test', num: 3 });
    } else {
      const key = states[sm].game.key;
      const idx = key.findIndex((k, i) => k === t && !states[sm].game.revealed[i]);
      players[guesserOf(t)].emit('action', { type: 'pick', i: idx });
    }
    await wait(120);
  }
  g = states[names[0]].game;
  assert(g.phase === 'gameover' && g.winner, 'codenames never finished');
  console.log(`codenames: perfect-information game OK (${g.winner} wins, ${g.reason})`);
  Object.values(players).forEach(p => p.disconnect());
}

async function testHanabi() {
  const { names, players, states } = await setup(2, 'hanabi');
  players[names[0]].emit('start_game');
  await wait(300);
  let g = states[names[0]].game;
  assert(g && g.phase === 'playing', 'hanabi did not start');
  // check redaction: own cards hidden unless hinted
  assert(g.hands[states[names[0]].you].every(c => c.color === null && c.value === null), 'own cards must be hidden');
  // hint flow
  const cur = byId(states, names, g.current);
  const other = names.find(n => n !== cur);
  const otherId = states[cur].you === states[names[0]].you ? states[names[1]].you : states[names[0]].you;
  const visible = states[cur].game.hands[otherId];
  players[cur].emit('action', { type: 'hint', pid: otherId, value: visible[0].value });
  await wait(200);
  g = states[names[0]].game;
  assert(g.clues === 7, 'hint should cost a clue');
  assert(states[other].game.hands[otherId].some(c => c.hintValue), 'hint should mark cards');
  console.log('hanabi: hint + redaction OK');
  // random play until gameover
  let safety = 0;
  while (states[names[0]].game.phase === 'playing' && safety++ < 300) {
    const c = byId(states, names, states[names[0]].game.current);
    players[c].emit('action', { type: 'play', i: 0 });
    await wait(100);
  }
  g = states[names[0]].game;
  assert(g.phase === 'gameover', 'hanabi never ended');
  assert(typeof g.score === 'number', 'score missing');
  console.log(`hanabi: game completes OK (score ${g.score}/25 — ${g.reason})`);
  Object.values(players).forEach(p => p.disconnect());
}

async function testWerewolf() {
  const { names, players, states } = await setup(4, 'werewolf');
  players[names[0]].emit('start_game');
  await wait(500);
  let g = states[names[0]].game;
  assert(g && g.phase === 'night', 'werewolf did not start');
  assert(g.startRole, 'no role dealt');
  // night: whenever someone has a turn, act (prefer skip; troublemaker needs 2 picks)
  let safety = 0;
  while (states[names[0]].game.phase === 'night' && safety++ < 100) {
    for (const n of names) {
      const mg = states[n].game;
      if (mg.yourTurn) {
        if (mg.turnRole === 'troublemaker') {
          const others = mg.order.filter(id => id !== states[n].you);
          players[n].emit('action', { type: 'trouble', a: others[0], b: others[1] });
        } else if (mg.turnRole === 'seer') {
          players[n].emit('action', { type: 'seer_center' });
        } else {
          players[n].emit('action', { type: 'skip_night' });
        }
      }
    }
    await wait(200);
  }
  g = states[names[0]].game;
  assert(g.phase === 'day', 'night should end in day, got ' + g.phase + ' after ' + safety);
  players[names[0]].emit('action', { type: 'call_vote' }); // host
  await wait(200);
  assert(states[names[0]].game.phase === 'vote', 'vote should start');
  for (const n of names) {
    const target = states[n].game.order.find(id => id !== states[n].you);
    players[n].emit('action', { type: 'vote', pid: target });
    await wait(100);
  }
  await wait(300);
  g = states[names[0]].game;
  assert(g.phase === 'reveal', 'should reveal after all votes');
  assert(g.winner === 'village' || g.winner === 'werewolves', 'winner missing');
  assert(g.cards && g.center && g.center.length === 3, 'reveal data missing');
  // sanity: card multiset preserved
  const all = [...Object.values(g.cards), ...g.center].sort().join(',');
  const orig = [...Object.values(g.startCards), ...g.center].sort().join(',');
  assert(all.split('werewolf').length === orig.split('werewolf').length, 'cards corrupted');
  console.log(`werewolf: full night+vote OK (winner: ${g.winner}${g.deaths.length ? ', deaths: ' + g.deaths.length : ', no deaths'})`);
  Object.values(players).forEach(p => p.disconnect());
}

async function testJustOne() {
  const { names, players, states } = await setup(3, 'justone');
  players[names[0]].emit('start_game');
  await wait(300);
  let g = states[names[0]].game;
  assert(g && g.phase === 'clue' && g.round === 1, 'justone did not start');
  const guesserOf = () => names.find(n => states[n].game.isGuesser);
  const writersOf = () => names.filter(n => !states[n].game.isGuesser);
  // round 1: duplicate clues cancel
  let writers = writersOf();
  for (const w of writers) players[w].emit('action', { type: 'clue', word: 'same' });
  await wait(300);
  g = states[guesserOf()].game;
  assert(g.phase === 'guess', 'should reach guess phase');
  assert(g.visibleClues.length === 0, 'duplicates should cancel, got ' + JSON.stringify(g.visibleClues));
  players[guesserOf()].emit('action', { type: 'pass' });
  await wait(200);
  players[names[0]].emit('action', { type: 'next' });
  await wait(200);
  // remaining rounds: distinct clues, guesser answers correctly (word read from a writer's view)
  let safety = 0;
  while (states[names[0]].game.phase !== 'gameover' && safety++ < 60) {
    g = states[names[0]].game;
    if (g.phase === 'clue') {
      const ws = writersOf();
      ws.forEach((w, i) => players[w].emit('action', { type: 'clue', word: 'clue' + i + Math.random().toString(36).slice(2, 5) }));
    } else if (g.phase === 'guess') {
      const word = states[writersOf()[0]].game.word;
      players[guesserOf()].emit('action', { type: 'guess', word: word.toLowerCase() });
    } else if (g.phase === 'result') {
      players[names[0]].emit('action', { type: 'next' });
    }
    await wait(200);
  }
  g = states[names[0]].game;
  assert(g.phase === 'gameover', 'justone never finished');
  assert(g.score === 12, 'expected 12/13 (one pass), got ' + g.score);
  console.log(`justone: 13 rounds OK, duplicates cancel, score ${g.score}/13`);
  Object.values(players).forEach(p => p.disconnect());
}

async function testResistance() {
  const names5 = ['P1', 'P2', 'P3', 'P4', 'P5'];
  const players = {}, states = {};
  for (const nm of names5) {
    players[nm] = connect();
    players[nm].on('state', s => { states[nm] = s; });
  }
  await wait(300);
  const code = await new Promise(res => players.P1.emit('create_room', { name: 'P1' }, r => res(r.code)));
  for (const nm of names5.slice(1)) {
    await new Promise((res, rej) => players[nm].emit('join_room', { code, name: nm }, r => r.error ? rej(new Error(r.error)) : res()));
  }
  players.P1.emit('set_game', { game: 'resistance' });
  await wait(200);
  players.P1.emit('start_game');
  await wait(300);
  let g = states.P1.game;
  assert(g && g.phase === 'propose', 'resistance did not start');
  const spies = names5.filter(n => states[n].game.role === 'spy');
  assert(spies.length === 2, 'expected 2 spies, got ' + spies.length);
  assert(states[spies[0]].game.spies.length === 2, 'spies should see each other');
  assert(!states[names5.find(n => !spies.includes(n))].game.spies, 'resistance must not see spies');

  // test one rejected vote
  let leaderN = names5.find(n => states[n].game.leader === states[n].you);
  players[leaderN].emit('action', { type: 'propose', team: names5.slice(0, 2).map(n => states.P1.game ? states[n].you : null) });
  await wait(250);
  for (const n of names5) players[n].emit('action', { type: 'vote', approve: false });
  await wait(300);
  g = states.P1.game;
  assert(g.phase === 'propose' && g.voteTrack === 1, 'reject should advance leader, track=' + g.voteTrack);
  console.log('resistance: reject flow OK');

  // now spies always fail, everyone approves -> spies win in 3 missions
  let safety = 0;
  while (states.P1.game.phase !== 'gameover' && safety++ < 60) {
    g = states.P1.game;
    if (g.phase === 'propose') {
      leaderN = names5.find(n => states[n].game.leader === states[n].you);
      const size = g.teamSizes[g.missionNum];
      // leader picks themself + spies first (guarantees a fail)
      const spyIds = spies.map(n => states[n].you);
      const rest = names5.map(n => states[n].you).filter(id => !spyIds.includes(id));
      const team = [...spyIds, ...rest].slice(0, size);
      players[leaderN].emit('action', { type: 'propose', team });
    } else if (g.phase === 'vote') {
      for (const n of names5) if (!states[n].game.youVoted) players[n].emit('action', { type: 'vote', approve: true });
    } else if (g.phase === 'mission') {
      for (const n of names5) {
        const mg = states[n].game;
        if (mg.onTeam && !mg.youPlayed) players[n].emit('action', { type: 'mission_play', success: mg.role !== 'spy' });
      }
    } else if (g.phase === 'result') {
      players.P1.emit('action', { type: 'next' });
    }
    await wait(200);
  }
  g = states.P1.game;
  assert(g.phase === 'gameover', 'resistance never finished');
  assert(g.winner === 'spies', 'spies always sabotaging should win, got ' + g.winner);
  assert(g.roles, 'roles should reveal at end');
  console.log('resistance: full game OK (spies win by sabotage)');
  Object.values(players).forEach(p => p.disconnect());
}

async function testUndercover() {
  const { names, players, states } = await setup(4, 'undercover'); // pad to 5 below
  // need 5 players for Mr. White — add one more socket
  const extra = 'P5';
  players[extra] = connect();
  players[extra].on('state', s => { states[extra] = s; });
  await wait(300);
  await new Promise((res, rej) => players[extra].emit('join_room', { code: states.P1.code, name: extra }, r => r.error ? rej(new Error(r.error)) : res()));
  const five = ['P1', 'P2', 'P3', 'P4', 'P5'];
  players.P1.emit('start_game');
  await wait(400);
  let g = states.P1.game;
  assert(g && g.phase === 'describe', 'undercover did not start');
  const white = five.find(n => states[n].game.isWhite);
  assert(white, 'no Mr. White with 5 players');
  const words = five.filter(n => n !== white).map(n => states[n].game.word);
  const civWord = words.sort((a, b) => words.filter(w => w === a).length - words.filter(w => w === b).length).pop();
  const ucName = five.find(n => n !== white && states[n].game.word !== civWord);
  assert(ucName, 'no undercover found');
  assert(states[white].game.word === null, 'white must have no word');

  const byId = id => five.find(n => states[n].you === id);
  async function describeAll() {
    let safety = 0;
    while (states.P1.game.phase === 'describe' && safety++ < 30) {
      const d = states.P1.game.describer;
      players[byId(d)].emit('action', { type: 'describe', text: 'hmm' });
      await wait(150);
    }
    assert(states.P1.game.phase === 'vote', 'expected vote phase');
  }
  async function voteAll(targetName) {
    const targetId = states[targetName].you;
    for (const n of five) {
      const mg = states[n].game;
      if (mg.alive[states[n].you] && !mg.youVoted && states[n].you !== targetId) {
        players[n].emit('action', { type: 'vote', pid: targetId });
        await wait(120);
      }
    }
    // target must also vote (someone else)
    const mg = states[targetName].game;
    if (mg.alive[targetId] && !mg.youVoted) {
      const other = five.find(n => n !== targetName && mg.alive[states[n].you]);
      players[targetName].emit('action', { type: 'vote', pid: states[other].you });
      await wait(200);
    }
    await wait(200);
  }
  // round 1: vote out Mr. White; he guesses WRONG
  await describeAll();
  await voteAll(white);
  g = states.P1.game;
  assert(g.phase === 'whiteguess', 'white should get a guess, got ' + g.phase);
  players[white].emit('action', { type: 'white_guess', word: 'definitely-wrong' });
  await wait(300);
  g = states.P1.game;
  assert(g.phase === 'describe', 'game should continue after wrong guess, got ' + g.phase);
  // round 2: vote out the undercover -> civilians win
  await describeAll();
  await voteAll(ucName);
  g = states.P1.game;
  assert(g.phase === 'gameover' && g.winner === 'civilians', 'civilians should win, got ' + g.winner + '/' + g.phase);
  assert(g.civWord && g.roles, 'reveal data missing');
  console.log(`undercover: white-guess + civilian win OK (word: ${g.civWord} vs ${g.ucWord})`);

  // rematch: eliminate white, guess CORRECTLY -> white wins
  players.P1.emit('action', { type: 'rematch' });
  await wait(400);
  const white2 = five.find(n => states[n].game.isWhite);
  const words2 = five.filter(n => n !== white2).map(n => states[n].game.word);
  const civ2 = words2.sort((a, b) => words2.filter(w => w === a).length - words2.filter(w => w === b).length).pop();
  await describeAll();
  await voteAll(white2);
  assert(states.P1.game.phase === 'whiteguess', 'white2 should guess');
  players[white2].emit('action', { type: 'white_guess', word: civ2 });
  await wait(300);
  g = states.P1.game;
  assert(g.winner === 'white', 'correct guess should win for white, got ' + g.winner);
  console.log('undercover: Mr. White steal-the-win OK');
  Object.values(players).forEach(p => p.disconnect());
}

const TESTS = { undercover: testUndercover, justone: testJustOne, resistance: testResistance, werewolf: testWerewolf, themind: testTheMind, spyfall: testSpyfall, loveletter: testLoveLetter, coup: testCoup, codenames: testCodenames, hanabi: testHanabi };

async function main() {
  const server = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT, TUNNEL: 'off' }, stdio: 'pipe',
  });
  let serr = '';
  server.stderr.on('data', d => serr += d);
  await wait(1000);
  const pick = process.argv[2];
  try {
    for (const [name, fn] of Object.entries(TESTS)) {
      if (pick && name !== pick) continue;
      await fn();
    }
    console.log('\nGAME TESTS PASSED');
  } catch (e) {
    console.error('TEST FAILED:', e.message);
    if (serr) console.error('server errors:', serr.slice(-500));
    server.kill();
    process.exit(1);
  }
  server.kill();
  process.exit(0);
}
main();
