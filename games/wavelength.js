// Wavelength (phase-based).
//   Phase 1 "write": every player gets N spectrum cards, each with a hidden
//     target, and writes a clue for each — everyone at the same time.
//   Phase 2 "guess": the clues are played one at a time. The writer watches;
//     their team (teams mode) or everyone else (co-op) moves the dial.
//
// Scoring bands are equal width around the target:
//   |diff| <= 2 -> 4 pts,  <= 6 -> 3 pts,  <= 10 -> 2 pts
// Teams mode: a non-bullseye guess lets the other team vote left/right for +1.
// The game ends when every prompt has been played; highest score wins.

const BANDS = [[2, 4], [6, 3], [10, 2]];
const PROMPT_OPTIONS = [3, 4, 5];

const CARDS = [
  ['Hot', 'Cold'], ['Underrated', 'Overrated'], ['Scary', 'Not scary'],
  ['Round', 'Pointy'], ['Smells bad', 'Smells good'], ['Rare', 'Common'],
  ['Useless', 'Useful'], ['Guilty pleasure', 'Openly love it'],
  ['Bad habit', 'Good habit'], ['Loud', 'Quiet'], ['Fantasy', 'Sci-Fi'],
  ['Dry', 'Wet'], ['Job', 'Career'], ['Normal', 'Weird'],
  ['Villain', 'Hero'], ['Cheap', 'Expensive'], ['Boring', 'Exciting'],
  ['Dangerous', 'Safe'], ['Old-fashioned', 'Futuristic'], ['Ugly', 'Beautiful'],
  ['Hard to spell', 'Easy to spell'], ['Introvert', 'Extrovert'],
  ['Bad movie', 'Good movie'], ['Underpaid', 'Overpaid'],
  ['Snack', 'Meal'], ['Sport', 'Game'], ['Casual', 'Formal'],
  ['Soft', 'Hard'], ['Small talk topic', 'Deep conversation topic'],
  ['Easy to kill', 'Hard to kill (a plant)'], ['Bad pizza topping', 'Good pizza topping'],
  ['Dog person thing', 'Cat person thing'], ['Overpriced', 'Worth every penny'],
  ['Historically important', 'Historically irrelevant'], ['Low calorie', 'High calorie'],
  ['Bad superpower', 'Good superpower'], ['Mild', 'Spicy'],
  ['Forgettable', 'Unforgettable'], ['Sad song', 'Happy song'],
  ['Requires luck', 'Requires skill'], ['Temporary', 'Permanent'],
  ['Bad gift', 'Good gift'], ['For kids', 'For adults'],
  ['Feels illegal', 'Feels legal'], ['Comfortable', 'Uncomfortable'],
  ['Book was better', 'Movie was better'], ['Morning person activity', 'Night owl activity'],
  ['Bad first date idea', 'Good first date idea'], ['Fragile', 'Durable'],
  ['Traditional', 'Modern'], ['Unhealthy', 'Healthy'], ['Mainstream', 'Niche'],
  ['Bad roommate trait', 'Good roommate trait'], ['Slow', 'Fast'],
  ['Bad advice', 'Good advice'], ['Vegetable', 'Fruit'],
  ['Waste of time', 'Great use of time'], ['Quiet hobby', 'Loud hobby'],
  ['Easy instrument', 'Hard instrument'], ['Sandwich', 'Not a sandwich'],
];

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function teamMembers(room, team) {
  return [...room.players.values()].filter(p => p.team === team);
}
function allPlayers(room) { return [...room.players.values()]; }
function nameOf(room, id) { const p = room.players.get(id); return p ? p.name : '?'; }
function otherTeam(t) { return t === 'blue' ? 'red' : 'blue'; }
function newTarget() { return 12 + Math.floor(Math.random() * 77); } // keeps ±10 on the dial

function drawCard(s) {
  if (!s.deck.length) s.deck = shuffled(CARDS);
  return s.deck.pop();
}

function canStart(room) {
  const mode = room.mode || 'teams';
  if (mode === 'coop') {
    if (allPlayers(room).length < 2) return 'Need at least 2 players for co-op';
    return null;
  }
  const blue = teamMembers(room, 'blue').length;
  const red = teamMembers(room, 'red').length;
  if (blue < 2 || red < 2) return 'Need at least 2 players on each team';
  if (allPlayers(room).some(p => !p.team)) return 'Everyone must pick a team';
  return null;
}

