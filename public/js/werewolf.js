// One Night Werewolf client UI
(() => {
  const PRETTY = { werewolf: '🐺 Werewolf', seer: '🔮 Seer', robber: '🥷 Robber', troublemaker: '🌀 Troublemaker', insomniac: '😵‍💫 Insomniac', villager: '🧑‍🌾 Villager' };
  const ART = {
    werewolf: { e: '🐺', c: '#ff5a5f', t: 'Wake with your fellow wolf. Alone? Peek at a center card. Win if no wolf dies.' },
    seer: { e: '🔮', c: '#b58ff0', t: "Look at one player's card, or two center cards." },
    robber: { e: '🥷', c: '#7fd4c1', t: 'Swap your card with a player and look at your new one.' },
    troublemaker: { e: '🌀', c: '#ffd166', t: "Swap two OTHER players' cards without looking." },
    insomniac: { e: '😵‍💫', c: '#f0a35e', t: 'Wake at the end of the night and check your own card.' },
    villager: { e: '🧑‍🌾', c: '#8fa3c7', t: 'No night action. Find the wolves.' },
  };
  let tmFirst = null;
  let timerH = null;

  function face(role, big) {
    const a = ART[role];
    return `<div class="ll-card static" style="--cc:${a.c};${big ? '' : 'min-height:120px;width:92px'}">
      <div class="llart" style="margin-top:6px">${a.e}</div>
      <div class="llname">${PRETTY[role].split(' ')[1]}</div>
      <div class="lltext">${a.t}</div></div>`;
  }
  function refPanel(g) {
    const counts = {};
    g.rolesInPlay.forEach(r => counts[r] = (counts[r] || 0) + 1);
    return `<div class="side-box ll-ref"><h4>📖 in this game (${g.rolesInPlay.length} cards, 3 in center)</h4>` +
      Object.entries(counts).map(([r, n]) => `<div class="ref-row" style="--cc:${ART[r].c}">
        <div class="ref-v">${ART[r].e}${n > 1 ? '×' + n : ''}</div>
        <div class="ref-txt"><b style="color:${ART[r].c}">${PRETTY[r].split(' ')[1]}</b><span>${ART[r].t}</span></div></div>`).join('') +
      `<div class="ref-row" style="--cc:#9aa0b4"><div class="ref-v">🌀</div>
        <div class="ref-txt"><b>Remember</b><span>Cards move at night — you might not be who you think you are! Wolves win if no (current) wolf dies. If both wolves are in the center, the village must kill no one.</span></div></div></div>`;
  }
  function infoFeed(g) {
    if (!g.privateInfo.length) return '';
    return `<div class="side-box" style="margin:10px 0;text-align:left"><h4>🤫 what you know</h4>` +
      g.privateInfo.map(l => `<div style="padding:2px 0">${esc(l)}</div>`).join('') + `</div>`;
  }
  function playerBtns(g, attr, excludeSelf = true) {
    return g.order.filter(id => !excludeSelf || id !== S.you)
      .map(id => `<button class="secondary" style="margin:3px" ${attr}="${id}">${esc(playerName(id))}</button>`).join('');
  }
  function fmt(ms) {
    if (ms < 0) ms = 0;
    return `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
  }

  function render(root, S) {
    const g = S.game;
    clearInterval(timerH);
    if (g.phase !== 'night') tmFirst = null;
    let html = `<div class="scorebar"><div class="pill">🐺 One Night Werewolf</div>` +
      (g.phase === 'day' ? `<div class="pill" id="ww-timer">${fmt(g.dayEndsAt - Date.now())}</div>` : `<div class="pill">${g.phase}</div>`) + `</div>`;

    if (g.phase !== 'reveal') {
      html += `<div style="display:flex;justify-content:center;align-items:center;gap:12px;margin:8px 0">
        <div style="text-align:center"><div style="font-size:.7rem;color:var(--muted)">your card (at nightfall)</div>${face(g.startRole, true)}</div></div>`;
      html += infoFeed(g);
    }

    if (g.phase === 'night') {
      if (g.yourTurn) {
        const r = g.turnRole;
        if (r === 'werewolf') {
          html += `<p class="big" style="text-align:center">🐺 Lone wolf — peek at a center card:</p><div style="text-align:center">
            ${[0,1,2].map(i => `<button class="secondary" style="margin:3px" data-peek="${i}">card ${i + 1}</button>`).join('')}
            <button class="secondary" style="margin:3px" id="ww-skip">skip</button></div>`;
        } else if (r === 'seer') {
          html += `<p class="big" style="text-align:center">🔮 Seer — look at:</p><div style="text-align:center">
            ${playerBtns(g, 'data-seer')}
            <button class="secondary" style="margin:3px" id="ww-seer-center">two center cards</button>
            <button class="secondary" style="margin:3px" id="ww-skip">skip</button></div>`;
        } else if (r === 'robber') {
          html += `<p class="big" style="text-align:center">🥷 Robber — swap cards with:</p><div style="text-align:center">
            ${playerBtns(g, 'data-rob')}
            <button class="secondary" style="margin:3px" id="ww-skip">skip</button></div>`;
        } else if (r === 'troublemaker') {
          html += `<p class="big" style="text-align:center">🌀 Troublemaker — pick two players to swap${tmFirst ? ` (first: ${esc(playerName(tmFirst))})` : ''}:</p><div style="text-align:center">
            ${g.order.filter(id => id !== S.you && id !== tmFirst).map(id => `<button class="secondary" style="margin:3px" data-tm="${id}">${esc(playerName(id))}</button>`).join('')}
            <button class="secondary" style="margin:3px" id="ww-skip">skip</button></div>`;
        }
      } else {
        html += `<p class="big" style="text-align:center">🌙 The village sleeps… roles are acting in the dark.</p>
          <p style="text-align:center;color:var(--muted);font-size:.85rem">night order: 🐺 → 🔮 → 🥷 → 🌀 → 😵‍💫</p>`;
      }
    }

    if (g.phase === 'day') {
      html += `<p class="big" style="text-align:center">☀️ Discuss! Who is a werewolf <i>now</i>?</p>
        <p style="text-align:center;color:var(--muted);font-size:.85rem">talk on your call — bluff, claim roles, compare stories</p>`;
      if (g.isHost || g.dayEndsAt < Date.now()) html += `<button id="ww-callvote" class="red" style="width:100%;margin-top:8px">🗳 Call the vote</button>`;
    }

    if (g.phase === 'vote') {
      if (!g.youVoted) {
        html += `<p class="big" style="text-align:center">🗳 Vote to eliminate (${g.votesIn}/${g.order.length} in):</p>
          <div style="text-align:center">${playerBtns(g, 'data-vote')}</div>`;
      } else {
        html += `<p class="big" style="text-align:center">Vote cast ✔ — waiting (${g.votesIn}/${g.order.length})</p>`;
      }
    }

    if (g.phase === 'reveal') {
      html += `<div class="winner-banner" style="color:${g.winner === 'village' ? 'var(--band2)' : 'var(--red)'}">${g.winner === 'village' ? '🎉 Village wins!' : '🐺 Werewolves win!'}</div>
        <p style="text-align:center">${esc(g.reason)}</p>
        <div style="text-align:center;margin:8px 0">` +
        g.order.map(id => {
          const moved = g.startCards[id] !== g.cards[id];
          const died = g.deaths.includes(id);
          return `<div class="pill" style="${died ? 'outline:2px solid var(--red)' : ''}">
            ${esc(playerName(id))}: ${PRETTY[g.startCards[id]]}${moved ? ' → ' + PRETTY[g.cards[id]] : ''}${died ? ' ☠' : ''}</div>`;
        }).join('') +
        `</div><p style="text-align:center;color:var(--muted)">center: ${g.center.map(r => PRETTY[r]).join(' · ')}</p>
        ${rematchRow(isHost())}`;
    }

    const logHtml = g.phase === 'reveal'
      ? `<div class="side-box ll-log-box"><h4>📜 what happened</h4><div class="entries">${g.log.map(l => `<div>${esc(l)}</div>`).join('')}</div></div>`
      : `<div class="side-box ll-log-box"><h4>📜 log</h4><div class="entries"><div>revealed after the vote…</div></div></div>`;
    root.innerHTML = `<div class="ll-layout">${refPanel(g)}<div class="ll-main">${html}</div>${logHtml}</div>`;

    root.querySelectorAll('[data-peek]').forEach(b => b.onclick = () => act('ww_peek', { i: +b.dataset.peek }));
    root.querySelectorAll('[data-seer]').forEach(b => b.onclick = () => act('seer_player', { pid: b.dataset.seer }));
    const sc = root.querySelector('#ww-seer-center');
    if (sc) sc.onclick = () => act('seer_center');
    root.querySelectorAll('[data-rob]').forEach(b => b.onclick = () => act('rob', { pid: b.dataset.rob }));
    root.querySelectorAll('[data-tm]').forEach(b => b.onclick = () => {
      if (!tmFirst) { tmFirst = b.dataset.tm; render(root, S); }
      else { act('trouble', { a: tmFirst, b: b.dataset.tm }); tmFirst = null; }
    });
    const skip = root.querySelector('#ww-skip');
    if (skip) skip.onclick = () => { tmFirst = null; act('skip_night'); };
    const cv = root.querySelector('#ww-callvote');
    if (cv) cv.onclick = () => act('call_vote');
    root.querySelectorAll('[data-vote]').forEach(b => b.onclick = () => act('vote', { pid: b.dataset.vote }));

    const t = root.querySelector('#ww-timer');
    if (t) timerH = setInterval(() => {
      const left = g.dayEndsAt - Date.now();
      t.textContent = fmt(left);
      if (left <= 0) clearInterval(timerH);
    }, 1000);
  }
  GameUI.werewolf = { render };
})();
