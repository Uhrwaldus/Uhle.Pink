// Love Letter (2019 edition) — 21 cards incl. Spy and Chancellor.
// House rule: removed cards are always face-down (1 with 2 players, 2 with 3-4).
const CARD_DEFS = [
  { v: 0, name: 'Spy', count: 2, text: 'No effect. End of round: if you\'re the only player still in who played/discarded a Spy, gain a bonus token.' },
  { v: 1, name: 'Guard', count: 6, text: 'Guess another player\'s card (not Guard). Correct = they\'re out.' },
  { v: 2, name: 'Priest', count: 2, text: 'Secretly look at another player\'s hand.' },
  { v: 3, name: 'Baron', count: 2, text: 'Compare hands with another player. Lower card is out.' },
  { v: 4, name: 'Handmaid', count: 2, text: 'You are protected until your next turn.' },
  { v: 5, name: 'Prince', count: 2, text: 'Choose a player (or yourself) to discard and draw.' },
  { v: 6, name: 'Chancellor', count: 2, text: 'Draw 2 cards. Keep one of your 3, return the rest to the bottom of the deck.' },
  { v: 7, name: 'King', count: 1, text: 'Trade hands with another player.' },
  { v: 8, name: 'Countess', count: 1, text: 'Must be played if you hold King or Prince.' },
  { v: 9, name: 'Princess', count: 1, text: 'If you play or discard this, you\'re out.' },
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

function tokensToWin(n) { return n === 2 ? 6 : n === 3 ? 5 : 4; }

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
    winner: null, roundWinner: null, spyBonus: null,
    deck: [], burned: [], hands: {}, discards: {}, spyPlayed: {},
    eliminated: {}, protected: {}, current: null, priestPeek: null,
    chanc: null, // { pid, options }
    log: [],
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
  s.spyBonus = null;
  s.priestPeek = null;
  s.chanc = null;
  s.log = [];
  s.deck = fullDeck();
  // house rule: always face-down removals — 1 for 2 players, 2 for 3-4
  const burnCount = s.order.length === 2 ? 1 : 2;
  s.burned = s.deck.splice(0, burnCount);
  s.hands = {}; s.discards = {}; s.eliminated = {}; s.protected = {}; s.spyPlayed = {};
  for (const id of s.order) { s.hands[id] = [s.deck.pop()]; s.discards[id] = []; }
  s.starterIdx = (s.starterIdx + 1) % s.order.length;
  s.current = s.order[s.starterIdx];
  s.hands[s.current].push(s.deck.pop()); // current draws
}

function alive(s) { return s.order.filter(id => !s.eliminated[id]); }
function nameOf(room, id) { const p = room.players.get(id); return p ? p.name : '?'; }

function discardCard(s, pid, v) {
  s.discards[pid].push(v);
  if (v === 0) s.spyPlayed[pid] = true;
}

function eliminate(room, id, why) {
  const s = room.state;
  s.eliminated[id] = true;
  for (const v of s.hands[id]) discardCard(s, id, v);
  s.hands[id] = [];
  s.log.push(`${nameOf(room, id)} is out (${why})`);
}

function targetable(s, byId) {
  return alive(s).filter(id => id !== byId && !s.protected[id]);
}

function drawFor(s, pid) {
  if (s.deck.length) s.hands[pid].push(s.deck.pop());
  else if (s.burned.length) s.hands[pid].push(s.burned.pop()); // Prince edge case
}

