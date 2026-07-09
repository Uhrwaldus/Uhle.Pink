// One Night Werewolf — everyone gets a secret role, roles act during one
// night (some cards get swapped!), then the village votes on who to kill.
// Werewolves win if no werewolf dies. 3 extra cards sit in the center.

const NIGHT_ORDER = ['werewolf', 'seer', 'robber', 'troublemaker', 'insomniac'];
const FAST = !!process.env.WW_FAST;
const delay = () => FAST ? 80 : 4000 + Math.random() * 5000;
const DAY_MS = FAST ? 2000 : 5 * 60 * 1000;

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function deckFor(n) {
  // n players + 3 center cards
  const d = ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker'];
  if (n >= 4) d.push('insomniac');
  while (d.length < n + 3) d.push('villager');
  return shuffled(d);
}

function canStart(room) {
  const n = room.players.size;
  if (n < 3) return 'Need at least 3 players for Werewolf';
  if (n > 8) return 'Werewolf plays 3-8 players';
  return null;
}

function create(room) {
  const ids = [...room.players.keys()];
  const deck = deckFor(ids.length);
  const state = {
    phase: 'night', // night | day | vote | reveal
    order: ids,
    rolesInPlay: deck.slice().sort(),
    startCards: {}, cards: {}, center: [],
    nightIdx: -1,
    waitFor: null,      // { role, pids: [awaiting] }
    tmPick: null,       // troublemaker's first pick
    nightInfo: Object.fromEntries(ids.map(id => [id, []])),
    dayEndsAt: null,
    votes: {},
    deaths: [], winner: null, reason: null,
    log: [],
    gen: Math.random(), // guards stale timers
  };
  for (const id of ids) { state.startCards[id] = deck.pop(); }
  state.cards = { ...state.startCards };
  state.center = [deck.pop(), deck.pop(), deck.pop()];
  room.state = state;
  advanceNight(room);
  return state;
}

function nameOf(room, id) { const p = room.players.get(id); return p ? p.name : '?'; }
function holders(s, role) { return s.order.filter(id => s.startCards[id] === role); }

function later(room, fn) {
  const s = room.state;
  const gen = s.gen;
  setTimeout(() => {
    if (room.state !== s || s.gen !== gen) return;
    fn();
    if (room.broadcast) room.broadcast();
  }, delay());
}

function advanceNight(room) {
  const s = room.state;
  s.waitFor = null;
  s.tmPick = null;
  while (true) {
    s.nightIdx += 1;
    if (s.nightIdx >= NIGHT_ORDER.length) { startDay(room); return; }
    const role = NIGHT_ORDER[s.nightIdx];
    const pids = holders(s, role);

    if (role === 'werewolf') {
      if (pids.length >= 2) {
        for (const id of pids) {
          const others = pids.filter(x => x !== id).map(x => nameOf(room, x));
          s.nightInfo[id].push(`🐺 Your fellow werewolf: ${others.join(', ')}`);
        }
        s.log.push('The werewolves opened their eyes…');
        later(room, () => advanceNight(room));
        return;
      }
      if (pids.length === 1) {
        s.nightInfo[pids[0]].push('🐺 You are the only werewolf — you may peek at one center card.');
        s.waitFor = { role, pids: [...pids] };
        s.log.push('The werewolves opened their eyes…');
        return;
      }
      later(room, () => advanceNight(room)); // no wolves among players
      return;
    }
    if (role === 'insomniac') {
      if (pids.length) {
        const id = pids[0];
        s.nightInfo[id].push(`😵‍💫 You wake up holding: ${pretty(s.cards[id])}`);
        s.log.push('The insomniac checked their card…');
      }
      later(room, () => advanceNight(room));
      return;
    }
    // seer / robber / troublemaker
    if (pids.length) {
      s.waitFor = { role, pids: [...pids] };
      s.log.push(`The ${role} stirred…`);
      return;
    }
    later(room, () => advanceNight(room));
    return;
  }
}

function startDay(room) {
  const s = room.state;
  s.phase = 'day';
  s.waitFor = null;
  s.dayEndsAt = Date.now() + DAY_MS;
  s.log.push('☀️ The village wakes. Discuss!');
  const gen = s.gen;
  setTimeout(() => {
    if (room.state !== s || s.gen !== gen) return;
    if (s.phase === 'day') { s.phase = 'vote'; s.log.push('🗳 Time to vote!'); if (room.broadcast) room.broadcast(); }
  }, DAY_MS);
}

function pretty(r) {
  const names = { werewolf: '🐺 Werewolf', seer: '🔮 Seer', robber: '🥷 Robber', troublemaker: '🌀 Troublemaker', insomniac: '😵‍💫 Insomniac', villager: '🧑‍🌾 Villager' };
  return names[r] || r;
}

function myNightTurn(s, player) {
  return s.waitFor && s.waitFor.pids.includes(player.id);
}

function finishActor(room, player) {
  const s = room.state;
  s.waitFor.pids = s.waitFor.pids.filter(id => id !== player.id);
  if (!s.waitFor.pids.length) later(room, () => advanceNight(room));
}

