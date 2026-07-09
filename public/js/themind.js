// The Mind client UI
(() => {
  function render(root, S) {
    const g = S.game;
    let html = `
      <div class="scorebar">
        <div class="pill">🧠 level ${g.level}/${g.levelsTotal}</div>
        <div class="pill">❤️ ${'♥'.repeat(Math.max(0, g.lives))}</div>
        <div class="pill">🃏 pile: ${g.playedCount}</div>
      </div>
      <div style="text-align:center;margin:14px 0">
        <div style="font-size:.75rem;color:var(--muted)">last played</div>
        <div style="font-size:3rem;font-weight:800;color:var(--band2)">${g.played.length ? g.played[g.played.length - 1] : '—'}</div>
        <div style="color:var(--muted);font-size:.8rem">${g.played.slice(0, -1).join(' · ')}</div>
      </div>`;

    if (g.lastEvent && g.lastEvent.type === 'mistake') {
      html += `<p style="text-align:center;color:var(--red);font-weight:700">💥 ${esc(playerName(g.lastEvent.by))} played ${g.lastEvent.card} — ${g.lastEvent.burned.map(b => b.card).join(', ')} burned! −1 life</p>`;
    }
    if (g.lastEvent && g.lastEvent.type === 'levelup') {
      html += `<p style="text-align:center;color:var(--band2);font-weight:700">⬆️ Level ${g.lastEvent.level}!</p>`;
    }

    html += `<div style="text-align:center;margin:8px 0">` +
      g.order.filter(id => id !== S.you).map(id => `<span class="pill">${esc(playerName(id))}: ${g.counts[id]} cards</span>`).join('') + `</div>`;

    if (g.phase === 'playing') {
      html += `<p style="text-align:center;color:var(--muted);font-size:.85rem">🤫 no talking — play your lowest card when it feels right</p>
        <div style="text-align:center">` +
        g.hand.map(c => `<button class="hand-card" data-card="${c}">${c}</button>`).join('') + `</div>`;
    } else if (g.phase === 'win') {
      html += `<div class="winner-banner" style="color:var(--band2)">🎉 You beat all ${g.levelsTotal} levels!</div>${rematchRow(isHost())}`;
    } else if (g.phase === 'gameover') {
      html += `<div class="winner-banner" style="color:var(--red)">💔 Out of lives at level ${g.level}</div>${rematchRow(isHost())}`;
    }
    root.innerHTML = html;
    root.querySelectorAll('[data-card]').forEach(b => b.onclick = () => act('play', { card: +b.dataset.card }));
  }
  GameUI.themind = { render };
})();
