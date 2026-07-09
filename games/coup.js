// Coup — bluffing with hidden roles. Last player with influence wins.
const ROLES = ['Duke', 'Assassin', 'Captain', 'Ambassador', 'Contessa'];

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function canStart(room) {
  const n = room.players.size;
  if (n < 3) return 'Need at least 3 players for Coup';
  if (n > 6) return 'Coup plays 3-6 players';
  return null;
}

function create(room) {
  const ids = [...room.players.keys()];
  const deck = shuffled(ROLES.flatMap(r => [r, r, r]));
  const state = {
    phase: 'turn', // turn | reaction | block_reaction | lose | exchange | gameover
    order: ids,
    deck,
    cards: {},     // pid -> [hidden roles]
    dead: {},      // pid -> [revealed roles]
    coins: {},
    currentIdx: 0,
    pending: null, // the action being resolved
    loseQueue: [], // [{who, resume:'action'|'end'|'cancel'}]
    exchangeFor: null,
    winner: null,
    log: [],
  };
  for (const id of ids) {
    state.cards[id] = [deck.pop(), deck.pop()];
    state.dead[id] = [];
    state.coins[id] = 2;
  }
  room.state = state;
  return state;
}

function nameOf(room, id) { const p = room.players.get(id); return p ? p.name : '?'; }
function alive(s) { return s.order.filter(id => s.cards[id].length > 0); }
function current(s) { return s.order[s.currentIdx]; }

const ACTIONS = {
  income:      { cost: 0, role: null,        blockedBy: [] },
  foreign_aid: { cost: 0, role: null,        blockedBy: ['Duke'] },
  coup:        { cost: 7, role: null,        blockedBy: [], target: true },
  tax:         { cost: 0, role: 'Duke',      blockedBy: [] },
  assassinate: { cost: 3, role: 'Assassin',  blockedBy: ['Contessa'], target: true },
  steal:       { cost: 0, role: 'Captain',   blockedBy: ['Captain', 'Ambassador'], target: true },
  exchange:    { cost: 0, role: 'Ambassador', blockedBy: [] },
};

function nextTurn(room) {
  const s = room.state;
  const a = alive(s);
  if (a.length === 1) { s.winner = a[0]; s.phase = 'gameover'; return; }
  do { s.currentIdx = (s.currentIdx + 1) % s.order.length; } while (s.cards[current(s)].length === 0);
  s.pending = null;
  s.phase = 'turn';
}

function queueLoss(room, who, resume) {
  const s = room.state;
  if (s.cards[who].length === 1) {
    // only one card — auto-reveal
    const c = s.cards[who].pop();
    s.dead[who].push(c);
    s.log.push(`${nameOf(room, who)} loses ${c} and is out`);
    afterLoss(room, resume);
  } else {
    s.loseQueue.push({ who, resume });
    s.phase = 'lose';
  }
}

function afterLoss(room, resume) {
  const s = room.state;
  if (alive(s).length === 1) { s.winner = alive(s)[0]; s.phase = 'gameover'; return; }
  if (resume === 'action') executeAction(room);
  else if (resume === 'exchange') beginExchange(room);
  else nextTurn(room);
}

function executeAction(room) {
  const s = room.state;
  const p = s.pending;
  if (!p) return nextTurn(room);
  const A = ACTIONS[p.act];
  const actor = p.actor;
  if (s.cards[actor].length === 0) return nextTurn(room); // actor died during challenge
  switch (p.act) {
    case 'foreign_aid': s.coins[actor] += 2; break;
    case 'tax': s.coins[actor] += 3; break;
    case 'steal': {
      const amt = Math.min(2, s.coins[p.target]);
      s.coins[p.target] -= amt; s.coins[actor] += amt;
      break;
    }
    case 'assassinate': case 'coup': {
      if (s.cards[p.target].length > 0) { queueLoss(room, p.target, 'end'); return; }
      break;
    }
    case 'exchange': { beginExchange(room); return; }
  }
  nextTurn(room);
}

function beginExchange(room) {
  const s = room.state;
  const actor = s.pending.actor;
  s.exchangeFor = { actor, pool: [...s.cards[actor], s.deck.pop(), s.deck.pop()], keep: s.cards[actor].length };
  s.phase = 'exchange';
}

function proveOrDie(room, claimer, role, challenger, onProven, onFailed) {
  const s = room.state;
  const idx = s.cards[claimer].indexOf(role);
  if (idx >= 0) {
    // claimer proves it: return card to deck, draw a new one; challenger loses influence
    s.cards[claimer].splice(idx, 1);
    s.deck = shuffled([...s.deck, role]);
    s.cards[claimer].push(s.deck.pop());
    s.log.push(`${nameOf(room, claimer)} proved ${role}! ${nameOf(room, challenger)} loses influence`);
    queueLoss(room, challenger, onProven);
  } else {
    s.log.push(`${nameOf(room, claimer)} was bluffing ${role}!`);
    queueLoss(room, claimer, onFailed);
  }
}

