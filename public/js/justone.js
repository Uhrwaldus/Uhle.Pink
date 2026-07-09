// Just One client UI
(() => {
  function refPanel() {
    const rows = [
      ['🎯', 'The goal', 'One player guesses a secret word. Everyone else writes ONE word as a clue.'],
      ['🚫', 'Duplicates', 'Identical clues cancel each other and are hidden. So be clever, not obvious!'],
      ['🤐', 'No peeking', "Clue writers can't see each other's clues while writing."],
      ['✅', 'Scoring', '13 words per game. Correct guess = 1 point. Pass or miss = 0.'],
      ['⚖️', 'Table rules', 'If a guess is "basically right", the host can count it.'],
    ];
    return `<div class="side-box ll-ref"><h4>📖 how to play</h4>` +
      rows.map(([e, n, t]) => `<div class="ref-row" style="--cc:#9aa0b4">
        <div class="ref-v">${e}</div><div class="ref-txt"><b>${n}</b><span>${t}</span></div></div>`).join('') + `</div>`;
  }
  function logPanel(g) {
    return `<div class="side-box ll-log-box"><h4>📜 words so far</h4>
      <div class="entries">${g.log.length ? g.log.map(l => `<div>${esc(l)}</div>`).join('') : '<div>first word…</div>'}</div></div>`;
  }

  function render(root, S) {
    const g = S.game;
    let html = `<div class="scorebar">
      <div class="pill">☝️ word ${g.round}/${g.totalRounds}</div>
      <div class="pill">⭐ ${g.score}</div>
      <div class="pill">🎯 ${esc(playerName(g.guesserId))}${g.isGuesser ? ' (you!)' : ''}</div></div>`;

    if (g.phase === 'clue') {
      if (g.isGuesser) {
        html += `<div class="winner-banner">🙈</div>
          <p class="big" style="text-align:center">You're guessing! The others are writing clues… (${g.cluesIn}/${g.cluesNeeded})</p>`;
      } else {
        html += `<div style="text-align:center;margin:10px 0"><div style="font-size:.75rem;color:var(--muted)">the secret word</div>
          <div class="winner-banner" style="color:var(--band2)">${esc(g.word)}</div></div>`;
        if (g.yourClue) {
          html += `<p class="big" style="text-align:center">Your clue: <b>${esc(g.yourClue)}</b> ✔ — waiting (${g.cluesIn}/${g.cluesNeeded})</p>`;
        } else {
          html += `<p style="text-align:center;color:var(--muted)">write ONE word to lead ${esc(playerName(g.guesserId))} to it — but if someone writes the same clue, both vanish!</p>
            <input type="text" id="jo-clue" placeholder="one word…" maxlength="24">
            <button id="jo-clue-btn" style="width:100%">Submit clue</button>`;
        }
      }
    }
    if (g.phase === 'guess') {
      html += `<p style="text-align:center;color:var(--muted)">the clues:</p>
        <div style="text-align:center;margin:8px 0">${g.visibleClues.length
          ? g.visibleClues.map(c => `<span class="pill" style="font-size:1.1rem;border:1px solid var(--band2)">${esc(c)}</span>`).join('')
          : '<span class="pill" style="color:var(--red)">💀 every clue got cancelled…</span>'}</div>`;
      if (g.isGuesser) {
        html += `<input type="text" id="jo-guess" placeholder="your guess…" maxlength="30">
          <div class="row"><button id="jo-guess-btn">Guess!</button><button id="jo-pass" class="secondary">Pass 😔</button></div>`;
      } else {
        html += `<p class="big" style="text-align:center">🤞 ${esc(playerName(g.guesserId))} is thinking… (word: <b>${esc(g.word)}</b>)</p>`;
      }
    }
    if (g.phase === 'result') {
      html += `<div style="text-align:center">
        <div style="font-size:.75rem;color:var(--muted)">the word was</div>
        <div class="winner-banner" style="color:var(--band2)">${esc(g.word)}</div>
        ${g.passed ? `<p class="big">passed 😔</p>` : `<p class="big">guess: "<b>${esc(g.guess)}</b>" ${g.correct ? '✅ +1' : '❌'}</p>`}
        ${g.cancelled.length ? `<p style="color:var(--muted);font-size:.85rem">cancelled clues: ${g.cancelled.map(esc).join(', ')}</p>` : ''}</div>`;
      if (!g.correct && !g.passed && S.you === S.hostId) {
        html += `<button id="jo-override" class="secondary" style="width:100%;margin-bottom:8px">⚖️ Actually… count it as correct</button>`;
      }
      html += `<button id="jo-next" style="width:100%">${g.round >= g.totalRounds ? 'Final score ▶' : 'Next word ▶'}</button>`;
    }
    if (g.phase === 'gameover') {
      const pct = g.score / g.totalRounds;
      const rank = g.score >= 13 ? '🏆 PERFECT SCORE!' : g.score >= 11 ? '🤯 Incredible!' : g.score >= 9 ? '🌟 Awesome!' : g.score >= 7 ? '👏 Not bad at all' : g.score >= 4 ? '📉 Try again?' : '💀 …ouch';
      html += `<div class="winner-banner" style="color:var(--band2)">${g.score} / ${g.totalRounds}</div>
        <p class="big" style="text-align:center">${rank}</p>${rematchRow(isHost())}`;
    }

    root.innerHTML = `<div class="ll-layout">${refPanel()}<div class="ll-main">${html}</div>${logPanel(g)}</div>`;
    const cb = root.querySelector('#jo-clue-btn');
    if (cb) cb.onclick = () => {
      const w = root.querySelector('#jo-clue').value.trim();
      if (!w) return toast('Write a clue');
      if (w.includes(' ')) return toast('ONE word only!');
      act('clue', { word: w });
    };
    const gb = root.querySelector('#jo-guess-btn');
    if (gb) gb.onclick = () => {
      const w = root.querySelector('#jo-guess').value.trim();
      if (!w) return toast('Type a guess');
      act('guess', { word: w });
    };
    const pass = root.querySelector('#jo-pass');
    if (pass) pass.onclick = () => act('pass');
    const ov = root.querySelector('#jo-override');
    if (ov) ov.onclick = () => act('override');
    const nx = root.querySelector('#jo-next');
    if (nx) nx.onclick = () => act('next');
  }
  GameUI.justone = { render };
})();
