// Spyfall client UI
(() => {
  let timerH = null;
  function fmt(ms) {
    if (ms < 0) ms = 0;
    const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  function refPanel(g) {
    return `<div class="side-box ll-ref"><h4>📖 all locations</h4>
      <div style="display:flex;flex-wrap:wrap;gap:3px">${g.locations.map(l =>
        `<span class="pill" style="font-size:.68rem;padding:2px 8px;${!g.isSpy && g.location === l ? 'outline:2px solid var(--band2)' : ''}">${l}</span>`).join('')}</div></div>`;
  }

  function render(root, S) {
    const g = S.game;
    clearInterval(timerH);
    let html = '';
    if (g.phase !== 'reveal') {
      html += `<div class="scorebar"><div class="pill">🕵️ Spyfall</div><div class="pill" id="sf-timer">${fmt(g.endsAt - Date.now())}</div></div>`;
      html += g.isSpy
        ? `<div style="text-align:center;margin:12px 0"><div class="winner-banner" style="color:var(--red)">🕶️ YOU ARE THE SPY</div><p style="color:var(--muted)">figure out the location — or survive the votes</p></div>`
        : `<div style="text-align:center;margin:12px 0"><div style="font-size:.75rem;color:var(--muted)">the location</div><div class="winner-banner" style="color:var(--band2)">${esc(g.location)}</div><p style="color:var(--muted)">ask each other questions — find who doesn't know where we are</p></div>`;
    }
    if (g.phase === 'playing') {
      html += `<p style="text-align:center;color:var(--muted);font-size:.85rem">accuse someone:</p><div style="text-align:center">` +
        g.order.filter(id => id !== S.you).map(id => `<button class="secondary" style="margin:3px" data-accuse="${id}">${esc(playerName(id))}</button>`).join('') + `</div>`;
      if (g.isSpy) {
        html += `<div class="divider">— or guess the location —</div>
          <select id="sf-guess"><option value="">pick a location…</option>${g.locations.map(l => `<option>${l}</option>`).join('')}</select>
          <button id="sf-guess-btn" class="red" style="width:100%">🎯 Guess location</button>`;
      }
    }
    if (g.phase === 'voting') {
      html += `<p class="big" style="text-align:center"><b>${esc(playerName(g.accuser))}</b> accuses <b>${esc(playerName(g.accused))}</b> of being the spy! (${g.votesIn}/${g.votersTotal} voted)</p>`;
      if (S.you !== g.accused && !g.youVoted) {
        html += `<div class="row"><button id="sf-yes" class="red">Guilty 👎</button><button id="sf-no" class="secondary">Innocent 👍</button></div>`;
      } else if (S.you === g.accused) {
        html += `<p style="text-align:center;color:var(--band4)">defend yourself!</p>`;
      } else {
        html += `<p style="text-align:center;color:var(--muted)">vote cast ✔</p>`;
      }
      if (g.isSpy && S.you !== g.accused) {
        html += `<div class="divider">— last chance —</div>
          <select id="sf-guess"><option value="">pick a location…</option>${g.locations.map(l => `<option>${l}</option>`).join('')}</select>
          <button id="sf-guess-btn" class="red" style="width:100%">🎯 Guess location</button>`;
      }
    }
    if (g.phase === 'reveal') {
      html += `<div class="winner-banner" style="color:${g.winner === 'spy' ? 'var(--red)' : 'var(--band2)'}">${g.winner === 'spy' ? '🕶️ The spy wins!' : '🎉 The crew wins!'}</div>
        <p style="text-align:center">${esc(g.reason)}</p>
        <p style="text-align:center;color:var(--muted)">the spy was <b>${esc(playerName(g.spyId))}</b> · location: <b>${esc(g.location)}</b></p>
        ${rematchRow(isHost())}`;
    }
    root.innerHTML = `<div class="ll-layout"><div class="ll-main">${html}</div>${refPanel(g)}</div>`;
    root.querySelectorAll('[data-accuse]').forEach(b => b.onclick = () => act('accuse', { pid: b.dataset.accuse }));
    const yes = root.querySelector('#sf-yes'), no = root.querySelector('#sf-no');
    if (yes) yes.onclick = () => act('vote', { yes: true });
    if (no) no.onclick = () => act('vote', { yes: false });
    const gb = root.querySelector('#sf-guess-btn');
    if (gb) gb.onclick = () => {
      const loc = root.querySelector('#sf-guess').value;
      if (!loc) return toast('Pick a location');
      act('spy_guess', { location: loc });
    };
    const timerEl = root.querySelector('#sf-timer');
    if (timerEl) timerH = setInterval(() => {
      const left = g.endsAt - Date.now();
      timerEl.textContent = fmt(left);
      if (left <= 0) { timerEl.textContent = "⏰ time's up — accuse!"; clearInterval(timerH); }
    }, 1000);
  }
  GameUI.spyfall = { render };
})();
