// Wavelength client UI (phase-based)
(() => {
  const CX = 200, CY = 210, R = 185;
  let localDial = 50, dragging = false, lastSent = 0;
  let writeIdx = 0; // which of your own prompts you're editing

  function polar(pos, r) {
    const th = Math.PI * (1 - pos / 100);
    return [CX + r * Math.cos(th), CY - r * Math.sin(th)];
  }
  function wedge(p1, p2, r) {
    const [x1, y1] = polar(p1, r), [x2, y2] = polar(p2, r);
    return `M ${CX} ${CY} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;
  }
  function teamColor(t) { return t === 'blue' ? 'var(--blue)' : 'var(--red)'; }
  function teamLabel(t) { return t === 'blue' ? 'Blue' : 'Red'; }

  // ---------- dial ----------
  function dialSVG() { return document.getElementById('wl-dial'); }
  function drawDial(target, needle) {
    const svg = dialSVG();
    if (!svg) return;
    let els = `<path d="${wedge(0, 100, R)}" fill="#2b3046"/>`;
    if (target !== null && target !== undefined) {
      const t = target, clamp = v => Math.max(0, Math.min(100, v));
      // equal-width bands: 2 | 3 | 4 | 3 | 2
      const bands = [
        [t - 10, t - 6, 'var(--band2)', '2'], [t - 6, t - 2, 'var(--band3)', '3'],
        [t - 2, t + 2, 'var(--band4)', '4'],
        [t + 2, t + 6, 'var(--band3)', '3'], [t + 6, t + 10, 'var(--band2)', '2'],
      ];
      for (const [a, b, color, label] of bands) {
        const ca = clamp(a), cb = clamp(b);
        if (cb <= ca) continue;
        els += `<path d="${wedge(ca, cb, R)}" fill="${color}"/>`;
        const [lx, ly] = polar((ca + cb) / 2, R * 0.84);
        els += `<text x="${lx}" y="${ly}" fill="#12141c" font-size="13" font-weight="800" text-anchor="middle">${label}</text>`;
      }
    }
    for (let i = 0; i <= 10; i++) {
      const [x1, y1] = polar(i * 10, R), [x2, y2] = polar(i * 10, R - 8);
      els += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#12141c" stroke-width="2"/>`;
    }
    if (needle !== null && needle !== undefined) {
      const [nx, ny] = polar(needle, R - 14);
      els += `<line x1="${CX}" y1="${CY}" x2="${nx}" y2="${ny}" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`;
      els += `<circle cx="${CX}" cy="${CY}" r="10" fill="#fff"/><circle cx="${nx}" cy="${ny}" r="13" fill="#fff" opacity=".9"/>`;
    }
    svg.innerHTML = els;
  }
  function posFrom(e, svg) {
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (400 / rect.width);
    const y = (e.clientY - rect.top) * (400 / rect.width);
    const th = Math.atan2(CY - y, x - CX);
    return Math.max(0, Math.min(100, (1 - Math.max(0, Math.min(Math.PI, th)) / Math.PI) * 100));
  }
  function canDragNow() {
    return !!(S && S.game && S.game.phase === 'guess' && S.game.youCanGuess);
  }
  function bindDial(svg) {
    svg.addEventListener('pointerdown', e => {
      if (!canDragNow()) return;
      dragging = true;
      svg.setPointerCapture(e.pointerId);
      moveTo(posFrom(e, svg));
    });
    svg.addEventListener('pointermove', e => { if (dragging) moveTo(posFrom(e, svg)); });
    svg.addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      socket.emit('dial', { pos: localDial });
    });
  }
  function moveTo(pos) {
    localDial = pos;
    drawDial(null, localDial);
    const now = Date.now();
    if (now - lastSent > 50) { lastSent = now; socket.emit('dial', { pos }); }
  }

  // ---------- render ----------
  function render(root, S) {
    const g = S.game;
    if (g.phase === 'write') return renderWrite(root, g);
    return renderPlay(root, g);
  }

  function scoreBar(g) {
    if (g.mode === 'coop') {
      return `<div class="scorebar">
        <div class="score blue">${g.scores.total} pts</div>
        <div class="round-info">${g.teamName ? esc(g.teamName) + ' · ' : ''}${g.phase === 'write' ? 'writing clues' : `prompt ${g.promptNum}/${g.promptTotal}`}</div>
        <div class="pill">${g.perPlayer} each</div></div>`;
    }
    return `<div class="scorebar">
      <div class="score blue">${g.scores.blue}</div>
      <div class="round-info">${g.phase === 'write' ? 'writing clues' : `prompt ${g.promptNum}/${g.promptTotal}`}${g.writerTeam ? ` · <span style="color:${teamColor(g.writerTeam)}">${teamLabel(g.writerTeam)}</span> guessing` : ''}</div>
      <div class="score red">${g.scores.red}</div></div>`;
  }

  // ----- phase 1: everyone writes -----
  function renderWrite(root, g) {
    const list = g.yourPrompts || [];
    if (writeIdx >= list.length) writeIdx = 0;
    const a = list[writeIdx] || null;
    const done = list.filter(p => p.clue).length;

    root.innerHTML = `<div class="wl-layout">
      <div class="wl-left">
        ${scoreBar(g)}
        <div class="spectrum"><span class="left">${a ? '◀ ' + esc(a.card[0]) : ''}</span><span class="right">${a ? esc(a.card[1]) + ' ▶' : ''}</span></div>
        <svg id="wl-dial" viewBox="0 0 400 225" xmlns="http://www.w3.org/2000/svg"></svg>
      </div>
      <div class="wl-right side-box">
        <h4>✍️ your clues — ${done}/${list.length} done</h4>
        <div style="text-align:center;margin-bottom:8px">${list.map((p, i) =>
          `<button class="secondary" style="margin:2px;padding:6px 10px;font-size:.8rem;${i === writeIdx ? 'outline:2px solid var(--band2)' : ''}" data-tab="${i}">${i + 1}${p.clue ? ' ✔' : ''}</button>`).join('')}</div>
        <div class="phase-box" id="wl-write"></div>
        <p style="text-align:center;color:var(--muted);font-size:.8rem;margin-top:10px">
          ${g.writersDone}/${g.writersTotal} players finished${g.youDone ? ' · you\'re done ✔' : ''}</p>
      </div></div>`;

    bindDial(dialSVG());
    drawDial(a ? a.target : null, null);

    const box = root.querySelector('#wl-write');
    if (!a) { box.innerHTML = '<p class="big">waiting…</p>'; return; }
    box.innerHTML = `
      <p class="big">Write a clue that lands on the target between <b>${esc(a.card[0])}</b> and <b>${esc(a.card[1])}</b>.</p>
      <div class="row" style="margin-bottom:8px">
        <button id="rr-t" class="secondary" ${a.rerolls.target ? 'disabled' : ''}>🎲 target ${a.rerolls.target ? '(used)' : ''}</button>
        <button id="rr-c" class="secondary" ${a.rerolls.card ? 'disabled' : ''}>🃏 card ${a.rerolls.card ? '(used)' : ''}</button>
      </div>
      <input type="text" id="wl-clue-in" placeholder="your clue…" maxlength="60" value="${a.clue ? esc(a.clue) : ''}">
      <button id="wl-clue-btn" style="width:100%">${a.clue ? 'Update clue' : 'Save clue'}</button>`;

    box.querySelector('#rr-t').onclick = () => act('reroll_target', { idx: writeIdx });
    box.querySelector('#rr-c').onclick = () => act('reroll_card', { idx: writeIdx });
    box.querySelector('#wl-clue-btn').onclick = () => {
      const clue = box.querySelector('#wl-clue-in').value.trim();
      if (!clue) return toast('Write a clue first');
      act('clue', { idx: writeIdx, clue });
      const nextEmpty = list.findIndex((p, i) => i !== writeIdx && !p.clue);
      if (nextEmpty >= 0) writeIdx = nextEmpty;
    };
    box.querySelector('#wl-clue-in').addEventListener('keydown', e => {
      if (e.key === 'Enter') box.querySelector('#wl-clue-btn').click();
    });
    root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { writeIdx = +b.dataset.tab; renderWrite(root, g); });
  }

  // ----- phase 2: play the queue -----
  function renderPlay(root, g) {
    const isWriter = g.writerId === S.you;
    if (!dragging) localDial = g.dialPos;

    root.innerHTML = `<div class="wl-layout">
      <div class="wl-left">
        ${scoreBar(g)}
        <div class="spectrum"><span class="left">${g.card ? '◀ ' + esc(g.card[0]) : ''}</span><span class="right">${g.card ? esc(g.card[1]) + ' ▶' : ''}</span></div>
        <svg id="wl-dial" viewBox="0 0 400 225" xmlns="http://www.w3.org/2000/svg"></svg>
      </div>
      <div class="wl-right side-box">
        ${g.clue ? `<div class="clue-banner"><span class="lbl">clue by ${esc(playerName(g.writerId))}</span>${esc(g.clue)}</div>` : ''}
        <div class="phase-box" id="wl-phase"></div>
        <div class="log" style="margin-top:10px">${g.log.map(l => `<div>${esc(l)}</div>`).join('')}</div>
      </div></div>`;

    bindDial(dialSVG());
    drawDial(g.target, localDial);

    const box = root.querySelector('#wl-phase');
    const p = html => { const d = document.createElement('div'); d.innerHTML = html; box.appendChild(d); return d; };

    if (g.phase === 'guess') {
      if (g.youCanGuess) {
        p(`<p class="big">Drag the dial to where <b>"${esc(g.clue)}"</b> lands. Talk it out!</p>`);
        if (g.locksNeeded > 1) {
          p(`<p style="color:var(--muted);font-size:.8rem">everyone guessing must lock in — moving the dial resets it</p>`);
        }
        if (g.youLocked) {
          const b = p(`<button class="secondary" style="width:100%">🔓 Locked ✔ ${g.locksIn}/${g.locksNeeded} — tap to unlock</button>`);
          b.querySelector('button').onclick = () => act('unlock');
        } else {
          const b = p(`<button style="width:100%">🔒 Lock it in${g.locksNeeded > 1 ? ` (${g.locksIn}/${g.locksNeeded})` : ''}</button>`);
          b.querySelector('button').onclick = () => { socket.emit('dial', { pos: localDial }); act('lock'); };
        }
        if (g.lockedNames && g.lockedNames.length && g.locksNeeded > 1) {
          p(`<p style="color:var(--band2);font-size:.8rem">locked in: ${g.lockedNames.map(esc).join(', ')}</p>`);
        }
      } else if (isWriter) {
        p(`<p class="big">Your clue is up — 🤐 no hints!</p>
           ${g.locksNeeded > 1 ? `<p style="color:var(--muted);font-size:.8rem">${g.locksIn}/${g.locksNeeded} locked in</p>` : ''}
           <p class="psychic-note">not even facial expressions 👀</p>`);
      } else {
        p(`<p class="big">${g.mode === 'coop' ? 'The others are guessing…' : `${teamLabel(g.writerTeam)} team is guessing. Get ready to counter!`}</p>`);
      }
    }
    if (g.phase === 'counter') {
      if (g.counterTie) p(`<p class="big" style="color:var(--band4)">⚖️ 50/50 tie — talk it over and vote again!</p>`);
      const onCounterTeam = me().team && me().team !== g.writerTeam;
      if (onCounterTeam) {
        if (g.youVoted) p(`<p class="big">Vote cast ✔ (${g.votesIn}/${g.votesNeeded} in)</p>`);
        else {
          p(`<p class="big">Is the target <b>LEFT</b> or <b>RIGHT</b> of their needle? Majority wins +1. (${g.votesIn}/${g.votesNeeded})</p>`);
          const row = p(`<div class="row"><button id="cl" class="secondary">◀ Left</button><button id="cr" class="secondary">Right ▶</button></div>`);
          row.querySelector('#cl').onclick = () => act('counter', { dir: 'left' });
          row.querySelector('#cr').onclick = () => act('counter', { dir: 'right' });
        }
      } else {
        p(`<p class="big">Locked! The other team is voting left/right… (${g.votesIn}/${g.votesNeeded})</p>`);
      }
    }
    if (g.phase === 'reveal') {
      const r = g.result;
      if (g.mode === 'coop') {
        p(`<div class="result-pts" style="color:var(--band2)">+${r.guessPts} ${r.guessPts === 4 ? '🎯 BULLSEYE!' : r.guessPts > 0 ? '✨' : '💨'}</div>
           <p>team total: <b>${g.scores.total}</b> · prompt ${g.promptNum}/${g.promptTotal}</p>`);
      } else {
        let html = `<div class="result-pts" style="color:${teamColor(g.writerTeam)}">${teamLabel(g.writerTeam)} +${r.guessPts}${r.guessPts === 4 ? ' 🎯' : ''}</div>`;
        if (r.counterCorrect !== null && r.counterCorrect !== undefined) {
          const o = g.writerTeam === 'blue' ? 'red' : 'blue';
          html += `<div class="result-pts" style="color:${teamColor(o)}">${teamLabel(o)} +${r.counterPts} ${r.counterCorrect ? '✅' : '❌'}</div>`;
        }
        p(html);
      }
      const b = p(`<button style="width:100%">${g.promptNum >= g.promptTotal ? 'Final scores ▶' : 'Next prompt ▶'}</button>`);
      b.querySelector('button').onclick = () => act('next');
    }
    if (g.phase === 'gameover') {
      if (g.mode === 'coop') {
        const pct = g.maxScore ? g.scores.total / g.maxScore : 0;
        const rank = pct >= .75 ? '🔮 TELEPATHIC' : pct >= .55 ? '🌊 On the same wavelength' : pct >= .35 ? '📡 Getting there' : '📺 Static noise';
        p(`<div class="winner-banner" style="color:var(--band2)">${g.scores.total} / ${g.maxScore}</div>
           <p class="big">${rank}${g.lbRank ? ` · #${g.lbRank} on the leaderboard!` : ''}</p>`);
        const lb = p(`<div class="log" id="wl-lb">loading leaderboard…</div>`);
        fetch('/leaderboard?prompts=' + g.perPlayer).then(r => r.json()).then(d => {
          const rows = d.top.map((e, i) =>
            `<div style="display:flex;justify-content:space-between;${g.lbRank === i + 1 ? 'color:var(--band4);font-weight:700' : ''}"><span>${i + 1}. ${esc(e.name)}</span><span>${e.score}/${e.max}</span></div>`).join('');
          lb.querySelector('#wl-lb').innerHTML = `<b>🏆 Best teams (${d.prompts} prompts each)</b>${rows || '<div>no scores yet</div>'}`;
        }).catch(() => {});
      } else if (g.winner === 'draw') {
        p(`<div class="winner-banner" style="color:var(--band4)">🤝 It's a draw! ${g.scores.blue}–${g.scores.red}</div>`);
      } else {
        p(`<div class="winner-banner" style="color:${teamColor(g.winner)}">🏆 ${teamLabel(g.winner)} team wins ${Math.max(g.scores.blue, g.scores.red)}–${Math.min(g.scores.blue, g.scores.red)}!</div>`);
      }
      p(rematchRow(isHost()));
    }
  }

  GameUI.wavelength = {
    render,
    onDial(pos) {
      if (dragging) return;
      localDial = pos;
      if (S && S.game && dialSVG()) drawDial(S.game.target, localDial);
    },
  };
})();
