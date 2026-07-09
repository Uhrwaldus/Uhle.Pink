// Love Letter client UI
(() => {
  let pendingCard = null; // card waiting for target selection

  function render(root, S) {
    const g = S.game;
    const NAME = {}; g.cardDefs.forEach(c => NAME[c.v] = c.name);
    const myTurn = g.current === S.you && g.phase === 'turn';
    if (!myTurn) pendingCard = null;

    let html = `<div class="scorebar"><div class="pill">💌 round ${g.round}</div><div class="pill">🂠 deck: ${g.deckLeft}</div><div class="pill">🏆 first to ${g.tokensToWin}</div></div>`;
    html += `<div style="text-align:center;margin:6px 0">` + g.order.map(id => {
      const dead = g.eliminated[id], prot = g.protected[id];
      return `<span class="pill" style="${dead ? 'opacity:.4;text-decoration:line-through' : ''}${id === g.current ? ';outline:2px solid var(--band2)' : ''}">
        ${esc(playerName(id))} ❤${g.tokens[id]}${prot ? ' 🛡' : ''}${dead ? ' ☠' : ''}</span>`;
    }).join('') + `</div>`;

    if (g.faceUp.length) html += `<p style="text-align:center;color:var(--muted);font-size:.8rem">face-up: ${g.faceUp.map(v => NAME[v]).join(', ')}</p>`;

    // discards
    html += `<div style="text-align:center;font-size:.75rem;color:var(--muted);margin:4px 0">` +
      g.order.map(id => `${esc(playerName(id))}: ${g.discards[id].map(v => v).join(',') || '—'}`).join(' · ') + `</div>`;

    if (g.priestPeek) html += `<p style="text-align:center;color:var(--band4)">🔍 ${esc(playerName(g.priestPeek.target))} holds the <b>${NAME[g.priestPeek.card]} (${g.priestPeek.card})</b></p>`;

    if (g.phase === 'turn') {
      if (myTurn && !pendingCard) {
        html += `<p class="big" style="text-align:center">Your turn — play a card:</p><div style="text-align:center">` +
          g.hand.map(v => `<button class="hand-card" data-play="${v}">${v}<small>${NAME[v]}</small></button>`).join('') + `</div>`;
        const def = {};
        html += `<div class="log">` + g.cardDefs.filter(c => g.hand.includes(c.v)).map(c => `<div><b>${c.v} ${c.name}:</b> ${c.text}</div>`).join('') + `</div>`;
      } else if (myTurn && pendingCard) {
        const targets = g.targetable;
        const canSelf = pendingCard === 5;
        html += `<p class="big" style="text-align:center">Playing <b>${NAME[pendingCard]}</b> — choose a target:</p><div style="text-align:center">` +
          targets.map(id => `<button class="secondary" style="margin:3px" data-target="${id}">${esc(playerName(id))}</button>`).join('') +
          (canSelf ? `<button class="secondary" style="margin:3px" data-target="${S.you}">yourself</button>` : '') +
          `</div><button id="ll-cancel" class="secondary" style="width:100%;margin-top:8px">cancel</button>`;
        if (pendingCard === 1) {
          html = html.replace('choose a target:', 'choose a target and guess their card:');
        }
      } else {
        html += `<p class="big" style="text-align:center">⏳ ${esc(playerName(g.current))} is playing…</p>`;
        if (g.hand.length) html += `<p style="text-align:center;color:var(--muted)">your card: <b>${NAME[g.hand[0]]} (${g.hand[0]})</b></p>`;
      }
    }
    if (g.phase === 'roundend' || g.phase === 'gameover') {
      const w = g.phase === 'gameover' ? g.winner : g.roundWinner;
      html += `<div class="winner-banner" style="color:var(--band2)">${g.phase === 'gameover' ? '👑' : '💌'} ${esc(playerName(w))} wins the ${g.phase === 'gameover' ? 'game' : 'round'}!</div>`;
      if (g.hands) html += `<p style="text-align:center;color:var(--muted)">` +
        Object.entries(g.hands).filter(([, h]) => h.length).map(([id, h]) => `${esc(playerName(id))}: ${NAME[h[0]]}`).join(' · ') + `</p>`;
      html += g.phase === 'gameover' ? rematchRow(isHost()) : `<button style="width:100%" onclick="act('next')">Next round ▶</button>`;
    }
    html += `<div class="log">${g.log.map(l => `<div>${esc(l)}</div>`).join('')}</div>`;
    root.innerHTML = html;

    root.querySelectorAll('[data-play]').forEach(b => b.onclick = () => {
      const v = +b.dataset.play;
      if ([1, 2, 3, 5, 6].includes(v) && g.targetable.length + (v === 5 ? 1 : 0) > 0) { pendingCard = v; render(root, S); }
      else act('play', { card: v });
    });
    root.querySelectorAll('[data-target]').forEach(b => b.onclick = () => {
      const target = b.dataset.target;
      if (pendingCard === 1) {
        // guard: ask guess
        const wrap = document.createElement('div');
        wrap.innerHTML = `<p style="text-align:center;margin-top:8px">guess their card:</p><div style="text-align:center">` +
          g.cardDefs.filter(c => c.v >= 2).map(c => `<button class="hand-card" data-guess="${c.v}">${c.v}<small>${c.name}</small></button>`).join('') + `</div>`;
        root.appendChild(wrap);
        wrap.querySelectorAll('[data-guess]').forEach(gb => gb.onclick = () => {
          act('play', { card: 1, target, guess: +gb.dataset.guess });
          pendingCard = null;
        });
      } else {
        act('play', { card: pendingCard, target });
        pendingCard = null;
      }
    });
    const cancel = root.querySelector('#ll-cancel');
    if (cancel) cancel.onclick = () => { pendingCard = null; render(root, S); };
  }
  GameUI.loveletter = { render };
})();