function handleAction(room, player, msg) {
  const s = room.state;
  switch (msg.type) {
    case 'play': return play(room, player, msg);
    case 'chancellor_keep': {
      if (s.phase !== 'chancellor' || !s.chanc || s.chanc.pid !== player.id) return false;
      const keep = msg.card;
      const idx = s.chanc.options.indexOf(keep);
      if (idx < 0) return false;
      const rest = s.chanc.options.slice();
      rest.splice(idx, 1);
      s.hands[player.id] = [keep];
      s.deck.unshift(...rest); // bottom of the deck
      s.log.push(`${nameOf(room, player.id)} kept a card, returned ${rest.length} to the bottom`);
      s.chanc = null;
      s.phase = 'turn';
      return finishTurn(room);
    }
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
  // Countess rule: holding Countess (8) + King (7) or Prince (5) forces the Countess
  if (hand.includes(8) && (card === 5 || card === 7)) return false;

  const others = targetable(s, player.id);
  const needsTarget = [1, 2, 3, 7].includes(card);
  let target = msg.target;
  const fizzle = needsTarget && others.length === 0;
  if (needsTarget && !fizzle && !others.includes(target)) return false;
  if (card === 5) {
    const valid = [...others, player.id];
    if (!valid.includes(target)) return false;
  }

  // discard the played card
  hand.splice(hand.indexOf(card), 1);
  discardCard(s, player.id, card);
  s.protected[player.id] = false;
  s.priestPeek = null;
  s.log.push(`${nameOf(room, player.id)} played ${NAME[card]}`);

  switch (card) {
    case 0: break; // Spy — no effect now, bonus checked at round end
    case 1: { // Guard
      if (!fizzle) {
        const guess = msg.guess;
        if (!(guess >= 0 && guess <= 9) || guess === 1) return false;
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
      s.hands[t] = [];
      discardCard(s, t, dumped);
      if (dumped === 9) eliminate(room, t, 'discarded the Princess');
      else drawFor(s, t);
      break;
    }
    case 6: { // Chancellor
      if (s.deck.length === 0) { s.log.push('…but the deck is empty, no effect'); break; }
      const drawn = s.deck.splice(-Math.min(2, s.deck.length)).reverse();
      s.chanc = { pid: player.id, options: [...s.hands[player.id], ...drawn] };
      s.hands[player.id] = [];
      s.phase = 'chancellor';
      return true; // turn finishes after chancellor_keep
    }
    case 7: { // King
      if (!fizzle) {
        const tmp = s.hands[player.id];
        s.hands[player.id] = s.hands[target];
        s.hands[target] = tmp;
      }
      break;
    }
    case 8: break; // Countess
    case 9: eliminate(room, player.id, 'played the Princess'); break;
  }
  return finishTurn(room);
}

function finishTurn(room) {
  const s = room.state;
  const a = alive(s);
  if (a.length === 1) return endRound(room, a[0], 'last one standing');
  if (s.deck.length === 0) {
    let best = null;
    for (const id of a) {
      const v = s.hands[id].length ? s.hands[id][0] : -1;
      if (!best || v > best.v) best = { id, v };
    }
    return endRound(room, best.id, `showdown — ${NAME[best.v] || 'nothing'} wins`);
  }
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
  // Spy bonus: exactly one surviving player who played/discarded a Spy
  const spyIds = alive(s).filter(id => s.spyPlayed[id]);
  if (spyIds.length === 1) {
    s.spyBonus = spyIds[0];
    s.tokens[spyIds[0]] += 1;
    s.log.push(`🕵️ ${nameOf(room, spyIds[0])} gets a Spy bonus token`);
  } else {
    s.spyBonus = null;
  }
  const champs = s.order.filter(id => s.tokens[id] >= s.tokensToWin)
    .sort((x, y) => s.tokens[y] - s.tokens[x]);
  if (champs.length) {
    s.winner = champs[0];
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
    burnedCount: s.burned.length,
    priestPeek: (s.priestPeek && s.priestPeek.viewer === player.id) ? s.priestPeek : null,
    chancYou: (s.chanc && s.chanc.pid === player.id) ? s.chanc.options : null,
    chancWho: s.chanc ? s.chanc.pid : null,
    log: s.log.slice(-14),
    roundWinner: s.roundWinner,
    spyBonus: over ? s.spyBonus : null,
    winner: s.winner,
    hands: over ? Object.fromEntries(s.order.map(id => [id, s.hands[id]])) : null,
    targetable: targetable(s, player.id),
  };
}

module.exports = { canStart, create, handleAction, viewFor };