function create(room) {
  const mode = room.mode || 'teams';
  const perPlayer = PROMPT_OPTIONS.includes(room.promptsEach) ? room.promptsEach : 3;
  const state = {
    mode,
    phase: 'write',
    perPlayer,
    scores: mode === 'coop' ? { total: 0 } : { blue: 0, red: 0 },
    deck: shuffled(CARDS),
    assignments: {},
    queue: [], qi: 0,
    dialPos: 50,
    counterVotes: {}, counterTie: false, counterGuess: null,
    result: null,
    nextReady: {},
    winner: null, recorded: false, lbRank: null,
    log: [],
  };
  for (const p of allPlayers(room)) {
    state.assignments[p.id] = Array.from({ length: perPlayer }, () => ({
      card: drawCard(state), target: newTarget(), clue: null,
      rerolls: { target: false, card: false },
    }));
  }
  room.state = state;
  return state;
}

function everyoneWritten(room) {
  const s = room.state;
  return allPlayers(room).every(p => (s.assignments[p.id] || []).every(a => a.clue));
}

function buildQueue(room) {
  const s = room.state;
  const entriesFor = pid => s.assignments[pid].map((_, idx) => ({ pid, idx }));
  if (s.mode === 'coop') {
    s.queue = shuffled(allPlayers(room).flatMap(p => entriesFor(p.id)));
  } else {
    const blue = shuffled(teamMembers(room, 'blue').flatMap(p => entriesFor(p.id)));
    const red = shuffled(teamMembers(room, 'red').flatMap(p => entriesFor(p.id)));
    const first = Math.random() < 0.5 ? blue : red;
    const second = first === blue ? red : blue;
    const q = [];
    const n = Math.max(first.length, second.length);
    for (let i = 0; i < n; i++) {
      if (first[i]) q.push(first[i]);
      if (second[i]) q.push(second[i]);
    }
    s.queue = q;
  }
  s.qi = 0;
  s.phase = 'guess';
  s.log.push(`all clues are in — ${s.queue.length} prompts to play!`);
}

function entry(s) { return s.queue[s.qi] || null; }
function cur(s) {
  const e = entry(s);
  return e ? s.assignments[e.pid][e.idx] : null;
}
function writerId(s) { const e = entry(s); return e ? e.pid : null; }
function writerTeam(room) {
  const p = room.players.get(writerId(room.state));
  return p ? p.team : null;
}
function connectedIds(room) {
  return allPlayers(room).filter(p => p.connected).map(p => p.id);
}

function canGuess(room, player) {
  const s = room.state;
  if (s.phase !== 'guess') return false;
  if (player.id === writerId(s)) return false;
  if (s.mode === 'coop') return true;
  const wt = writerTeam(room);
  const mates = teamMembers(room, wt).filter(p => p.connected && p.id !== writerId(s));
  if (mates.length === 0) return true; // nobody left on that team — anyone may guess
  return player.team === wt;
}

function guessPoints(target, pos) {
  const d = Math.abs(target - pos);
  for (const [width, pts] of BANDS) if (d <= width) return pts;
  return 0;
}

function handleDial(room, player, pos) {
  const s = room.state;
  if (!canGuess(room, player)) return false;
  if (typeof pos !== 'number' || !isFinite(pos)) return false;
  s.dialPos = Math.max(0, Math.min(100, pos));
  return true;
}

function handleAction(room, player, msg) {
  const s = room.state;
  switch (msg.type) {
    case 'clue': {
      if (s.phase !== 'write') return false;
      const list = s.assignments[player.id];
      const i = msg.idx;
      if (!list || !list[i]) return false;
      const clue = String(msg.clue || '').trim().slice(0, 60);
      if (!clue) return false;
      list[i].clue = clue;
      if (everyoneWritten(room)) buildQueue(room);
      return true;
    }
    case 'reroll_target': {
      if (s.phase !== 'write') return false;
      const a = (s.assignments[player.id] || [])[msg.idx];
      if (!a || a.rerolls.target) return false;
      a.target = newTarget();
      a.rerolls.target = true;
      a.clue = null;
      return true;
    }
    case 'reroll_card': {
      if (s.phase !== 'write') return false;
      const a = (s.assignments[player.id] || [])[msg.idx];
      if (!a || a.rerolls.card) return false;
      a.card = drawCard(s);
      a.rerolls.card = true;
      a.clue = null;
      return true;
    }
    case 'lock': {
      if (s.phase !== 'guess' || !canGuess(room, player)) return false;
      const c = cur(s);
      const pts = guessPoints(c.target, s.dialPos);
      if (s.mode === 'coop') { applyCoop(room, pts); return true; }
      if (pts === 4) { applyTeams(room, pts, null); return true; }
      s.phase = 'counter';
      return true;
    }
    case 'counter': {
      if (s.phase !== 'counter' || s.mode === 'coop') return false;
      const opp = otherTeam(writerTeam(room));
      if (player.team !== opp) return false;
      if (msg.dir !== 'left' && msg.dir !== 'right') return false;
      s.counterVotes[player.id] = msg.dir;
      s.counterTie = false;
      const eligible = teamMembers(room, opp).filter(p => p.connected);
      const votes = Object.values(s.counterVotes);
      if (votes.length < Math.max(1, eligible.length)) return true;
      const left = votes.filter(v => v === 'left').length;
      const right = votes.length - left;
      if (left === right) { s.counterVotes = {}; s.counterTie = true; return true; }
      const dir = left > right ? 'left' : 'right';
      s.counterGuess = dir;
      const c = cur(s);
      const pts = guessPoints(c.target, s.dialPos);
      const correct = dir === 'left' ? c.target < s.dialPos : c.target > s.dialPos;
      applyTeams(room, pts, correct);
      return true;
    }
    case 'next': {
      if (s.phase !== 'reveal') return false;
      s.nextReady[player.id] = true;
      const required = connectedIds(room).filter(id => id !== writerId(s));
      if (required.length === 0 || required.every(id => s.nextReady[id])) advance(room);
      return true;
    }
    case 'rematch': {
      if (s.phase !== 'gameover' || player.id !== room.hostId) return false;
      if (canStart(room)) return false;
      create(room);
      return true;
    }
    default: return false;
  }
}

