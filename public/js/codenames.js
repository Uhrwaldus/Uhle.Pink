// Codenames client UI
(() => {
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
    html += `<div class="log">${g.log.map(l => `<div>${esc(l)}</div>`).join('')}</div>`;
    root.innerHTML = html;

    root.querySelectorAll('[data-i]').forEach(b => b.onclick = () => act('pick', { i: +b.dataset.i }));
    const give = root.querySelector('#cn-give');
    if (give) give.onclick = () => {
      const word = root.querySelector('#cn-word').value.trim();
      const num = +root.querySelector('#cn-num').value;
      if (!word) return toast('Write a clue word');
      act('clue', { word, num });
    };
    const stop = root.querySelector('#cn-stop');
    if (stop) stop.onclick = () => act('stop');
  }
  GameUI.codenames = { render };
})();
