// Hanabi — co-op fireworks. You see everyone's cards except your own.
const COLORS = ['red', 'yellow', 'green', 'blue', 'white'];
const COUNTS = { 1: 3, 2: 2, 3: 2, 4: 2, 5: 1 };

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fullDeck() {
  const d = [];
  for (const c of COLORS) for (const [v, n] of Object.entries(COUNTS))
    for (let i = 0; i < n; i++) d.push({ color: c, value: +v });
  return shuffled(d);
}

function canStart(room) {
  const n = room.players.size;
  if (n < 2) return 'Need at least 2 players';
  if (n > 5) return 'Hanabi plays 2-5 players';
  return null;
}

function create(room) {
  const ids = [...room.players.keys()];
  const handSize = ids.length <= 3 ? 5 : 4;
  const deck = fullDeck();
  const state = {
    phase: 'playing', // playing | gameover
    order: ids,
    deck,
    hands: {},      // pid -> [{color, value, hintColor, hintValue}]
    piles: Object.fromEntries(COLORS.map(c => [c, 0])),
    discards: [],
    clues: 8,
    fuses: 3,
    currentIdx: 0,
    finalTurns: null, // countdown after deck empties
    score: null, reason: null,
    log: [],
  };
  for (const id of ids) {
    state.hands[id] = deck.splice(0, handSize).map(c => ({ ...c, hintColor: false, hintValue: false }));
  }
  room.state = state;
  return state;
}

function nameOf(room, id) { const p = room.players.get(id); return p ? p.name : '?'; }
function current(s) { return s.order[s.currentIdx]; }

function endCheck(room) {
  const s = room.state;
  if (s.fuses <= 0) { s.phase = 'gameover'; s.reason = 'The fuse burned out! 💥'; s.score = total(s); return; }
  if (COLORS.every(c => s.piles[c] === 5)) { s.phase = 'gameover'; s.reason = 'Perfect fireworks! 🎆'; s.score = 25; return; }
  if (s.deck.length === 0) {
    if (s.finalTurns === null) s.finalTurns = s.order.length;
  }
}

function total(s) { return COLORS.reduce((sum, c) => sum + s.piles[c], 0); }

function advance(room) {
  const s = room.state;
  if (s.phase !== 'playing') return;
  if (s.finalTurns !== null) {
    s.finalTurns -= 1;
    if (s.finalTurns <= 0) { s.phase = 'gameover'; s.reason = 'Deck empty — final count.'; s.score = total(s); return; }
  }
  s.currentIdx = (s.currentIdx + 1) % s.order.length;
}

function draw(room, pid) {
  const s = room.state;
  if (s.deck.length) s.hands[pid].push({ ...s.deck.pop(), hintColor: false, hintValue: false });
}

function handleAction(room, player, msg) {
  const s = room.state;
  if (s.phase === 'gameover') {
    if (msg.type === 'rematch' && player.id === room.hostId) { create(room); return true; }
    return false;
  }
  if (player.id !== current(s)) return false;
  switch (msg.type) {
    case 'play': {
      const hand = s.hands[player.id];
      if (!(msg.i >= 0 && msg.i < hand.length)) return false;
      const [card] = hand.splice(msg.i, 1);
      if (s.piles[card.color] === card.value - 1) {
        s.piles[card.color] = card.value;
        if (card.value === 5 && s.clues < 8) s.clues += 1;
        s.log.push(`${nameOf(room, player.id)} played ${card.color} ${card.value} ✔`);
      } else {
        s.fuses -= 1;
        s.discards.push(card);
        s.log.push(`${nameOf(room, player.id)} misplayed ${card.color} ${card.value} 💥`);
      }
      draw(room, player.id);
      endCheck(room);
      advance(room);
      return true;
    }
    case 'discard': {
      if (s.clues >= 8) return false;
      const hand = s.hands[player.id];
      if (!(msg.i >= 0 && msg.i < hand.length)) return false;
      const [card] = hand.splice(msg.i, 1);
      s.discards.push(card);
      s.clues += 1;
      s.log.push(`${nameOf(room, player.id)} discarded ${card.color} ${card.value}`);
      draw(room, player.id);
      endCheck(room);
      advance(room);
      return true;
    }
    case 'hint': {
      if (s.clues <= 0) return false;
      const target = msg.pid;
      if (target === player.id || !s.order.includes(target)) return false;
      const hand = s.hands[target];
      let hit = false;
      if (COLORS.includes(msg.color)) {
        for (const c of hand) if (c.color === msg.color) { c.hintColor = true; hit = true; }
        if (!hit) return false;
        s.log.push(`${nameOf(room, player.id)} → ${nameOf(room, target)}: "${msg.color}"`);
      } else if (msg.value >= 1 && msg.value <= 5) {
        for (const c of hand) if (c.value === msg.value) { c.hintValue = true; hit = true; }
        if (!hit) return false;
        s.log.push(`${nameOf(room, player.id)} → ${nameOf(room, target)}: "${msg.value}s"`);
      } else return false;
      s.clues -= 1;
      endCheck(room);
      advance(room);
      return true;
    }
    default: return false;
  }
}

function viewFor(room, player) {
  const s = room.state;
  const hands = {};
  for (const pid of s.order) {
    hands[pid] = s.hands[pid].map(c => pid === player.id
      ? { color: c.hintColor ? c.color : null, value: c.hintValue ? c.value : null, hintColor: c.hintColor, hintValue: c.hintValue }
      : c);
  }
  return {
    phase: s.phase,
    order: s.order,
    colors: COLORS,
    hands,
    piles: s.piles,
    discards: s.discards.slice(-12),
    clues: s.clues,
    fuses: s.fuses,
    deckLeft: s.deck.length,
    current: current(s),
    finalTurns: s.finalTurns,
    score: s.score, reason: s.reason,
    log: s.log.slice(-6),
  };
}

module.exports = { canStart, create, handleAction, viewFor };
