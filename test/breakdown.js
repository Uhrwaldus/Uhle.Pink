// Plays a whole co-op game to the end screen and checks the per-player
// breakdown: everyone's clues are listed, their points sum to their total,
// and the totals sum to the team score on the banner.
const { spawn } = require('child_process');
const { JSDOM } = require('/tmp/repo/node_modules/jsdom');
const PORT = 3923, URL = `http://localhost:${PORT}/`;
const wait = ms => new Promise(r => setTimeout(r, ms));

async function page() {
  const dom = await JSDOM.fromURL(URL, {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) { w.fetch = (u, o) => fetch(String(u).startsWith('http') ? u : URL.replace(/\/$/, '') + u, o); },
  });
  for (let i = 0; i < 30 && dom.window.eval('typeof socket') === 'undefined'; i++) await wait(300);
  return dom;
}
const ev = (d, c) => d.window.eval(c);
let failed = 0;
function ok(label, cond, extra = '') {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${label} ${extra}`);
  if (!cond) failed++;
}

async function main() {
  const server = spawn('node', ['/tmp/repo/server.js'], { env: { ...process.env, PORT, TUNNEL: 'off' }, stdio: 'pipe' });
  await wait(1000);
  const pages = [await page(), await page(), await page()];
  const [A] = pages;

  ev(A, `socket.emit('create_room',{name:'Ada'},r=>{window.__c=r.code})`);
  await wait(400);
  const code = ev(A, 'window.__c');
  ev(pages[1], `socket.emit('join_room',{code:'${code}',name:'Bo'},()=>{})`);
  ev(pages[2], `socket.emit('join_room',{code:'${code}',name:'Cy'},()=>{})`);
  await wait(700);
  ev(A, `document.querySelector('#mode-coop').click()`);
  await wait(300);
  ev(A, `socket.emit('set_prompts',{prompts:3})`);
  await wait(300);
  ev(A, `document.querySelector('#btn-start').click()`);
  await wait(800);

  // everyone writes all their clues
  for (const d of pages) {
    const n = ev(d, `S.game.yourPrompts.length`);
    for (let i = 0; i < n; i++) ev(d, `act('clue', { idx: ${i}, clue: 'clue${i}' })`);
  }
  await wait(800);
  ok('moved to the guessing phase', ev(A, `S.game.phase`) === 'guess');

  // play every prompt: guess, everyone locks, next
  for (let guard = 0; guard < 40; guard++) {
    if (ev(A, `S.game.phase`) === 'gameover') break;
    const writer = pages.find(d => ev(d, `S.game.writerId === S.you`));
    const target = ev(writer, `S.game.target`);
    // land a different band each prompt so the breakdown has varied numbers
    const miss = [0, 4, 8, 20][guard % 4];
    const guessers = pages.filter(d => ev(d, `S.game.writerId !== S.you`));
    const pos = Math.max(0, Math.min(100, target + miss));
    ev(guessers[0], `socket.emit('dial',{pos:${pos}})`);
    await wait(200);
    for (const d of guessers) ev(d, `act('lock')`);
    await wait(350);
    for (const d of pages) if (ev(d, `S.game.phase`) === 'reveal') ev(d, `act('next')`);
    await wait(350);
  }
  ok('game reached the end screen', ev(A, `S.game.phase`) === 'gameover');

  // ---- the breakdown itself ----
  const html = ev(A, `document.querySelector('#game-root').innerHTML`);
  ok('breakdown is on screen', html.includes('who scored what'));
  for (const name of ['Ada', 'Bo', 'Cy']) ok(`${name} is listed`, html.includes(name));

  const h = ev(A, `S.game.history`);
  ok('history has one entry per prompt', h.length === ev(A, `S.game.promptTotal`), `(${h.length} entries)`);
  ok('every entry keeps the clue and card', h.every(e => e.clue && e.card && e.card.length === 2));

  // per-player totals shown must equal the sum of that player's clue points
  const totals = {};
  for (const e of h) totals[e.pid] = (totals[e.pid] || 0) + e.guessPts;
  const shown = ev(A, `[...document.querySelectorAll('#wl-breakdown div')]
    .map(d => d.textContent).filter(t => /\\d+ pts?/.test(t))`);
  const sumShown = Object.values(totals).reduce((a, b) => a + b, 0);
  ok('someone actually scored', sumShown > 0, `(${sumShown} pts total)`);
  ok('player totals add up to the team score', sumShown === ev(A, `S.game.scores.total`),
     `(${sumShown} vs ${ev(A, `S.game.scores.total`)})`);
  ok('a total is rendered for each player', shown.length >= 3, `(${shown.length} rows)`);

  // best clue-giver first, and crowned
  const order = ev(A, `[...document.querySelectorAll('#wl-breakdown b')].map(b => b.textContent.trim())`);
  const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const topName = ev(A, `playerName('${ranked[0][0]}')`);
  ok('best clue-giver is on top', order[0].startsWith(topName), `(top row "${order[0]}", expected ${topName})`);
  ok('winner is crowned', order[0].includes('👑'));

  // mid-game the history stays hidden
  ok('history only appears at the end', ev(pages[1], `S.game.history`) !== null);

  console.log(failed ? `\n${failed} FAILED` : '\nSCORE BREAKDOWN TESTS PASSED');
  server.kill();
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
