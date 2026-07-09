// Love Letter — 16-card deduction. Win rounds to collect tokens.
const CARD_DEFS = [
  { v: 1, name: 'Guard', count: 5, text: 'Guess another player\'s card (not Guard). Correct = they\'re out.' },
  { v: 2, name: 'Priest', count: 2, text: 'Secretly look at another player\'s hand.' },
  { v: 3, name: 'Baron', count: 2, text: 'Compare hands with another player. Lower card is out.' },
  { v: 4, name: 'Handmaid', count: 2, text: 'You are protected until your next turn.' },
  { v: 5, name: 'Prince', count: 2, text: 'Choose a player (or yourself) to discard and draw.' },
  { v: 6, name: 'King', count: 1, text: 'Trade hands with another player.' },
  { v: 7, name: 'Countess', count: 1, text: 'Must be played if you hold King or Prince.' },
  { v: 8, name: 'Princess', count: 1, text: 'If you play or discard this, you\'re out.' },
];
const NAME = {}; CARD_DEFS.forEach(c => NAME[c.v] = c.name);

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
  for (const c of CARD_DEFS) for (let i = 0; i < c.count; i++) d.push(c.v);
  return shuffled(d);
}

function tokensToWin(n) { return n === 2 ? 7 : n === 3 ? 5 : 4; }

function canStart(room) {
  const n = room.players.size;
  if (n < 2) return 'Need at least 2 players';
  if (n > 4) return 'Love Letter plays 2-4 players';
  return null;
}

function create(room) {
  const ids = [...room.players.keys()];
  const state = {
    phase: 'turn',
    order: ids,
    tokens: Object.fromEntries(ids.map(id => [id, 0])),
    tokensToWin: tokensToWin(ids.length),
    round: 0,
    starterIdx: -1,
    winner: null, roundWinner: null,
    // round fields set below
    deck: [], burned: null, faceUp: [], hands: {}, discards: {},
    eliminated: {}, protected: {}, current: null, priestPeek: null, log: [],
  };
  room.state = state;
  startRound(room);
  return state;
}

function startRound(room) {
  const s = room.state;
  s.round += 1;
  s.phase = 'turn';
  s.roundWinner = null;
  s.priestPeek = null;
  s.log = [];
  s.deck = fullDeck();
  s.burned = s.deck.pop();
  s.faceUp = s.order.length === 2 ? [s.deck.pop(), s.deck.pop(), s.deck.pop()] : [];
  s.hands = {}; s.discards = {}; s.eliminated = {}; s.protected = {};
  for (const id of s.order) { s.hands[id] = [s.deck.pop()]; s.discards[id] = []; }
  s.starterIdx = (s.starterIdx + 1) % s.order.length;
  s.current = s.order[s.starterIdx];
  s.hands[s.current].push(s.deck.pop()); // current draws
}

function alive(s) { return s.order.filter(id => !s.eliminated[id]); }
function nameOf(room, id) { const p = room.players.get(id); return p ? p.name : '?'; }

function eliminate(room, id, why) {
  const s = room.state;
  s.eliminated[id] = true;
  s.discards[id].push(...s.hands[id]);
  s.hands[id] = [];
  s.log.push(`${nameOf(room, id)} is out (${why})`);
}

function targetable(s, byId) {
  return alive(s).filter(id => id !== byId && !s.protected[id]);
}

function handleAction(room, player, msg) {
  const s = room.state;
  switch (msg.type) {
    case 'play': return play(room, player, msg);
    case 'next': {
      if (s.phase !== 'roundend') return false;
      startRound(room);
      return true;
    }
    case 'rematch': {
      if (s.phase !== 'gameover' || player.id !== room.hostId) return false;
      create(room);
      return true;
    }
    default: return false;
  }
}

