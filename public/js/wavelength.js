// Wavelength client UI
(() => {
  const CX = 200, CY = 210, R = 185;
  let localDial = 50, dragging = false, lastSent = 0;

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

  function skeleton(root) {
    root.innerHTML = `
      <div class="scorebar">
        <div class="score blue" id="wl-score-blue">0</div>
        <div class="round-info" id="wl-round"></div>
        <div class="score red" id="wl-score-red">0</div>
      </div>
      <div class="spectrum"><span class="left" id="wl-left"></span><span class="right" id="wl-right"></span></div>
      <svg id="wl-dial" viewBox="0 0 400 225" xmlns="http://www.w3.org/2000/svg"></svg>
      <div class="clue-banner" id="wl-clue" style="display:none"><span class="lbl">the clue</span><span id="wl-clue-text"></span></div>
      <div class="phase-box" id="wl-phase"></div>`;
    const svg = root.querySelector('#wl-dial');
    svg.addEventListener('pointerdown', e => {
      if (!canDrag()) return;
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
  function posFrom(e, svg) {
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (400 / rect.width);
    const y = (e.clientY - rect.top) * (400 / rect.width);
    const th = Math.atan2(CY - y, x - CX);
    return Math.max(0, Math.min(100, (1 - Math.max(0, Math.min(Math.PI, th)) / Math.PI) * 100));
  }
  function canDrag() {
    if (!S || !S.game || S.game.phase !== 'guess') return false;
    const g = S.game, m = me();
    if (g.psychicId === S.you) return false;
    return g.mode === 'coop' || m.team === g.activeTeam;
  }
  function moveTo(pos) {
    localDial = pos;
    drawDial();
    const now = Date.now();
    if (now - lastSent > 50) { lastSent = now; socket.emit('dial', { pos }); }
  }

  function drawDial() {
    const g = S.game;
    const svg = document.getElementById('wl-dial');
    if (!svg) return;
    const showT = g.target !== null && g.target !== undefined;
    let els = `<path d="${wedge(0, 100, R)}" fill="#2b3046"/>`;
    if (showT) {
      const t = g.target, clamp = v => Math.max(0, Math.min(100, v));
      const bands = [[t-12,t-8,'var(--band2)','2'],[t-8,t-4,'var(--band3)','3'],[t-4,t+4,'var(--band4)','4'],[t+4,t+8,'var(--band3)','3'],[t+8,t+12,'var(--band2)','2']];
      for (const [a,b,color,label] of bands) {
        const ca = clamp(a), cb = clamp(b);
        if (cb <= ca) continue;
        els += `<path d="${wedge(ca, cb, R)}" fill="${color}"/>`;
        const [lx, ly] = polar((ca+cb)/2, R*0.82);
        els += `<text x="${lx}" y="${ly}" fill="#12141c" font-size="15" font-weight="800" text-anchor="middle">${label}</text>`;
      }
    }
    for (let i = 0; i <= 10; i++) {
      const [x1,y1] = polar(i*10, R), [x2,y2] = polar(i*10, R-8);
      els += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#12141c" stroke-width="2"/>`;
    }
    const [nx, ny] = polar(localDial, R-14);
    els += `<line x1="${CX}" y1="${CY}" x2="${nx}" y2="${ny}" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`;
    els += `<circle cx="${CX}" cy="${CY}" r="10" fill="#fff"/><circle cx="${nx}" cy="${ny}" r="13" fill="#fff" opacity=".9"/>`;
    svg.innerHTML = els;
  }

  function render(root, S) {
    if (!root.querySelector('#wl-dial')) skeleton(root);
    const g = S.game, m = me();
    const isPsychic = g.psychicId === S.you;
    if (!dragging) localDial = g.dialPos;

    if (g.mode === 'coop') {
      root.querySelector('#wl-score-blue').textContent = g.scores.total + ' pts';
      root.querySelector('#wl-score-red').style.display = 'none';
      root.querySelector('#wl-round').innerHTML = `${g.teamName ? esc(g.teamName) + ' · ' : ''}round ${g.round}/${g.totalRounds}`;
    } else {
      root.querySelector('#wl-score-red').style.display = '';
      root.querySelector('#wl-score-blue').textContent = g.scores.blue;
      root.querySelector('#wl-score-red').textContent = g.scores.red;
      root.querySelector('#wl-score-blue').classList.toggle('active-team', g.activeTeam === 'blue');
      root.querySelector('#wl-score-red').classList.toggle('active-team', g.activeTeam === 'red');
      root.querySelector('#wl-round').innerHTML = `round ${g.round} · <span style="color:${teamColor(g.activeTeam)}">${teamLabel(g.activeTeam)}</span> guessing · first to ${g.winScore}`;
    }
    root.querySelector('#wl-left').textContent = '◀ ' + g.card[0];
    root.querySelector('#wl-right').textContent = g.card[1] + ' ▶';
    root.querySelector('#wl-clue').style.display = g.clue ? '' : 'none';
    root.querySelector('#wl-clue-text').textContent = g.clue || '';
    drawDial();

    const box = root.querySelector('#wl-phase');
    box.innerHTML = '';
    const p = html => { const d = document.createElement('div'); d.innerHTML = html; box.appendChild(d); return d; };
    const canD = canDrag();

    if (g.phase === 'clue') {
      if (isPsychic) {
        p(`<p class="big">You're the psychic! 🧠 Give a clue that sits at the target between <b>${esc(g.card[0])}</b> and <b>${esc(g.card[1])}</b>.</p>`);
        const rr = p(`<div class="row" style="margin-bottom:10px">
          <button id="rr-t" class="secondary" ${g.rerolls.target ? 'disabled' : ''}>🎲 New target ${g.rerolls.target ? '(used)' : '(1×)'}</button>
          <button id="rr-c" class="secondary" ${g.rerolls.card ? 'disabled' : ''}>🃏 New card ${g.rerolls.card ? '(used)' : '(1×)'}</button></div>`);
        rr.querySelector('#rr-t').onclick = () => act('reroll_target');
        rr.querySelector('#rr-c').onclick = () => act('reroll_card');
        const w = p(`<input type="text" id="wl-clue-in" placeholder="Your clue…" maxlength="60"><button id="wl-clue-btn" style="width:100%">Submit clue</button>`);
        w.querySelector('#wl-clue-btn').onclick = () => {
          const clue = w.querySelector('#wl-clue-in').value.trim();
          if (!clue) return toast('Write a clue first');
          act('clue', { clue });
        };
      } else {
        p(`<p class="big">🤫 <b>${esc(playerName(g.psychicId))}</b> is thinking of a clue…</p>`);
      }
    }
    if (g.phase === 'guess') {
      if (canD) {
        p(`<p class="big">Drag the dial to where <b>"${esc(g.clue)}"</b> lands. Talk it out!</p>`);
        const b = p(`<button style="width:100%">🔒 Lock it in</button>`);
        b.querySelector('button').onclick = () => { socket.emit('dial', { pos: localDial }); act('lock'); };
      } else if (isPsychic) {
        p(`<p class="big">Your team is guessing… 🤐 no hints!</p><p class="psychic-note">not even facial expressions 👀</p>`);
      } else {
        p(`<p class="big">${teamLabel(g.activeTeam)} team is guessing. Get ready to counter!</p>`);
      }
    }
    if (g.phase === 'counter') {
      if (g.counterTie) p(`<p class="big" style="color:var(--band4)">⚖️ 50/50 tie — talk it over and vote again!</p>`);
      if (m.team !== g.activeTeam) {
        if (g.youVoted) p(`<p class="big">Vote cast ✔ (${g.votesIn}/${g.votesNeeded} in)</p>`);
        else {
          p(`<p class="big">Is the target <b>LEFT</b> or <b>RIGHT</b> of their needle? Majority wins +1. (${g.votesIn}/${g.votesNeeded})</p>`);
          const row = p(`<div class="row"><button id="cl" class="secondary">◀ Left</button><button id="cr" class="secondary">Right ▶</button></div>`);
          row.querySelector('#cl').onclick = () => act('counter', { dir: 'left' });
          row.querySelector('#cr').onclick = () => act('counter', { dir: 'right' });
        }
      } else {
        p(`<p class="big">Locked! Other team is voting left/right… (${g.votesIn}/${g.votesNeeded})</p>`);
      }
    }
    if (g.phase === 'reveal') {
      const r = g.result;
      if (g.mode === 'coop') {
        p(`<div class="result-pts" style="color:var(--band2)">+${r.guessPts} ${r.guessPts === 4 ? '🎯 BULLSEYE!' : r.guessPts > 0 ? '✨' : '💨'}</div>
           <p>team total: <b>${g.scores.total}</b> after ${g.round}/${g.totalRounds}</p>`);
      } else {
        let html = `<div class="result-pts" style="color:${teamColor(g.activeTeam)}">${teamLabel(g.activeTeam)} +${r.guessPts}${r.guessPts === 4 ? ' 🎯' : ''}</div>`;
        if (r.counterCorrect !== null && r.counterCorrect !== undefined) {
          const o = g.activeTeam === 'blue' ? 'red' : 'blue';
          html += `<div class="result-pts" style="color:${teamColor(o)}">${teamLabel(o)} +${r.counterPts} ${r.counterCorrect ? '✅' : '❌'}</div>`;
        }
        p(html);
      }
      const b = p(`<button style="width:100%">Next round ▶</button>`);
      b.querySelector('button').onclick = () => act('next');
    }
    if (g.phase === 'gameover') {
      if (g.mode === 'coop') {
        const max = g.totalRounds * 4, pct = g.scores.total / max;
        const rank = pct >= .75 ? '🔮 TELEPATHIC' : pct >= .55 ? '🌊 On the same wavelength' : pct >= .35 ? '📡 Getting there' : '📺 Static noise';
        p(`<div class="winner-banner" style="color:var(--band2)">${g.scores.total} / ${max}</div><p class="big">${rank}${g.lbRank ? ` · #${g.lbRank} on the leaderboard!` : ''}</p>`);
        const lb = p(`<div class="log" id="wl-lb">loading leaderboard…</div>`);
        fetch('/leaderboard?rounds=' + g.totalRounds).then(r => r.json()).then(d => {
          const rows = d.top.map((e, i) =>
            `<div style="display:flex;justify-content:space-between;${g.lbRank === i + 1 ? 'color:var(--band4);font-weight:700' : ''}"><span>${i + 1}. ${esc(e.name)}</span><span>${e.score}</span></div>`).join('');
          lb.querySelector('#wl-lb').innerHTML = `<b>🏆 Best teams (${d.rounds} turns)</b>${rows || '<div>no scores yet</div>'}`;
        }).catch(() => {});
      } else {
        p(`<div class="winner-banner" style="color:${teamColor(g.winner)}">🏆 ${teamLabel(g.winner)} team wins!</div>`);
      }
      p(rematchRow(isHost()));
    }
  }

  GameUI.wavelength = {
    render,
    onDial(pos) { if (!dragging) { localDial = pos; if (S && S.game && document.getElementById('wl-dial')) drawDial(); } },
  };
})();