function applyCoop(room, pts) {
  const s = room.state;
  s.scores.total += pts;
  finishPrompt(room, { guessPts: pts, counterPts: 0, counterCorrect: null, target: cur(s).target });
}

function applyTeams(room, guessPts, counterCorrect) {
  const s = room.state;
  const wt = writerTeam(room);
  const counterPts = counterCorrect === true ? 1 : 0;
  s.scores[wt] += guessPts;
  s.scores[otherTeam(wt)] += counterPts;
  finishPrompt(room, { guessPts, counterPts, counterCorrect, target: cur(s).target });
}

function finishPrompt(room, result) {
  const s = room.state;
  s.result = result;
  s.phase = 'reveal';
  s.nextReady = {};
  s.log.push(`${nameOf(room, writerId(s))}: "${cur(s).clue}" → ${result.guessPts} pt${result.guessPts === 1 ? '' : 's'}${result.counterPts ? ' (+1 counter)' : ''}`);
}

function advance(room) {
  const s = room.state;
  s.qi += 1;
  s.dialPos = 50;
  s.counterVotes = {}; s.counterTie = false; s.counterGuess = null;
  s.result = null;
  s.nextReady = {};
  if (s.qi >= s.queue.length) {
    s.phase = 'gameover';
    if (s.mode === 'teams') {
      s.winner = s.scores.blue === s.scores.red ? 'draw' : (s.scores.blue > s.scores.red ? 'blue' : 'red');
    }
    return;
  }
  s.phase = 'guess';
}

function viewFor(room, player) {
  const s = room.state;
  const revealed = s.phase === 'reveal' || s.phase === 'gameover';
  const e = entry(s);
  const c = cur(s);
  const isWriter = !!e && e.pid === player.id;
  const wt = s.mode === 'teams' && e ? writerTeam(room) : null;
  const counterTeam = wt ? otherTeam(wt) : null;
  const required = e ? connectedIds(room).filter(id => id !== e.pid) : [];

  return {
    mode: s.mode,
    phase: s.phase,
    perPlayer: s.perPlayer,
    scores: s.scores,
    teamName: room.teamName || null,
    bands: BANDS,

    yourPrompts: s.phase === 'write'
      ? (s.assignments[player.id] || []).map(a => ({
          card: a.card, target: a.target, clue: a.clue, rerolls: a.rerolls,
        }))
      : null,
    writersDone: s.phase === 'write'
      ? allPlayers(room).filter(p => (s.assignments[p.id] || []).every(a => a.clue)).length
      : 0,
    writersTotal: allPlayers(room).length,
    youDone: s.phase === 'write'
      ? (s.assignments[player.id] || []).every(a => a.clue)
      : true,

    promptNum: s.qi + 1,
    promptTotal: s.queue.length,
    writerId: e ? e.pid : null,
    writerTeam: wt,
    card: c ? c.card : null,
    clue: c ? c.clue : null,
    target: c && (isWriter || revealed) ? c.target : null,
    dialPos: s.dialPos,
    youCanGuess: canGuess(room, player),
    counterGuess: s.counterGuess,
    counterTie: s.counterTie,
    votesIn: Object.keys(s.counterVotes).length,
    votesNeeded: counterTeam ? teamMembers(room, counterTeam).filter(p => p.connected).length : 0,
    youVoted: !!s.counterVotes[player.id],
    result: revealed ? s.result : null,
    readyIn: Object.keys(s.nextReady).filter(id => required.includes(id)).length,
    readyNeeded: required.length,
    youReady: !!s.nextReady[player.id],

    winner: s.winner,
    lbRank: s.lbRank || null,
    maxScore: s.queue.length * 4,
    log: s.log.slice(-14),
  };
}

module.exports = { canStart, create, handleAction, handleDial, viewFor, PROMPT_OPTIONS };