function play(room, player, msg) {
  const s = room.state;
  if (s.phase !== 'turn' || player.id !== s.current) return false;
  const hand = s.hands[player.id];
  const card = msg.card;
  if (!hand.includes(card)) return false;
  // Countess rule: holding Countess + (King or Prince) forces Countess
  if (hand.includes(7) && (card === 5 || card === 6)) return false;

  const others = targetable(s, player.id);
  const needsTarget = [1, 2, 3, 6].includes(card) || (card === 5);
  let target = msg.target;
  // no valid opponents -> card fizzles (Prince may still self-target)
  const fizzle = [1, 2, 3, 6].includes(card) && others.length === 0;
  if (!fizzle && needsTarget) {
    const valid = card === 5 ? [...others, player.id] : others;
    if (!valid.includes(target)) return false;
  }

  // discard the played card
  s.hands[player.id] = hand.filter((c, i) => i !== hand.indexOf(card));
  s.discards[player.id].push(card);
  s.protected[player.id] = false;
  s.priestPeek = null;
  s.log.push(`${nameOf(room, player.id)} played ${NAME[card]}`);

  switch (card) {
    case 1: { // Guard
      if (!fizzle) {
        const guess = msg.guess;
        if (!(guess >= 2 && guess <= 8)) return false;
        if (s.hands[target][0] === guess) eliminate(room, target, `Guard guessed ${NAME[guess]}`);
        else s.log.push(`…guessed ${NAME[guess]} on ${nameOf(room, target)} — wrong`);
      }
      break;
    }
    case 2: { // Priest
      if (!fizzle) s.priestPeek = { viewer: player.id, target, card: s.hands[target][0] };
      break;
    }
    case 3: { // Baron
      if (!fizzle) {
        const mine = s.hands[player.id][0], theirs = s.hands[target][0];
        if (mine > theirs) eliminate(room, target, `Baron ${mine} vs ${theirs}`);
        else if (theirs > mine) eliminate(room, player.id, `Baron ${mine} vs ${theirs}`);
        else s.log.push('…Baron tie, nothing happens');
      }
      break;
    }
    case 4: s.protected[player.id] = true; break;
    case 5: { // Prince
      const t = others.length === 0 ? player.id : target;
      const dumped = s.hands[t][0];
      s.discards[t].push(dumped);
      s.hands[t] = [];
      if (dumped === 8) eliminate(room, t, 'discarded the Princess');
      else s.hands[t] = [s.deck.length ? s.deck.pop() : s.burned];
      break;
    }
    case 6: { // King
      if (!fizzle) {
        const tmp = s.hands[player.id];
        s.hands[player.id] = s.hands[target];
        s.hands[target] = tmp;
      }
      break;
    }
    case 7: break;
    case 8: eliminate(room, player.id, 'played the Princess'); break;
  }

  // round over?
  const a = alive(s);
  if (a.length === 1) return endRound(room, a[0], 'last one standing');
  if (s.deck.length === 0) {
    // showdown: highest card wins
    let best = null;
    for (const id of a) {
      const v = s.hands[id][0];
      if (!best || v > best.v) best = { id, v };
    }
    return endRound(room, best.id, `showdown — ${NAME[best.v]} wins`);
  }

  // next player's turn
  let idx = s.order.indexOf(s.current);
  do { idx = (idx + 1) % s.order.length; } while (s.eliminated[s.order[idx]]);
  s.current = s.order[idx];
  s.hands[s.current].push(s.deck.pop());
  return true;
}

function endRound(room, winnerId, why) {
  const s = room.state;
  s.tokens[winnerId] += 1;
  s.roundWinner = winnerId;
  s.log.push(`${nameOf(room, winnerId)} wins the round (${why})`);
  if (s.tokens[winnerId] >= s.tokensToWin) {
    s.winner = winnerId;
    s.phase = 'gameover';
  } else {
    s.phase = 'roundend';
  }
  return true;
}

function viewFor(room, player) {
  const s = room.state;
  const counts = {}, discards = {};
  for (const id of s.order) { counts[id] = s.hands[id].length; discards[id] = s.discards[id]; }
  const over = s.phase === 'roundend' || s.phase === 'gameover';
  return {
    phase: s.phase,
    cardDefs: CARD_DEFS,
    order: s.order,
    tokens: s.tokens,
    tokensToWin: s.tokensToWin,
    round: s.round,
    current: s.current,
    hand: (s.hands[player.id] || []).slice(),
    counts, discards,
    eliminated: s.eliminated,
    protected: s.protected,
    deckLeft: s.deck.length,
    faceUp: s.faceUp,
    priestPeek: (s.priestPeek && s.priestPeek.viewer === player.id) ? s.priestPeek : null,
    log: s.log.slice(-6),
    roundWinner: s.roundWinner,
    winner: s.winner,
    hands: over ? Object.fromEntries(s.order.map(id => [id, s.hands[id]])) : null,
    targetable: targetable(s, player.id),
  };
}

module.exports = { canStart, create, handleAction, viewFor };
