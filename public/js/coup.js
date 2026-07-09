// Coup client UI
(() => {
  let pendingAct = null; // action waiting for a target

  const ROLE_ART = {
    Duke: { e: '🏛️', c: '#b58ff0', t: 'Tax: take 3 coins. Blocks foreign aid.' },
    Assassin: { e: '🗡️', c: '#8fa3c7', t: 'Pay 3 to assassinate a player.' },
    Captain: { e: '⚓', c: '#7fd4c1', t: 'Steal 2 coins. Blocks stealing.' },
    Ambassador: { e: '🤝', c: '#ffd166', t: 'Exchange cards. Blocks stealing.' },
    Contessa: { e: '🌂', c: '#ff8fb3', t: 'Blocks assassination.' },
  };
  function roleFace(r, opts = {}) {
    const a = ROLE_ART[r];
    return `<div class="ll-card${opts.click ? '' : ' static'}" style="--cc:${a.c};min-height:130px;width:96px" ${opts.attr || ''}>
      <div class="llart" style="margin-top:8px">${a.e}</div>
      <div class="llname">${r}</div>
      <div class="lltext">${a.t}</div>
    </div>`;
  }

  function render(root, S) {
    const g = S.game;
    const myTurn = g.current === S.you && g.phase === 'turn';
    if (!myTurn) pendingAct = null;
    const aliveIds = g.order.filter(id => g.counts[id] > 0);

    let html = `<div class="scorebar"><div class="pill">👑 Coup</div><div class="pill">💰 you: ${g.coins[S.you] || 0}</div></div>`;
    html += `<div style="text-align:center;margin:6px 0">` + g.order.map(id => {
      const dead = g.counts[id] === 0;
      return `<span class="pill" style="${dead ? 'opacity:.4;text-decoration:line-through' : ''}${id === g.current ? ';outline:2px solid var(--band2)' : ''}">
        ${esc(playerName(id))} 💰${g.coins[id]} 🂠${g.counts[id]}${g.dead[id].length ? ' ☠' + g.dead[id].join(',☠') : ''}</span>`;
    }).join('') + `</div>`;
    html += `<div style="display:flex;justify-content:center;flex-wrap:wrap">` + g.yourCards.map(r => roleFace(r)).join('') + `</div>`;

    if (g.phase === 'turn' && myTurn && !pendingAct) {
      const c = g.coins[S.you];
      const mustCoup = c >= 10;
      const btn = (a, label, dis) => `<button class="secondary" style="margin:3px" data-act="${a}" ${dis ? 'disabled' : ''}>${label}</button>`;
      html += `<p class="big" style="text-align:center">Your turn:</p><div style="text-align:center">`
        + btn('income', '💵 Income +1', mustCoup)
        + btn('foreign_aid', '💶 Foreign aid +2', mustCoup)
        + btn('tax', '🏛 Tax +3 (Duke)', mustCoup)
        + btn('steal', '🪝 Steal (Captain)', mustCoup)
        + btn('exchange', '🔄 Exchange (Ambassador)', mustCoup)
        + btn('assassinate', '🗡 Assassinate −3 (Assassin)', mustCoup || c < 3)
        + btn('coup', '💥 Coup −7', c < 7)
        + `</div>`;
      if (mustCoup) html += `<p style="text-align:center;color:var(--band4);font-size:.8rem">10+ coins — you must coup</p>`;
    }
    if (g.phase === 'turn' && myTurn && pendingAct) {
      html += `<p class="big" style="text-align:center">${pendingAct} — pick a target:</p><div style="text-align:center">` +
        aliveIds.filter(id => id !== S.you).map(id => `<button class="secondary" style="margin:3px" data-target="${id}">${esc(playerName(id))}</button>`).join('') +
        `</div><button id="cp-cancel" class="secondary" style="width:100%;margin-top:8px">cancel</button>`;
    }
    if (g.phase === 'turn' && !myTurn) {
      html += `<p class="big" style="text-align:center">⏳ ${esc(playerName(g.current))} is choosing…</p>`;
    }

    if ((g.phase === 'reaction' || g.phase === 'block_reaction') && g.pending) {
      const p = g.pending;
      const A = g.actions[p.act];
      if (g.phase === 'reaction') {
        html += `<p class="big" style="text-align:center"><b>${esc(playerName(p.actor))}</b> → ${p.act.replace('_', ' ')}${p.target ? ' on ' + esc(playerName(p.target)) : ''}${A.role ? ` (claims ${A.role})` : ''}</p>`;
        const iCanReact = S.you !== p.actor && g.counts[S.you] > 0 && !p.passed.includes(S.you);
        if (iCanReact) {
          html += `<div style="text-align:center">`;
          if (A.role) html += `<button class="red" style="margin:3px" data-react="challenge">🙅 Challenge</button>`;
          const canBlock = A.blockedBy.length && (p.act === 'foreign_aid' || p.target === S.you);
          if (canBlock) for (const r of A.blockedBy) html += `<button class="secondary" style="margin:3px" data-block="${r}">🛡 Block (${r})</button>`;
          html += `<button class="secondary" style="margin:3px" data-react="pass">👍 Allow</button></div>`;
        } else {
          html += `<p style="text-align:center;color:var(--muted)">waiting for reactions… (${p.passed.length} allowed)</p>`;
        }
      } else {
        const b = p.block;
        html += `<p class="big" style="text-align:center"><b>${esc(playerName(b.by))}</b> blocks with <b>${b.role}</b></p>`;
        const iCanReact = S.you !== b.by && g.counts[S.you] > 0 && !b.passed.includes(S.you);
        if (iCanReact) {
          html += `<div style="text-align:center">
            <button class="red" style="margin:3px" data-react="challenge">🙅 Challenge the block</button>
            <button class="secondary" style="margin:3px" data-react="pass">👍 Accept block</button></div>`;
        } else {
          html += `<p style="text-align:center;color:var(--muted)">waiting…</p>`;
        }
      }
    }

    if (g.phase === 'lose') {
      if (g.losePick === S.you) {
        html += `<p class="big" style="text-align:center;color:var(--red)">You lose influence — pick a card to reveal:</p><div style="display:flex;justify-content:center;flex-wrap:wrap">` +
          g.yourCards.map(r => roleFace(r, { click: true, attr: `data-lose="${r}"` })).join('') + `</div>`;
      } else {
        html += `<p class="big" style="text-align:center">${esc(playerName(g.losePick))} is losing influence…</p>`;
      }
    }
    if (g.phase === 'exchange') {
      if (g.exchangePool) {
        html += `<p class="big" style="text-align:center">Pick ${g.exchangeKeep} to keep:</p><div style="display:flex;justify-content:center;flex-wrap:wrap" id="cp-ex">` +
          g.exchangePool.map((r, i) => roleFace(r, { click: true, attr: `data-ex="${i}" data-role="${r}"` })).join('') + `</div>
          <button id="cp-ex-ok" style="width:100%;margin-top:8px">Confirm</button>`;
      } else {
        html += `<p class="big" style="text-align:center">🔄 exchange in progress…</p>`;
      }
    }
    if (g.phase === 'gameover') {
      html += `<div class="winner-banner" style="color:var(--band4)">👑 ${esc(playerName(g.winner))} rules!</div>${rematchRow(isHost())}`;
    }
    html += `<div class="log">${g.log.map(l => `<div>${esc(l)}</div>`).join('')}</div>`;
    root.innerHTML = html;

    root.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
      const a = b.dataset.act;
      if (g.actions[a].target) { pendingAct = a; render(root, S); }
      else act('act', { act: a });
    });
    root.querySelectorAll('[data-target]').forEach(b => b.onclick = () => {
      act('act', { act: pendingAct, target: b.dataset.target });
      pendingAct = null;
    });
    const cancel = root.querySelector('#cp-cancel');
    if (cancel) cancel.onclick = () => { pendingAct = null; render(root, S); };
    root.querySelectorAll('[data-react]').forEach(b => b.onclick = () => act(b.dataset.react === 'pass' ? 'pass' : 'challenge'));
    root.querySelectorAll('[data-block]').forEach(b => b.onclick = () => act('block', { role: b.dataset.block }));
    root.querySelectorAll('[data-lose]').forEach(b => b.onclick = () => act('lose_pick', { role: b.dataset.lose }));
    const exOk = root.querySelector('#cp-ex-ok');
    if (exOk) {
      root.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => b.classList.toggle('selected') || (b.style.borderColor = b.style.borderColor ? '' : 'var(--band2)'));
      exOk.onclick = () => {
        const picked = [...root.querySelectorAll('[data-ex]')].filter(b => b.style.borderColor).map(b => b.dataset.role);
        if (picked.length !== g.exchangeKeep) return toast(`Pick exactly ${g.exchangeKeep}`);
        act('exchange_pick', { roles: picked });
      };
    }
  }
  GameUI.coup = { render };
})();
