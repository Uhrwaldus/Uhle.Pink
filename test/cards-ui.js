// Clicks the real card-picker UI: open a pack popup, switch cards off, check the
// host's browser remembers them and the dealt deck actually respects the list.
const { spawn } = require('child_process');
const { JSDOM } = require('/tmp/repo/node_modules/jsdom');
const PORT = 3921, URL = `http://localhost:${PORT}/`;
const wait = ms => new Promise(r => setTimeout(r, ms));

async function page(store) {
  const dom = await JSDOM.fromURL(URL, {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = (u, o) => fetch(String(u).startsWith('http') ? u : URL.replace(/\/$/, '') + u, o);
      if (store) { // share a localStorage between "same browser" pages
        w.localStorage.setItem('wl.disabledCards', store);
      }
    },
  });
  dom.errors = [];
  dom.window.addEventListener('error', e => dom.errors.push(e.message));
  for (let i = 0; i < 30 && dom.window.eval('typeof socket') === 'undefined'; i++) await wait(300);
  return dom;
}
const ev = (d, c) => d.window.eval(c);
function ok(label, cond, extra = '') {
  if (!cond) { console.log(`TEST FAILED: ${label} ${extra}`); process.exit(1); }
  console.log(`${label} OK ${extra}`);
}

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
  await wait(600);

  // ---- the pack row renders with a chip per pack ----
  const chips = ev(A, `document.querySelectorAll('#wl-packs [data-pack]').length`);
  ok('pack chips render', chips === 6, `(${chips} packs)`);

  // ---- "see cards" opens the popup with that pack's cards ----
  ev(A, `document.querySelector('[data-pack="food"]').click()`);
  await wait(200);
  ok('popup opens', ev(A, `document.querySelector('#wl-modal').classList.contains('show')`));
  const pills = ev(A, `document.querySelectorAll('#wl-modal-body [data-card]').length`);
  ok('popup lists the pack', pills === 6, `(${pills} food cards)`);
  ok('title is the pack', ev(A, `$('wl-modal-title').textContent`).includes('Food'));

  // ---- tapping a card switches it off ----
  ev(A, `document.querySelector('[data-card="sandwich_not-a-sandwich"]').click()`);
  await wait(250);
  ok('card greys out', ev(A, `document.querySelector('[data-card="sandwich_not-a-sandwich"]').classList.contains('off')`));
  ok('saved to this browser', JSON.parse(ev(A, `localStorage.getItem('wl.disabledCards')`)).includes('sandwich_not-a-sandwich'));
  ok('chip count drops', ev(A, `document.querySelector('#wl-packs').textContent`).includes('5/6'));
  ok('total drops', ev(A, `document.querySelector('#wl-packs').textContent`).includes('59 of 60'));

  // ---- tapping again switches it back on (the popup is the un-ban screen) ----
  ev(A, `document.querySelector('[data-card="sandwich_not-a-sandwich"]').click()`);
  await wait(250);
  ok('toggles back on', !ev(A, `document.querySelector('[data-card="sandwich_not-a-sandwich"]').classList.contains('off')`));

  // ---- "all off" for a pack ----
  ev(A, `document.querySelector('#wl-all-off').click()`);
  await wait(300);
  ok('all off empties the pack', ev(A, `document.querySelector('#wl-packs').textContent`).includes('0/6'));
  ev(A, `document.querySelector('#wl-close').click()`);
  await wait(200);
  ok('popup closes', !ev(A, `document.querySelector('#wl-modal').classList.contains('show')`));

  // ---- the guest sees the summary, not the controls ----
  const guestText = ev(B, `document.querySelector('#wl-packs').textContent`);
  ok('guest sees summary only', guestText.includes('54 of 60') && !guestText.includes('see cards'), `("${guestText.trim()}")`);

  // ---- switch off everything except one pack, then check what gets dealt ----
  ev(A, `(() => {
    const keep = 'pop';
    wlSetOff(WL_CAT.cards.filter(c => c.pack !== keep).map(c => c.id));
    renderWlPacks();
  })()`);
  await wait(400);
  ev(A, `document.querySelector('#btn-start').click()`);
  await wait(600);
  const dealt = ev(A, `S.game.yourPrompts.map(p => p.card.join(' ↔ '))`);
  const popPairs = ev(A, `WL_CAT.cards.filter(c=>c.pack==='pop').map(c=>c.left+' ↔ '+c.right)`);
  ok('deck only uses cards left on', dealt.every(d => popPairs.includes(d)), `(${dealt.join(', ')})`);

  // ---- the host's choices survive a reload (localStorage) ----
  const saved = ev(A, `localStorage.getItem('wl.disabledCards')`);
  const A2 = await page(saved);
  await wait(400);
  ok('choices survive a reload', JSON.parse(ev(A2, `localStorage.getItem('wl.disabledCards')`)).length === 54);

  const errs = [...A.errors, ...B.errors];
  ok('no JS errors in the page', errs.length === 0, errs.join(' | '));

  console.log('\nCARD PICKER UI TESTS PASSED');
  server.kill();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
