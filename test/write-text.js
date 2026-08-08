// Reproduces the "my clue text vanished" reports from the write phase.
// The earlier fix only rescued the input you were FOCUSED in — so any re-render
// that arrived while you weren't typing in it (you clicked a tab, clicked a
// button, or just clicked away) reset the field to whatever the server had.
const { spawn } = require('child_process');
const { JSDOM } = require('/tmp/repo/node_modules/jsdom');
const PORT = 3922, URL = `http://localhost:${PORT}/`;
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

// type into the clue box the way a person does — real input events
function type(d, text) {
  ev(d, `(() => {
    const i = document.querySelector('#wl-clue-in');
    i.focus(); i.value = ${JSON.stringify(text)};
    i.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}
const clueBox = d => ev(d, `(document.querySelector('#wl-clue-in') || {}).value`);

async function main() {
  const server = spawn('node', ['/tmp/repo/server.js'], { env: { ...process.env, PORT, TUNNEL: 'off' }, stdio: 'pipe' });
  await wait(1000);
  const A = await page(), B = await page();

  ev(A, `socket.emit('create_room',{name:'A'},r=>{window.__c=r.code})`);
  await wait(400);
  const code = ev(A, 'window.__c');
  ev(B, `socket.emit('join_room',{code:'${code}',name:'B'},()=>{})`);
  await wait(600);
  ev(A, `document.querySelector('#mode-coop').click()`);
  await wait(400);
  ev(A, `document.querySelector('#btn-start').click()`);
  await wait(800);
  ok('write phase started', ev(A, `S.game.phase`) === 'write');

  // --- 1. you type, click away, and someone else saves a clue ---
  type(A, 'volcano');
  ev(A, `document.querySelector('#wl-clue-in').blur()`);          // clicked away
  ev(B, `act('clue', { idx: 0, clue: 'kettle' })`);             // other player acts
  await wait(500);
  ok('survives another player\'s update while unfocused', clueBox(A) === 'volcano', `(got "${clueBox(A)}")`);

  // --- 2. you type, switch to prompt 2, come back ---
  type(A, 'thunderstorm');
  ev(A, `document.querySelector('[data-tab="1"]').click()`);
  await wait(250);
  ok('prompt 2 starts empty', clueBox(A) === '', `(got "${clueBox(A)}")`);
  ev(A, `document.querySelector('[data-tab="0"]').click()`);
  await wait(250);
  ok('switching tabs keeps your draft', clueBox(A) === 'thunderstorm', `(got "${clueBox(A)}")`);

  // --- 3. drafts must not bleed from one prompt into another ---
  type(A, 'pineapple');
  ev(A, `document.querySelector('[data-tab="2"]').click()`);
  await wait(250);
  ok('draft does not leak into prompt 3', clueBox(A) === '', `(got "${clueBox(A)}")`);

  // --- 4. rerolling the card is meant to wipe the clue, draft included ---
  ev(A, `document.querySelector('[data-tab="0"]').click()`);
  await wait(200);
  ev(A, `document.querySelector('#rr-c').click()`);
  await wait(500);
  ok('rerolling the card clears the box', clueBox(A) === '', `(got "${clueBox(A)}")`);

  // --- 5. saving still works, and the next prompt opens empty ---
  type(A, 'avalanche');
  ev(A, `document.querySelector('#wl-clue-btn').click()`);
  await wait(500);
  ok('saved clue stuck', ev(A, `S.game.yourPrompts[0].clue`) === 'avalanche', `(got "${ev(A, `S.game.yourPrompts[0].clue`)}")`);
  ok('moved on to an empty prompt', clueBox(A) === '', `(got "${clueBox(A)}")`);

  // --- 6. and the caret doesn't jump while you're mid-word ---
  ev(A, `document.querySelector('[data-tab="1"]').click()`);
  await wait(200);
  type(A, 'submarine');
  ev(A, `document.querySelector('#wl-clue-in').setSelectionRange(3, 3)`);
  ev(B, `act('clue', { idx: 1, clue: 'anything' })`);
  await wait(500);
  ok('caret stays put', ev(A, `document.querySelector('#wl-clue-in').selectionStart`) === 3);

  // ---- Just One: everyone types at once, so every submission re-renders you ----
  ev(A, `socket.emit('to_lobby')`);
  await wait(400);
  const C = await page();
  ev(C, `socket.emit('join_room',{code:'${code}',name:'C'},()=>{})`);
  await wait(500);
  ev(A, `socket.emit('set_game',{game:'justone'})`);
  await wait(400);
  ev(A, `document.querySelector('#btn-start').click()`);
  await wait(700);

  const writer = [A, B, C].find(d => ev(d, `!!document.querySelector('#jo-clue')`));
  const other  = [A, B, C].find(d => d !== writer && ev(d, `!!document.querySelector('#jo-clue')`));
  if (writer && other) {
    ev(writer, `(() => { const i = document.querySelector('#jo-clue');
      i.focus(); i.value = 'banana'; i.dispatchEvent(new Event('input', {bubbles:true})); i.blur(); })()`);
    ev(other, `(() => { const i = document.querySelector('#jo-clue'); i.value = 'apple';
      document.querySelector('#jo-clue-btn').click(); })()`);
    await wait(600);
    const still = ev(writer, `(document.querySelector('#jo-clue') || {}).value`);
    ok('just one: another clue does not wipe yours', still === 'banana', `(got "${still}")`);
  } else {
    console.log('SKIP just one (no clue box)');
  }

  console.log(failed ? `\n${failed} FAILED` : '\nWRITE-PHASE TEXT TESTS PASSED');
  server.kill();
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
