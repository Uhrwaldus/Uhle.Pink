// The Resistance client UI
(() => {
  let picks = [];

  function refPanel(g) {
    const rows = [
      ['🕵️', 'Spies', `${g.order.length >= 7 ? 3 : 2}+ hidden spies know each other and sabotage missions.`],
      ['📋', 'Propose', 'The leader picks a mission team. Everyone votes to approve it.'],
      ['🗳', 'Reject', '5 rejected proposals in a row = spies win. Voting has consequences!'],
      ['🎴', 'Mission', 'Team members secretly play success/fail. One fail sinks the mission' + (g.order.length >= 7 ? ' (mission 4 needs two)' : '') + '.'],
      ['🏁', 'Win', 'First to 3 missions: resistance succeeds, spies sabotage.'],
    ];
    return `<div class="side-box ll-ref"><h4>📖 the resistance</h4>` +
      rows.map(([e, n, t]) => `<div class="ref-row" style="--cc:#9aa0b4">
        <div class="ref-v">${e}</div><div class="ref-txt"><b>${n}</b><span>${t}</span></div></div>`).join('') + `</div>`;
  }
  function logPanel(g) {
    return `<div class="side-box ll-log-box"><h4>📜 mission log</h4>
      <div class="entries">${g.log.map(l => `<div>${esc(l)}</div>`).join('')}</div></div>`;
  }
  function missionTrack(g) {
    return `<div style="display:flex;justify-content:center;gap:8px;margin:10px 0">` +
      g.teamSizes.map((size, i) => {
        const m = g.missions[i];
        const bg = m ? (m.success ? 'var(--band2)' : 'var(--red)') : 'var(--panel2)';
        const cur = i === g.missionNum && !m;
        return `<div style="width:44px;height:44px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:800;${cur ? 'outline:2px solid var(--band4)' : ''}" title="mission ${i + 1}">${m ? (m.success ? '✔' : '✘') : size}</div>`;
      }).join('') + `</div>`;
  }

  function render(root, S) {
    const g = S.game;
    if (g.phase !== 'propose') picks = [];
    const isLeader = g.leader === S.you;

    let html = `<div class="scorebar"><div class="pill">🎖 The Resistance</div><div class="pill">rejects: ${g.voteTrack}/5</div></div>`;
    html += missionTrack(g);
    html += g.role === 'spy'
      ? `<p style="text-align:center;color:var(--red);font-weight:700">🕵️ You are a SPY${g.spies ? ' — with ' + g.spies.filter(id => id !== S.you).map(id => esc(playerName(id))).join(', ') : ''}</p>`
      : `<p style="text-align:center;color:var(--band2);font-weight:700">🎖 You are RESISTANCE</p>`;

    if (g.phase === 'propose') {
      html += `<p class="big" style="text-align:center">Mission ${g.missionNum + 1}: <b>${esc(playerName(g.leader))}</b> picks ${g.teamSizes[g.missionNum]} players${g.twoFails ? ' (needs 2 fails to sink!)' : ''}</p>`;
      if (isLeader) {
        html += `<div style="text-align:center">` + g.order.map(id =>
          `<button class="secondary" style="margin:3px;${picks.includes(id) ? 'outline:2px solid var(--band2)' : ''}" data-pick="${id}">${esc(playerName(id))}</button>`).join('') + `</div>
          <button id="rs-propose" style="width:100%;margin-top:8px" ${picks.length === g.teamSizes[g.missionNum] ? '' : 'disabled'}>Propose team (${picks.length}/${g.teamSizes[g.missionNum]})</button>`;
      }
    }
    if (g.phase === 'vote') {
      html += `<p class="big" style="text-align:center">Proposed team: ${g.proposal.map(id => `<span class="pill">${esc(playerName(id))}</span>`).join('')}</p>`;
      if (!g.youVoted) {
        html += `<div class="row"><button id="rs-yes">👍 Approve</button><button id="rs-no" class="red">👎 Reject</button></div>`;
      } else {
        html += `<p style="text-align:center;color:var(--muted)">vote cast ✔ (${g.votesIn}/${g.order.length})</p>`;
      }
    }
    if (g.phase === 'mission') {
      html += `<p class="big" style="text-align:center">Team: ${g.proposal.map(id => `<span class="pill">${esc(playerName(id))}</span>`).join('')}</p>`;
      if (g.onTeam && !g.youPlayed) {
        html += `<p style="text-align:center;color:var(--muted)">play your card in secret:</p><div class="row">
          <button id="rs-success" style="background:var(--band2);color:#12141c">✅ Success</button>
          ${g.role === 'spy' ? `<button id="rs-fail" class="red">💥 Fail</button>` : ''}</div>`;
      } else {
        html += `<p style="text-align:center;color:var(--muted)">${g.onTeam ? 'card played ✔' : 'the team acts in secret…'} (${g.playsIn}/${g.proposal.length})</p>`;
      }
    }
    if (g.phase === 'result' && g.lastMission) {
      const m = g.lastMission;
      html += `<div class="winner-banner" style="color:${m.success ? 'var(--band2)' : 'var(--red)'}">${m.success ? '✅ Mission success!' : '💥 Mission sabotaged!'}</div>
        <p style="text-align:center">${m.fails} fail card${m.fails === 1 ? '' : 's'} played${m.needed === 2 ? ' (2 were needed)' : ''}</p>
        <button id="rs-next" style="width:100%">Next mission ▶</button>`;
    }
    if (g.phase === 'gameover') {
      html += `<div class="winner-banner" style="color:${g.winner === 'resistance' ? 'var(--band2)' : 'var(--red)'}">${g.winner === 'resistance' ? '🎖 The Resistance wins!' : '🕵️ The Spies win!'}</div>
        <p style="text-align:center">${esc(g.reason)}</p>
        <div style="text-align:center;margin:8px 0">${g.order.map(id =>
          `<span class="pill" style="${g.roles[id] === 'spy' ? 'outline:2px solid var(--red)' : ''}">${esc(playerName(id))}: ${g.roles[id] === 'spy' ? '🕵️ spy' : '🎖 resistance'}</span>`).join('')}</div>
        ${rematchRow(isHost())}`;
    }
    if (g.lastVote && (g.phase === 'propose' || g.phase === 'mission')) {
      html += `<p style="text-align:center;font-size:.75rem;color:var(--muted)">last vote: ${Object.entries(g.lastVote.votes).map(([id, v]) => `${esc(playerName(id))} ${v ? '👍' : '👎'}`).join(' · ')}</p>`;
    }

    root.innerHTML = `<div class="ll-layout">${refPanel(g)}<div class="ll-main">${html}</div>${logPanel(g)}</div>`;
    root.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
      const id = b.dataset.pick;
      picks = picks.includes(id) ? picks.filter(x => x !== id) : [...picks, id];
      if (picks.length > g.teamSizes[g.missionNum]) picks.shift();
      render(root, S);
    });
    const pr = root.querySelector('#rs-propose');
    if (pr) pr.onclick = () => act('propose', { team: picks });
    const y = root.querySelector('#rs-yes'), n = root.querySelector('#rs-no');
    if (y) y.onclick = () => act('vote', { approve: true });
    if (n) n.onclick = () => act('vote', { approve: false });
    const su = root.querySelector('#rs-success'), fa = root.querySelector('#rs-fail');
    if (su) su.onclick = () => act('mission_play', { success: true });
    if (fa) fa.onclick = () => act('mission_play', { success: false });
    const nx = root.querySelector('#rs-next');
    if (nx) nx.onclick = () => act('next');
  }
  GameUI.resistance = { render };
})();
