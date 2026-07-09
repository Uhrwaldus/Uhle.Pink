// Undercover client UI
(() => {
  function refPanel() {
    const rows = [
      ['🧑', 'Civilians', 'Most players share the same secret word.'],
      ['🥸', 'Undercover', 'Got a similar-but-different word — and doesn\'t know it!'],
      ['🕵️', 'Mr. White', 'Got NO word. Bluffs along — and can steal the win by guessing the civilian word when voted out.'],
      ['🗣', 'Describe', 'In turn, everyone says one word/phrase about their word. Not too obvious!'],
      ['🗳', 'Vote', 'Vote out the most suspicious player. Ties = nobody out.'],
      ['🏁', 'Win', 'Civilians win when all infiltrators are out. Infiltrators win by surviving to the final two.'],
    ];
    return `<div class="side-box ll-ref"><h4>📖 undercover</h4>` +
      rows.map(([e, n, t]) => `<div class="ref-row" style="--cc:#9aa0b4">
        <div class="ref-v">${e}</div><div class="ref-txt"><b>${n}</b><span>${t}</span></div></div>`).join('') + `</div>`;
  }
  function logPanel(g) {
    return `<div class="side-box ll-log-box"><h4>📜 the story so far</h4>
      <div class="entries">${g.log.map(l => `<div>${esc(l)}</div>`).join('')}</div></div>`;
  }

  function render(root, S) {
    const g = S.game;
    const meAlive = g.alive[S.you];
    const over = g.phase === 'gameover';

    let html = `<div class="scorebar"><div class="pill">🥸 Undercover</div><div class="pill">round ${g.round}</div><div class="pill">${Object.values(g.alive).filter(Boolean).length} alive</div></div>`;

    // your card
    if (!over) {
      html += `<div style="text-align:center;margin:10px 0">
        <div style="font-size:.75rem;color:var(--muted)">your secret word</div>
        ${g.isWhite
          ? `<div class="winner-banner" style="color:var(--red)">🕵️ you are MR. WHITE</div><p style="color:var(--muted);font-size:.85rem">you have no word — listen and blend in</p>`
          : `<div class="winner-banner" style="color:var(--band2)">${esc(g.word)}</div>`}
        ${meAlive ? '' : '<p style="color:var(--red)">☠ you\'re out — spectating</p>'}</div>`;
    }

    // players + status
    html += `<div style="text-align:center;margin:6px 0">` + g.order.map(id => {
      const dead = !g.alive[id];
      const role = g.eliminatedRoles[id];
      const tag = role ? ({ civilian: '🧑', undercover: '🥸', white: '🕵️' }[role]) : '';
      return `<span class="pill" style="${dead ? 'opacity:.45;text-decoration:line-through' : ''}${id === g.describer ? ';outline:2px solid var(--band2)' : ''}">${esc(playerName(id))}${tag ? ' ' + tag : ''}</span>`;
    }).join('') + `</div>`;

    if (g.phase === 'describe') {
      const myTurn = g.describer === S.you;
      html += `<p style="text-align:center;color:var(--muted);font-size:.8rem">speaking order: ${g.descOrder.map((id, i) => `${i < g.turnIdx ? '✔' : ''}${esc(playerName(id))}`).join(' → ')}</p>`;
      if (myTurn) {
        html += `<p class="big" style="text-align:center">Your turn — describe your word in one word or short phrase:</p>
          <input type="text" id="uc-desc" placeholder="your description…" maxlength="60">
          <button id="uc-desc-btn" style="width:100%">Say it</button>`;
      } else {
        html += `<p class="big" style="text-align:center">🎙 ${esc(playerName(g.describer))} is describing…</p>`;
      }
    }
    if (g.phase === 'vote') {
      if (meAlive && !g.youVoted) {
        html += `<p class="big" style="text-align:center">🗳 Who is not one of us? (${g.votesIn}/${g.votesNeeded})</p>
          <div style="text-align:center">` +
          g.order.filter(id => g.alive[id] && id !== S.you)
            .map(id => `<button class="secondary" style="margin:3px" data-vote="${id}">${esc(playerName(id))}</button>`).join('') + `</div>`;
      } else {
        html += `<p class="big" style="text-align:center">${g.youVoted ? 'vote cast ✔' : 'the living are voting…'} (${g.votesIn}/${g.votesNeeded})</p>`;
      }
    }
    if (g.phase === 'whiteguess') {
      if (g.pendingWhite === S.you) {
        html += `<p class="big" style="text-align:center;color:var(--band4)">🕵️ Last chance! Guess the civilian word to steal the win:</p>
          <input type="text" id="uc-guess" placeholder="the word is…" maxlength="30">
          <button id="uc-guess-btn" class="red" style="width:100%">Guess!</button>`;
      } else {
        html += `<p class="big" style="text-align:center">😱 ${esc(playerName(g.pendingWhite))} was MR. WHITE — guessing the word…</p>`;
      }
    }
    if (over) {
      const color = g.winner === 'civilians' ? 'var(--band2)' : g.winner === 'white' ? 'var(--band4)' : 'var(--red)';
      const title = { civilians: '🧑 Civilians win!', infiltrators: '🥸 Infiltrators win!', white: '🕵️ MR. WHITE WINS!' }[g.winner];
      html += `<div class="winner-banner" style="color:${color}">${title}</div>
        <p style="text-align:center">${esc(g.reason)}</p>
        <p style="text-align:center">civilian word: <b style="color:var(--band2)">${esc(g.civWord)}</b> · undercover word: <b style="color:var(--red)">${esc(g.ucWord)}</b></p>
        <div style="text-align:center;margin:8px 0">` +
        g.order.map(id => `<span class="pill">${esc(playerName(id))}: ${{ civilian: '🧑', undercover: '🥸 undercover', white: '🕵️ Mr. White' }[g.roles[id]]}</span>`).join('') +
        `</div>${rematchRow(isHost())}`;
    }

    // descriptions this game
    if (!over && g.descriptions.length) {
      html += `<div class="log" style="margin-top:12px"><b>what's been said:</b>` +
        g.descriptions.slice(-10).map(d => `<div>r${d.round} · ${esc(playerName(d.pid))}: "${esc(d.text)}"</div>`).join('') + `</div>`;
    }

    root.innerHTML = `<div class="ll-layout">${refPanel()}<div class="ll-main">${html}</div>${logPanel(g)}</div>`;
    const db = root.querySelector('#uc-desc-btn');
    if (db) db.onclick = () => {
      const t = root.querySelector('#uc-desc').value.trim();
      if (!t) return toast('Say something!');
      act('describe', { text: t });
    };
    root.querySelectorAll('[data-vote]').forEach(b => b.onclick = () => act('vote', { pid: b.dataset.vote }));
    const gb = root.querySelector('#uc-guess-btn');
    if (gb) gb.onclick = () => {
      const w = root.querySelector('#uc-guess').value.trim();
      if (!w) return toast('Type your guess');
      act('white_guess', { word: w });
    };
    const _e = root.querySelector('.ll-log-box .entries');
    if (_e) _e.scrollTop = _e.scrollHeight;
  }
  GameUI.undercover = { render };
})();
