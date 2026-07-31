// Clicks the real Lock button in two browsers — the exact flow that deadlocked.
const { spawn } = require('child_process');
const { JSDOM } = require('/tmp/repo/node_modules/jsdom');
const PORT = 3917, URL = `http://localhost:${PORT}/`;
const wait = ms => new Promise(r => setTimeout(r, ms));
async function page() {
  const dom = await JSDOM.fromURL(URL, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) { w.fetch = (u, o) => fetch(String(u).startsWith('http') ? u : URL.replace(/\/$/, '') + u, o); } });
  dom.errors = [];
  dom.window.addEventListener('error', e => dom.errors.push(e.message));
  for (let i = 0; i < 30 && dom.window.eval('typeof socket') === 'undefined'; i++) await wait(300);
  return dom;
}
const ev = (d, c) => d.window.eval(c);
const clickLock = d => ev(d, `[...document.querySelectorAll('#wl-phase button')].find(x=>x.textContent.includes('Lock it in')).click()`);
async function main() {
  const server = spawn('node', ['/tmp/repo/server.js'], { env: { ...process.env, PORT, TUNNEL: 'off' }, stdio: 'pipe' });
  await wait(1000);
  const A = await page(), B = await page(), C = await page();
  ev(A, `socket.emit('create_room',{name:'A'},r=>{window.__c=r.code})`);
  await wait(400);
  const code = ev(A, 'window.__c');
  ev(B, `socket.emit('join_room',{code:'${code}',name:'B'},()=>{})`);
  ev(C, `socket.emit('join_room',{code:'${code}',name:'C'},()=>{})`);
  await wait(500);
  ev(A, `document.querySelector('#mode-coop').click()`);
  await wait(300);
  ev(A, `document.querySelector('#btn-start').click()`);
  await wait(500);
  for (const [d, tag] of [[A,'a'],[B,'b'],[C,'c']]) {
    for (let i = 0; i < 3; i++) {
      ev(d, `document.querySelector('#wl-clue-in').value='${tag}${i}';document.querySelector('#wl-clue-btn').click()`);
      await wait(200);
    }
  }
  await wait(400);
  console.log('phase:', ev(A, 'S.game.phase'), '| locksNeeded:', ev(A, 'S.game.locksNeeded'));
  const writer = ev(A, 'S.game.writerId === S.you') ? A : (ev(B, 'S.game.writerId === S.you') ? B : C);
  const guessers = [A, B, C].filter(d => d !== writer);
  // guesser 1 clicks Lock
  clickLock(guessers[0]);
  await wait(400);
  console.log('after 1st lock — locksIn:', ev(A, 'S.game.locksIn'), 'phase:', ev(A, 'S.game.phase'));
  // guesser 2 clicks Lock -> must resolve, NOT unlock the first
  clickLock(guessers[1]);
  await wait(500);
  const phase = ev(A, 'S.game.phase');
  console.log('after 2nd lock — phase:', phase, '| locksIn:', ev(A, 'S.game.locksIn'));
  // and dragging the dial after a lock must still clear locks
  ev(A, `socket.emit('dial',{pos: 77})`);
  await wait(300);
  console.log('errors:', A.errors, B.errors, C.errors);
  const ok = phase === 'reveal';
  console.log(ok ? '\nLOCK FLOW OK ✔' : '\nSTILL DEADLOCKED ✘');
  server.kill(); process.exit(ok ? 0 : 1);
}
main().catch(e => { console.error('CRASH:', e.message); process.exit(1); });
