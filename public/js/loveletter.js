// Love Letter client UI — with card faces
(() => {
  let pendingCard = null;

  const ART = {
    1: { e: '🛡️', c: '#8fa3c7' }, 2: { e: '👁️', c: '#b58ff0' },
    3: { e: '⚖️', c: '#c79b5a' }, 4: { e: '🕊️', c: '#7fd4c1' },
    5: { e: '🤴', c: '#f0a35e' }, 6: { e: '👑', c: '#ffd166' },
    7: { e: '🌹', c: '#e57373' }, 8: { e: '👸', c: '#ff8fb3' },
  };

  function face(def, opts = {}) {
    const a = ART[def.v];
    return `<div class="ll-card${opts.click ? '' : ' static'}" style="--cc:${a.c}" ${opts.attr || ''}>
      <div class="llv">${def.v}</div>
      <div class="llart">${a.e}</div>
      <div class="llname">${def.name}</div>
      <div class="lltext">${def.text}</div>
    </div>`;
  }
  function mini(v, NAME) {
    const a = ART[v];
    return `<span class="ll-mini" style="--cc:${a.c}">${a.e} ${v}</span>`;
  }

  function refPanel(g) {
    return `<div class="side-box ll-ref"><h4>📖 all cards</h4>` +
      g.cardDefs.map(c => {
        const a = ART[c.v];
        return `<div class="ref-row" style="--cc:${a.c}">
          <div class="ref-v">${a.e}<br>${c.v}×${c.count}</div>
          <div class="ref-txt"><b style="color:${a.c}">${c.name}</b><span>${c.text}</span></div>
        </div>`;
      }).join('') + `</div>`;
  }
  function logPanel(g) {
    return `<div class="side-box ll-log-box"><h4>📜 turn log</h4>
      <div class="entries">${g.log.length ? g.log.map(l => `<div>${esc(l)}</div>`).join('') : '<div>round begins…</div>'}</div></div>`;
  }

  function render(root, S) {
    const g = S.game;
    const DEFS = {}; g.cardDefs.forEach(c => DEFS[c.v] = c);
    const NAME = {}; g.cardDefs.forEach(c => NAME[c.v] = c.name);
    const myTurn = g.current === S.you && g.phase === 'turn';
    if (!myTurn) pendingCard = null;

    let html = `<div class="scorebar"><div class="pill">💌 round ${g.round}</div><div class="pill">🂠 deck: ${g.deckLeft}</div><div class="pill">🏆 first to ${g.tokensToWin}</div></div>`;
    html += `<div style="text-align:center;margin:6px 0">` + g.order.map(id => {
      const dead = g.eliminated[id], prot = g.protected[id];
      return `<span class="pill" style="${dead ? 'opacity:.4;text-decoration:line-through' : ''}${id === g.current ? ';outline:2px solid var(--band2)' : ''}">
        ${esc(playerName(id))} ❤${g.tokens[id]}${prot ? ' 🛡' : ''}${dead ? ' ☠' : ''}</span>`;
    }).join('') + `</div>`;

    if (g.faceUp.length) {
      html += `<div style="text-align:center;margin:8px 0">
        <div style="font-size:.75rem;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px">🂠 removed from this round</div>
        <div style="display:flex;justify-content:center;flex-wrap:wrap">` +
        g.faceUp.map(v => face(DEFS[v])).join('') + `</div></div>`;
    }
    html += `<div style="text-align:center;font-size:.72rem;color:var(--muted);margin:4px 0">` +
      g.order.map(id => `<div>${esc(playerName(id))}: ${g.discards[id].map(v => mini(v)).join(' ') || '—'}</div>`).join('') + `</div>`;

    if (g.priestPeek) html += `<p style="text-align:center;color:var(--band4)">🔍 ${esc(playerName(g.priestPeek.target))} holds ${mini(g.priestPeek.card)} <b>${NAME[g.priestPeek.card]}</b></p>`;

    if (g.phase === 'turn') {
      if (myTurn && !pendingCard) {
        html += `<p class="big" style="text-align:center">Your turn — play a card:</p>
          <div style="display:flex;justify-content:center;flex-wrap:wrap">` +
          g.hand.map((v, i) => face(DEFS[v], { click: true, attr: `data-play="${v}"` })).join('') + `</div>`;
      } else if (myTurn && pendingCard) {
        html += `<div style="display:flex;justify-content:center">${face(DEFS[pendingCard])}</div>
          <p class="big" style="text-align:center">choose a target${pendingCard === 1 ? ' (then guess their card)' : ''}:</p><div style="text-align:center">` +
          g.targetable.map(id => `<button class="secondary" style="margin:3px" data-target="${id}">${esc(playerName(id))}</button>`).join('') +
          (pendingCard === 5 ? `<button class="secondary" style="margin:3px" data-target="${S.you}">yourself</button>` : '') +
          `</div><button id="ll-cancel" class="secondary" style="width:100%;margin-top:8px">cancel</button>`;
      } else {
        html += `<p class="big" style="text-align:center">⏳ ${esc(playerName(g.current))} is playing…</p>`;
        if (g.hand.length) html += `<div style="display:flex;justify-content:center">${face(DEFS[g.hand[0]])}</div>`;
      }
    }
    if (g.phase === 'roundend' || g.phase === 'gameover') {
      const w = g.phase === 'gameover' ? g.winner : g.roundWinner;
      html += `<div class="winner-banner" style="color:var(--band2)">${g.phase === 'gameover' ? '👑' : '💌'} ${esc(playerName(w))} wins the ${g.phase === 'gameover' ? 'game' : 'round'}!</div>`;
      if (g.hands) html += `<div style="display:flex;justify-content:center;flex-wrap:wrap">` +
        Object.entries(g.hands).filter(([, h]) => h.length).map(([id, h]) =>
          `<div style="text-align:center"><div style="font-size:.75rem;color:var(--muted)">${esc(playerName(id))}</div>${face(DEFS[h[0]])}</div>`).join('') + `</div>`;
      html += g.phase === 'gameover' ? rematchRow(isHost()) : `<button style="width:100%" onclick="act('next')">Next round ▶</button>`;
    }
    root.innerHTML = `<div class="ll-layout">${refPanel(g)}<div class="ll-main">${html}</div>${logPanel(g)}</div>`;
    const entries = root.querySelector('.ll-log-box .entries');
    if (entries) entries.scrollTop = entries.scrollHeight;

    root.querySelectorAll('[data-play]').forEach(b => b.onclick = () => {
      const v = +b.dataset.play;
      if ([1, 2, 3, 6].includes(v) && g.targetable.length) { pendingCard = v; render(root, S); }
      else if (v === 5) { pendingCard = v; render(root, S); }
      else act('play', { card: v });
    });
    root.querySelectorAll('[data-target]').forEach(b => b.onclick = () => {
      const target = b.dataset.target;
      if (pendingCard === 1) {
        const wrap = document.createElement('div');
        wrap.innerHTML = `<p style="text-align:center;margin-top:8px">guess their card:</p><div style="display:flex;justify-content:center;flex-wrap:wrap">` +
          g.cardDefs.filter(c => c.v >= 2).map(c => face(c, { click: true, attr: `data-guess="${c.v}"` })).join('') + `</div>`;
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
