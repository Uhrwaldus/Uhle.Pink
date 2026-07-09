// Hanabi client UI
(() => {
  let mode = null; // null | 'play' | 'discard' | {hint: pid}

  function cardHTML(c, i, clickable) {
    const known = c.color || c.value;
    const cls = c.color ? 'hb-' + c.color : '';
    const label = (c.value || '?');
    const hints = (c.hintColor ? '🎨' : '') + (c.hintValue ? '#' : '');
    return `<button class="hb-card ${cls}" ${clickable ? `data-card="${i}" style="cursor:pointer"` : 'disabled'}>${label}<small style="font-size:.55rem">${hints}</small></button>`;
  }

  function render(root, S) {
    const g = S.game;
    const myTurn = g.current === S.you && g.phase === 'playing';
    if (!myTurn) mode = null;

    let html = `<div class="scorebar">
      <div class="pill">💡 ${g.clues}</div>
      <div class="pill">💣 ${'●'.repeat(g.fuses)}</div>
      <div class="pill">🂠 ${g.deckLeft}${g.finalTurns !== null ? ` · ${g.finalTurns} turns left` : ''}</div>
    </div>`;

    // fireworks piles
    html += `<div style="text-align:center;margin:8px 0">` +
      g.colors.map(c => `<span class="hb-card hb-${c}" style="cursor:default">${g.piles[c] || '·'}</span>`).join('') + `</div>`;

    // other players' hands
    for (const pid of g.order) {
      if (pid === S.you) continue;
      const hintable = mode && mode.hint === pid;
      html += `<div style="margin:4px 0"><span style="font-size:.8rem;color:var(--muted);${pid === g.current ? 'color:var(--band2);font-weight:700' : ''}">${esc(playerName(pid))}${pid === g.current ? ' ⬅ turn' : ''}</span><br>` +
        g.hands[pid].map((c, i) => cardHTML(c, i, false)).join('') +
        (myTurn && g.clues > 0 ? ` <button class="secondary" style="padding:6px 10px;font-size:.75rem" data-hint="${pid}">💡 hint</button>` : '') + `</div>`;
    }

    // my hand
    html += `<div style="margin:8px 0"><span style="font-size:.8rem;color:var(--muted);${myTurn ? 'color:var(--band2);font-weight:700' : ''}">your hand${myTurn ? ' ⬅ your turn' : ''}</span><br>` +
      g.hands[S.you].map((c, i) => cardHTML(c, i, myTurn && (mode === 'play' || mode === 'discard'))).join('') + `</div>`;

    if (g.phase === 'playing') {
      if (myTurn && !mode) {
        html += `<div class="row">
          <button id="hb-play">▶ Play a card</button>
          <button id="hb-discard" class="secondary" ${g.clues >= 8 ? 'disabled' : ''}>🗑 Discard (+💡)</button></div>
          <p style="text-align:center;color:var(--muted);font-size:.75rem;margin-top:6px">or give a hint with 💡 next to a player</p>`;
      } else if (myTurn && (mode === 'play' || mode === 'discard')) {
        html += `<p class="big" style="text-align:center">pick a card to ${mode}</p><button id="hb-cancel" class="secondary" style="width:100%">cancel</button>`;
      } else if (myTurn && mode && mode.hint) {
        const target = mode.hint;
        html += `<p class="big" style="text-align:center">hint ${esc(playerName(target))} about:</p><div style="text-align:center">` +
          g.colors.map(c => `<button class="hb-card hb-${c}" data-hcolor="${c}" style="cursor:pointer">🎨</button>`).join('') + `<br>` +
          [1,2,3,4,5].map(v => `<button class="hb-card" data-hvalue="${v}" style="cursor:pointer">${v}</button>`).join('') +
          `</div><button id="hb-cancel" class="secondary" style="width:100%;margin-top:6px">cancel</button>`;
      } else if (!myTurn) {
        html += `<p style="text-align:center;color:var(--muted)">⏳ ${esc(playerName(g.current))}'s turn</p>`;
      }
    } else if (g.phase === 'gameover') {
      html += `<div class="winner-banner" style="color:var(--band2)">🎆 ${g.score}/25</div><p style="text-align:center">${esc(g.reason)}</p>${rematchRow(isHost())}`;
    }

    if (g.discards.length) html += `<p style="font-size:.7rem;color:var(--muted);text-align:center">discards: ${g.discards.map(c => c.color[0] + c.value).join(' ')}</p>`;
    html += `<div class="log">${g.log.map(l => `<div>${esc(l)}</div>`).join('')}</div>`;
    root.innerHTML = html;

    const play = root.querySelector('#hb-play'), disc = root.querySelector('#hb-discard'), cancel = root.querySelector('#hb-cancel');
    if (play) play.onclick = () => { mode = 'play'; render(root, S); };
    if (disc) disc.onclick = () => { mode = 'discard'; render(root, S); };
    if (cancel) cancel.onclick = () => { mode = null; render(root, S); };
    root.querySelectorAll('[data-card]').forEach(b => b.onclick = () => {
      act(mode === 'play' ? 'play' : 'discard', { i: +b.dataset.card });
      mode = null;
    });
    root.querySelectorAll('[data-hint]').forEach(b => b.onclick = () => { mode = { hint: b.dataset.hint }; render(root, S); });
    root.querySelectorAll('[data-hcolor]').forEach(b => b.onclick = () => { act('hint', { pid: mode.hint, color: b.dataset.hcolor }); mode = null; });
    root.querySelectorAll('[data-hvalue]').forEach(b => b.onclick = () => { act('hint', { pid: mode.hint, value: +b.dataset.hvalue }); mode = null; });
  }
  GameUI.hanabi = { render };
})();
