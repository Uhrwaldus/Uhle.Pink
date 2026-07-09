// The Mind — co-op. Play cards (1-100) in ascending order without talking.
// A mistake (someone still held a lower card) costs a life and burns those cards.

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function levelsFor(n) { return n === 2 ? 12 : n === 3 ? 10 : 8; }

function canStart(room) {
  const n = room.players.size;
  if (n < 2) return 'Need at least 2 players';
  if (n > 4) return 'The Mind plays best with 2-4 players — split up!';
  return null;
}

function create(room) {
  const n = room.players.size;
  const state = {
    phase: 'playing', // playing | gameover | win
    level: 1,
    lives: n,
    levelsTotal: levelsFor(n),
    hands: {},   // pid -> sorted numbers
    played: [],  // ascending pile
    lastEvent: null,
    order: [...room.players.keys()],
  };
  room.state = state;
  deal(room);
  return state;
}

function deal(room) {
  const s = room.state;
  const deck = shuffled(Array.from({ length: 100 }, (_, i) => i + 1));
  s.played = [];
  for (const pid of s.order) s.hands[pid] = deck.splice(0, s.level).sort((a, b) => a - b);
}

function handleAction(room, player, msg) {
  const s = room.state;
  switch (msg.type) {
    case 'play': {
      if (s.phase !== 'playing') return false;
      const hand = s.hands[player.id] || [];
      const card = msg.card;
      if (!hand.includes(card)) return false;
      // remove played card
      s.hands[player.id] = hand.filter(c => c !== card);
      // any lower cards still out there? that's a mistake
      const burned = [];
      for (const pid of s.order) {
        const lower = s.hands[pid].filter(c => c < card);
        if (lower.length) {
          burned.push(...lower.map(c => ({ pid, card: c })));
          s.hands[pid] = s.hands[pid].filter(c => c >= card);
        }
      }
      s.played.push(card);
      if (burned.length) {
        s.lives -= 1;
        s.lastEvent = { type: 'mistake', card, by: player.id, burned };
        if (s.lives <= 0) { s.phase = 'gameover'; return true; }
      } else {
        s.lastEvent = { type: 'played', card, by: player.id };
      }
      // level cleared?
      if (s.order.every(pid => s.hands[pid].length === 0)) {
        if (s.level >= s.levelsTotal) { s.phase = 'win'; return true; }
        s.level += 1;
        // bonus life halfway through
        if (s.level === Math.ceil(s.levelsTotal / 2)) s.lives += 1;
        s.lastEvent = { type: 'levelup', level: s.level };
        deal(room);
      }
      return true;
    }
    case 'rematch': {
      if (s.phase !== 'gameover' && s.phase !== 'win') return false;
      if (player.id !== room.hostId) return false;
      create(room);
      return true;
    }
    default:
      return false;
  }
}

function viewFor(room, player) {
  const s = room.state;
  const counts = {};
  for (const pid of s.order) counts[pid] = s.hands[pid].length;
  return {
    phase: s.phase,
    level: s.level,
    levelsTotal: s.levelsTotal,
    lives: s.lives,
    hand: (s.hands[player.id] || []).slice(),
    counts,
    played: s.played.slice(-8),
    playedCount: s.played.length,
    lastEvent: s.lastEvent,
    order: s.order,
  };
}

module.exports = { canStart, create, handleAction, viewFor };