function handleAction(room, player, msg) {
  const s = room.state;
  switch (msg.type) {
    case 'ww_peek': {
      if (!myNightTurn(s, player) || s.waitFor.role !== 'werewolf') return false;
      const i = msg.i;
      if (![0, 1, 2].includes(i)) return false;
      s.nightInfo[player.id].push(`👁 Center card ${i + 1}: ${pretty(s.center[i])}`);
      finishActor(room, player);
      return true;
    }
    case 'seer_player': {
      if (!myNightTurn(s, player) || s.waitFor.role !== 'seer') return false;
      if (!s.order.includes(msg.pid) || msg.pid === player.id) return false;
      s.nightInfo[player.id].push(`🔮 ${nameOf(room, msg.pid)} holds: ${pretty(s.cards[msg.pid])}`);
      finishActor(room, player);
      return true;
    }
    case 'seer_center': {
      if (!myNightTurn(s, player) || s.waitFor.role !== 'seer') return false;
      const idx = shuffled([0, 1, 2]).slice(0, 2).sort();
      for (const i of idx) s.nightInfo[player.id].push(`🔮 Center card ${i + 1}: ${pretty(s.center[i])}`);
      finishActor(room, player);
      return true;
    }
    case 'rob': {
      if (!myNightTurn(s, player) || s.waitFor.role !== 'robber') return false;
      if (!s.order.includes(msg.pid) || msg.pid === player.id) return false;
      const mine = s.cards[player.id];
      s.cards[player.id] = s.cards[msg.pid];
      s.cards[msg.pid] = mine;
      s.nightInfo[player.id].push(`🥷 You robbed ${nameOf(room, msg.pid)} — you now hold: ${pretty(s.cards[player.id])}`);
      finishActor(room, player);
      return true;
    }
    case 'trouble': {
      if (!myNightTurn(s, player) || s.waitFor.role !== 'troublemaker') return false;
      const { a, b } = msg;
      if (!s.order.includes(a) || !s.order.includes(b) || a === b || a === player.id || b === player.id) return false;
      const tmp = s.cards[a];
      s.cards[a] = s.cards[b];
      s.cards[b] = tmp;
      s.nightInfo[player.id].push(`🌀 You swapped ${nameOf(room, a)} ↔ ${nameOf(room, b)} (without looking)`);
      finishActor(room, player);
      return true;
    }
    case 'skip_night': {
      if (!myNightTurn(s, player)) return false;
      s.nightInfo[player.id].push('😴 You chose to do nothing.');
      finishActor(room, player);
      return true;
    }
    case 'call_vote': {
      if (s.phase !== 'day') return false;
      if (player.id !== room.hostId && Date.now() < s.dayEndsAt) return false;
      s.phase = 'vote';
      s.log.push(`🗳 ${nameOf(room, player.id)} called the vote!`);
      return true;
    }
    case 'vote': {
      if (s.phase !== 'vote') return false;
      if (!s.order.includes(msg.pid) || msg.pid === player.id) return false;
      if (s.votes[player.id]) return false;
      s.votes[player.id] = msg.pid;
      if (Object.keys(s.votes).length >= s.order.length) resolve(room);
      return true;
    }
    case 'rematch': {
      if (s.phase !== 'reveal' || player.id !== room.hostId) return false;
      create(room);
      return true;
    }
    default: return false;
  }
}

function resolve(room) {
  const s = room.state;
  const tally = {};
  for (const [voter, target] of Object.entries(s.votes)) {
    tally[target] = (tally[target] || 0) + 1;
    s.log.push(`${nameOf(room, voter)} voted for ${nameOf(room, target)}`);
  }
  const max = Math.max(...Object.values(tally));
  s.deaths = max >= 2 ? Object.keys(tally).filter(id => tally[id] === max) : [];
  for (const id of s.deaths) s.log.push(`☠ ${nameOf(room, id)} was killed (${pretty(s.cards[id])})`);

  const wolves = s.order.filter(id => s.cards[id] === 'werewolf');
  if (wolves.length) {
    const wolfDied = s.deaths.some(id => s.cards[id] === 'werewolf');
    s.winner = wolfDied ? 'village' : 'werewolves';
    s.reason = wolfDied ? 'A werewolf was caught!' : 'The werewolves escaped the vote.';
  } else {
    s.winner = s.deaths.length ? 'werewolves' : 'village';
    s.reason = s.deaths.length
      ? 'Both werewolves were in the center — and the village killed an innocent!'
      : 'Both werewolves were in the center, and nobody died. Well played.';
  }
  s.phase = 'reveal';
}

function viewFor(room, player) {
  const s = room.state;
  const revealed = s.phase === 'reveal';
  return {
    phase: s.phase,
    order: s.order,
    rolesInPlay: s.rolesInPlay,
    startRole: s.startCards[player.id],
    privateInfo: s.nightInfo[player.id],
    yourTurn: s.phase === 'night' && myNightTurn(s, player),
    turnRole: (s.phase === 'night' && myNightTurn(s, player)) ? s.waitFor.role : null,
    dayEndsAt: s.dayEndsAt,
    votesIn: Object.keys(s.votes).length,
    youVoted: !!s.votes[player.id],
    // reveal-only:
    cards: revealed ? s.cards : null,
    startCards: revealed ? s.startCards : null,
    center: revealed ? s.center : null,
    votes: revealed ? s.votes : null,
    deaths: revealed ? s.deaths : [],
    winner: s.winner, reason: s.reason,
    log: revealed ? s.log : [],
    isHost: player.id === room.hostId,
  };
}

module.exports = { canStart, create, handleAction, viewFor };
