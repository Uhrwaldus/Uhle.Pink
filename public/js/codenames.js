// Codenames client UI
(() => {
  function logPanel(g) {
    return `<div class="side-box ll-log-box"><h4>📜 game log</h4>
      <div class="entries">${g.log.length ? g.log.map(l => `<div>${esc(l)}</div>`).join('') : '<div>…</div>'}</div></div>`;
  }
  function refPanel(g) {
    const rows = [
      ['🗣', 'Clue', 'Spymaster: one word + a number (how many tiles relate).'],
      ['👆', 'Guess', 'Team picks tiles. You get number+1 guesses; stop anytime.'],
      ['⬜', 'Neutral', 'Ends your turn.'],
      ['🟥🟦', 'Enemy tile', 'Ends your turn and helps them.'],
      ['💀', 'Assassin', 'Instant loss. Do not touch.'],
    ];
    return `<div class="side-box ll-ref"><h4>📖 rules</h4>` +
      rows.map(([e, n, t]) => `<div class="ref-row" style="--cc:#9aa0b4">
        <div class="ref-v">${e}</div>
        <div class="ref-txt"><b>${n}</b><span>${t}</span></div></div>`).join('') + `</div>`;
  }

  function render(root, S) {
    const g = S.game;
    const m = me();
    const myTeam = m.team;
    const iAmSpymaster = g.isSpymaster;
    const myTurnToClue = g.phase === 'clue' && g.spymasters[g.turn] === S.you;
    const canGuess = g.phase === 'guess' && myTeam === g.turn && !iAmSpymaster;

    let html = `<div class="scorebar">
      <div class="score blue">${g.remaining.blue}</div>
      <div class="round-info"><span style="color:${g.turn === 'blue' ? 'var(--blue)' : 'var(--red)'};font-weight:700">${g.turn.toUpperCase()}</span> ${g.phase === 'clue' ? 'is cluing' : 'is guessing'}</div>
      <div class="score red">${g.remaining.red}</div>
    </div>`;
    if (g.clue) html += `<p style="text-align:center;font-size:1.2rem;font-weight:700">"${esc(g.clue.word)}" — ${g.clue.num}${g.phase === 'guess' ? ` <span style="color:var(--muted);font-size:.8rem">(${g.guessesLeft} guesses left)</span>` : ''}</p>`;

    html += `<div class="cn-grid">` + g.words.map((w, i) => {
      const r = g.revealed[i];
      let cls = 'cn-tile';
      if (r) cls += ' r-' + r;
      else if (g.key) cls += ' k-' + (g.key[i] === 'neutral' ? 'neutral' : g.key[i]);
      return `<button class="${cls}" data-i="${i}" ${r || !canGuess ? 'disabled' : ''} style="${r ? 'opacity:.75' : ''}">${w}</button>`;
    }).join('') + `</div>`;

    html += `<p style="text-align:center;font-size:.75rem;color:var(--muted)">spymasters: <span style="color:var(--blue)">${esc(playerName(g.spymasters.blue))}</span> · <span style="color:var(--red)">${esc(playerName(g.spymasters.red))}</span>${iAmSpymaster ? ' — you see the key' : ''}</p>`;

    if (myTurnToClue) {
      html += `<div class="row"><input type="text" id="cn-word" placeholder="one-word clue" maxlength="20" style="flex:2">
        <input type="number" id="cn-num" min="0" max="9" value="2" style="flex:1"></div>
        <button id="cn-give" style="width:100%">Give clue</button>`;
    } else if (g.phase === 'clue') {
      html += `<p style="text-align:center;color:var(--muted)">waiting for ${esc(playerName(g.spymasters[g.turn]))}'s clue…</p>`;
    }
    if (canGuess) html += `<button id="cn-stop" class="secondary" style="width:100%;margin-top:6px">✋ Stop guessing</button>`;

    if (g.phase === 'gameover') {
      html += `<div class="winner-banner" style="color:${g.winner === 'blue' ? 'var(--blue)' : 'var(--red)'}">🏆 ${g.winner.toUpperCase()} wins — ${esc(g.reason)}</div>${rematchRow(isHost())}`;
    }
    root.innerHTML = `<div class="ll-layout">${refPanel(g)}<div class="ll-main">${html}</div>${logPanel(g)}</div>`;
    const _e = root.querySelector('.ll-log-box .entries');
    if (_e) _e.scrollTop = _e.scrollHeight;

    root.querySelectorAll('[data-i]').forEach(b => b.onclick = () => act('pick', { i: +b.dataset.i }));
    const give = root.querySelector('#cn-give');
    if (give) give.onclick = () => {
      const el = root.querySelector('#cn-word');
      const word = el.value.trim();
      const num = +root.querySelector('#cn-num').value;
      if (!word) return toast('Write a clue word');
      el.blur();
      act('clue', { word, num });
    };
    const stop = root.querySelector('#cn-stop');
    if (stop) stop.onclick = () => act('stop');
  }
  GameUI.codenames = { render };
})();