function handleAction(room, player, msg) {
  const s = room.state;
  if (s.phase === 'gameover') {
    if (msg.type === 'rematch' && player.id === room.hostId) { create(room); return true; }
    return false;
  }
  switch (msg.type) {
    case 'act': {
      if (s.phase !== 'turn' || player.id !== current(s)) return false;
      const A = ACTIONS[msg.act];
      if (!A) return false;
      if (s.coins[player.id] >= 10 && msg.act !== 'coup') return false; // must coup
      if (s.coins[player.id] < A.cost) return false;
      if (A.target && (!alive(s).includes(msg.target) || msg.target === player.id)) return false;
      s.coins[player.id] -= A.cost;
      s.pending = { act: msg.act, actor: player.id, target: msg.target || null, passed: [], block: null };
      s.log.push(`${nameOf(room, player.id)} → ${msg.act.replace('_', ' ')}${msg.target ? ' on ' + nameOf(room, msg.target) : ''}`);
      if (msg.act === 'income') { s.coins[player.id] += 1; nextTurn(room); return true; }
      if (msg.act === 'coup') { executeAction(room); return true; }
      s.phase = 'reaction';
      return true;
    }
    case 'pass': {
      const p = s.pending;
      if (!p) return false;
      if (s.phase === 'reaction') {
        if (player.id === p.actor || p.passed.includes(player.id)) return false;
        p.passed.push(player.id);
        const waiting = alive(s).filter(id => id !== p.actor && !p.passed.includes(id));
        if (waiting.length === 0) executeAction(room);
        return true;
      }
      if (s.phase === 'block_reaction') {
        if (player.id === p.block.by || p.block.passed.includes(player.id)) return false;
        p.block.passed.push(player.id);
        const waiting = alive(s).filter(id => id !== p.block.by && !p.block.passed.includes(id));
        if (waiting.length === 0) { s.log.push('Block stands — action cancelled'); nextTurn(room); }
        return true;
      }
      return false;
    }
    case 'challenge': {
      const p = s.pending;
      if (!p) return false;
      if (s.phase === 'reaction') {
        if (player.id === p.actor) return false;
        const role = ACTIONS[p.act].role;
        if (!role) return false;
        proveOrDie(room, p.actor, role, player.id, 'action', 'end');
        return true;
      }
      if (s.phase === 'block_reaction') {
        if (player.id === p.block.by) return false;
        proveOrDie(room, p.block.by, p.block.role, player.id, 'cancel_action_no', 'action');
        // onProven 'cancel_action_no' -> block held, action cancelled -> nextTurn
        return true;
      }
      return false;
    }
    case 'block': {
      const p = s.pending;
      if (!p || s.phase !== 'reaction') return false;
      const A = ACTIONS[p.act];
      if (!A.blockedBy.includes(msg.role)) return false;
      // foreign aid: anyone may block; targeted actions: only the target
      if (p.act !== 'foreign_aid' && player.id !== p.target) return false;
      if (player.id === p.actor) return false;
      p.block = { by: player.id, role: msg.role, passed: [] };
      s.log.push(`${nameOf(room, player.id)} blocks with ${msg.role}`);
      s.phase = 'block_reaction';
      return true;
    }
    case 'lose_pick': {
      if (s.phase !== 'lose' || !s.loseQueue.length) return false;
      const item = s.loseQueue[0];
      if (player.id !== item.who) return false;
      const idx = s.cards[player.id].indexOf(msg.role);
      if (idx < 0) return false;
      s.cards[player.id].splice(idx, 1);
      s.dead[player.id].push(msg.role);
      s.log.push(`${nameOf(room, player.id)} loses ${msg.role}`);
      s.loseQueue.shift();
      afterLoss(room, item.resume === 'cancel_action_no' ? 'end' : item.resume);
      return true;
    }
    case 'exchange_pick': {
      if (s.phase !== 'exchange' || !s.exchangeFor) return false;
      const ex = s.exchangeFor;
      if (player.id !== ex.actor) return false;
      const picks = msg.roles || [];
      if (picks.length !== ex.keep) return false;
      const pool = [...ex.pool];
      for (const r of picks) {
        const i = pool.indexOf(r);
        if (i < 0) return false;
        pool.splice(i, 1);
      }
      s.cards[ex.actor] = picks;
      s.deck = shuffled([...s.deck, ...pool]);
      s.exchangeFor = null;
      nextTurn(room);
      return true;
    }
    default: return false;
  }
}

// resume value used above: 'cancel_action_no' means block was proven -> action cancelled
function viewFor(room, player) {
  const s = room.state;
  const coins = s.coins, dead = s.dead;
  const counts = {};
  for (const id of s.order) counts[id] = s.cards[id].length;
  return {
    phase: s.phase,
    order: s.order,
    roles: ROLES,
    yourCards: (s.cards[player.id] || []).slice(),
    counts, coins, dead,
    current: current(s),
    pending: s.pending ? {
      act: s.pending.act, actor: s.pending.actor, target: s.pending.target,
      passed: s.pending.passed,
      block: s.pending.block ? { by: s.pending.block.by, role: s.pending.block.role, passed: s.pending.block.passed } : null,
    } : null,
    losePick: s.phase === 'lose' && s.loseQueue.length ? s.loseQueue[0].who : null,
    exchangePool: (s.phase === 'exchange' && s.exchangeFor && s.exchangeFor.actor === player.id) ? s.exchangeFor.pool : null,
    exchangeKeep: s.exchangeFor ? s.exchangeFor.keep : 0,
    winner: s.winner,
    log: s.log.slice(-14),
    actions: ACTIONS,
  };
}

module.exports = { canStart, create, handleAction, viewFor };
