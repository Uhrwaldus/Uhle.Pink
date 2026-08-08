// Wavelength (phase-based).
//   Phase 1 "write": every player gets N spectrum cards, each with a hidden
//     target, and writes a clue for each — everyone at the same time.
//   Phase 2 "guess": the clues are played one at a time. The writer watches;
//     their team (teams mode) or everyone else (co-op) moves the dial.
//
// Scoring bands are equal width around the target:
//   |diff| <= 2 -> 4 pts,  <= 6 -> 3 pts,  <= 10 -> 2 pts
// Every eligible guesser must lock in before the guess resolves; moving the dial
// clears all locks so the group has to re-confirm the new position.
// Teams mode: a non-bullseye guess lets the other team vote left/right for +1.
// The game ends when every prompt has been played; highest score wins.

const BANDS = [[2, 4], [6, 3], [10, 2]];
const PROMPT_OPTIONS = [3, 4, 5];

const PACKS = [
  { id: 'sensory', name: 'Sensory', emoji: '\u{1F321}\uFE0F' },
  { id: 'takes',   name: 'Hot takes', emoji: '\u{1F525}' },
  { id: 'food',    name: 'Food', emoji: '\u{1F355}' },
  { id: 'pop',     name: 'Pop culture', emoji: '\u{1F3AC}' },
  { id: 'life',    name: 'Life & people', emoji: '\u{1F91D}' },
  { id: 'mixed',   name: 'Mixed bag', emoji: '\u{1F3B2}' },
  { id: 'afterdark', name: 'After dark', emoji: '\u{1F336}\uFE0F' },
  { id: 'dansk',   name: 'Dansk', emoji: '\u{1F1E9}\u{1F1F0}' },
];

// Cards grouped by pack. To add one: drop a ['Left', 'Right'] pair into a pack.
// (Ids are derived from the wording, so rewording a card resets its on/off toggle.)
const PACK_CARDS = {
  sensory: [
    ['Hot', 'Cold'], ['Round', 'Pointy'], ['Dry', 'Wet'], ['Loud', 'Quiet'],
    ['Soft', 'Hard'], ['Slow', 'Fast'], ['Fragile', 'Durable'],
    ['Comfortable', 'Uncomfortable'], ['Mild', 'Spicy'],
    ['Smells bad', 'Smells good'], ['Scary', 'Not scary'],
    ['Light', 'Heavy'], ['Smooth', 'Rough'], ['Bright', 'Dark'], ['Sticky', 'Slippery'],
    ['Sharp', 'Blunt'], ['Bitter', 'Sweet'], ['Clean', 'Dirty'], ['Squishy', 'Firm'],
    ['Warm colour', 'Cool colour'], ['Natural sound', 'Artificial sound'],
  ],
  takes: [
    ['Underrated', 'Overrated'], ['Guilty pleasure', 'Openly love it'],
    ['Boring', 'Exciting'], ['Ugly', 'Beautiful'],
    ['Forgettable', 'Unforgettable'], ['Mainstream', 'Niche'],
    ['Overpriced', 'Worth every penny'], ['Cheap', 'Expensive'],
    ['Useless', 'Useful'],
    ['Cringe', 'Cool'], ['Overhyped', 'Lives up to it'], ['Aged badly', 'Aged well'],
    ['Tacky', 'Classy'], ['Annoying', 'Charming'],
    ['Deserves the hate', 'Unfairly hated'], ['Trash', 'Treasure'],
    ['Style over substance', 'Substance over style'], ['Try-hard', 'Effortless'],
    ['Basic', 'Refined'],
  ],
  food: [
    ['Snack', 'Meal'], ['Bad pizza topping', 'Good pizza topping'],
    ['Low calorie', 'High calorie'], ['Vegetable', 'Fruit'],
    ['Sandwich', 'Not a sandwich'], ['Unhealthy', 'Healthy'],
    ['Breakfast food', 'Dinner food'], ['Sweet', 'Savoury'],
    ['Cheap eats', 'Fine dining'], ['Fine cold', 'Must be hot'],
    ['Kids’ food', 'Grown-up food'], ['Good hangover food', 'Bad hangover food'],
    ['Acquired taste', 'Everyone likes it'], ['Beige food', 'Colourful food'],
    ['Comfort food', 'Fancy food'], ['Could eat daily', 'Sick of it by day two'],
  ],
  pop: [
    ['Fantasy', 'Sci-Fi'], ['Villain', 'Hero'], ['Bad movie', 'Good movie'],
    ['Book was better', 'Movie was better'], ['Sad song', 'Happy song'],
    ['Bad superpower', 'Good superpower'],
    ['Guilty pleasure song', 'Objectively great song'],
    ['Kids’ cartoon', 'Adult cartoon'], ['One-hit wonder', 'Legend'],
    ['Bad sequel', 'Good sequel'], ['Watch once', 'Rewatch forever'],
    ['Dated badly', 'Timeless'], ['Anti-hero', 'Pure villain'],
    ['Cult classic', 'Blockbuster'], ['Casual fan', 'Obsessive fan'],
    ['Bad game adaptation', 'Good game adaptation'],
  ],
  life: [
    ['Introvert', 'Extrovert'], ['Job', 'Career'], ['Bad habit', 'Good habit'],
    ['Small talk topic', 'Deep conversation topic'],
    ['Bad first date idea', 'Good first date idea'],
    ['Bad roommate trait', 'Good roommate trait'],
    ['Morning person activity', 'Night owl activity'],
    ['Dog person thing', 'Cat person thing'], ['For kids', 'For adults'],
    ['Casual', 'Formal'], ['Bad gift', 'Good gift'], ['Bad advice', 'Good advice'],
    ['Waste of time', 'Great use of time'], ['Quiet hobby', 'Loud hobby'],
    ['Underpaid', 'Overpaid'], ['Requires luck', 'Requires skill'],
    ['Red flag', 'Green flag'], ['Ick', 'Attractive habit'],
    ['Overthinker move', 'Impulsive move'], ['Cheap date', 'Expensive date'],
    ['Introvert hell', 'Introvert heaven'], ['Chore', 'Hobby'],
    ['Necessary evil', 'Secretly enjoyable'], ['Bad excuse', 'Good excuse'],
    ['Petty', 'Completely justified'], ['Passive-aggressive', 'Direct'],
    ['Sunday activity', 'Friday activity'], ['Boomer thing', 'Gen Z thing'],
    ['Something you brag about', 'Something you hide'], ['Small favour', 'Huge favour'],
    ['Fine to be late for', 'Never be late for'], ['Overshare', 'Fine to share'],
  ],
  mixed: [
    ['Rare', 'Common'], ['Normal', 'Weird'], ['Dangerous', 'Safe'],
    ['Old-fashioned', 'Futuristic'], ['Traditional', 'Modern'],
    ['Temporary', 'Permanent'], ['Hard to spell', 'Easy to spell'],
    ['Historically important', 'Historically irrelevant'],
    ['Feels illegal', 'Feels legal'], ['Easy to kill', 'Hard to kill (a plant)'],
    ['Sport', 'Game'], ['Easy instrument', 'Hard instrument'],
    ['Dies first in an apocalypse', 'Survives the apocalypse'], ['Easy job', 'Hard job'],
    ['Bad dog name', 'Good dog name'], ['Common phobia', 'Rare phobia'],
    ['Easy to fake', 'Hard to fake'], ['Cheap hobby', 'Expensive hobby'],
    ['Overused word', 'Underused word'], ['Sounds fake', 'Sounds real'],
    ['Sounds like a disease', 'Sounds like a country'], ['Bad tattoo', 'Good tattoo'],
    ['Safe to Google at work', 'Never Google at work'], ['Man-made', 'Natural'],
    ['Bad superstition', 'Might actually be true'],
    ['Trivial skill', 'Genuinely impressive skill'],
  ],
  afterdark: [
    ['Innocent', 'Filthy'], ['Sober decision', '3am decision'],
    ['Would regret in the morning', 'Worth every second'],
    ['Would say to your boss', 'Would never say to your boss'],
    ['Fine at a family dinner', 'Absolutely not at a family dinner'],
    ['Mild embarrassment', 'Move to another country'],
    ['Tell your best friend', 'Take it to the grave'],
    ['Bad drunk idea', 'Great drunk idea'], ['Would do for 100 kr', 'Not for 10.000 kr'],
    ['Harmless lie', 'Unforgivable lie'], ['Petty revenge', 'Genuinely evil'],
    ['Everyone has done it', 'Nobody admits it'],
  ],
  dansk: [
    ['Hygge', 'Uhygge'], ['Typisk dansk', 'Slet ikke dansk'],
    ['Jysk', 'Københavnsk'],
    ['Dårligt pålæg', 'Godt pålæg'],
    ['Sommerhus', 'Storbyferie'], ['Noget man siger', 'Noget man kun tænker'],
    ['Vinterting', 'Sommerting'], ['Fredagsting', 'Mandagsting'],
    ['Dårlig undskyldning', 'God undskyldning'],
    ['Noget bedsteforældre elsker', 'Noget børn elsker'],
    ['Dårlig fest', 'God fest'], ['Rugbrød', 'Kage'],
    ['Man kan sige det til chefen', 'Aldrig til chefen'],
    ['Overvurderet', 'Undervurderet'], ['Barnligt', 'Voksent'],
    ['Janteloven', 'Pral løs'],
  ],
};

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Flat catalogue: { id, left, right, pack }
const CARDS = [];
for (const pack of PACKS) {
  for (const [left, right] of PACK_CARDS[pack.id] || []) {
    CARDS.push({ id: slug(left) + '_' + slug(right), left, right, pack: pack.id });
  }
}

// Cards the host has switched off are filtered out; if that leaves nothing,
// fall back to the full set rather than dealing an empty deck.
function allowedCards(room) {
  const off = new Set(Array.isArray(room && room.wlDisabled) ? room.wlDisabled : []);
  const keep = CARDS.filter(c => !off.has(c.id));
  return (keep.length ? keep : CARDS).map(c => [c.left, c.right]);
}

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
  if (!s.deck.length) s.deck = shuffled(s.pool || CARDS.map(c => [c.left, c.right]));
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
  const pool = allowedCards(room);
  const state = {
    mode,
    phase: 'write',
    perPlayer,
    pool,
    scores: mode === 'coop' ? { total: 0 } : { blue: 0, red: 0 },
    deck: shuffled(pool),
    assignments: {},
    queue: [], qi: 0,
    dialPos: 50,
    counterVotes: {}, counterTie: false, counterGuess: null,
    result: null,
    locks: {},
    pins: {},
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

// Players take turns in a fixed rotation: everyone's 1st clue, then everyone's
// 2nd, and so on — so the writer changes every prompt.
function rotate(players, perPlayer) {
  const q = [];
  for (let r = 0; r < perPlayer; r++) for (const p of players) q.push({ pid: p.id, idx: r });
  return q;
}

function buildQueue(room) {
  const s = room.state;
  if (s.mode === 'coop') {
    s.queue = rotate(allPlayers(room), s.perPlayer);
  } else {
    // rotate within each team, then alternate the teams
    const blue = rotate(teamMembers(room, 'blue'), s.perPlayer);
    const red = rotate(teamMembers(room, 'red'), s.perPlayer);
    const first = Math.random() < 0.5 ? blue : red;
    const second = first === blue ? red : blue;
    const q = [];
    for (let i = 0; i < Math.max(first.length, second.length); i++) {
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

// Everyone who is allowed to move the dial must also lock in.
function lockers(room) {
  return allPlayers(room).filter(p => p.connected && canGuess(room, p)).map(p => p.id);
}

function guessPoints(target, pos) {
  const d = Math.abs(target - pos);
  for (const [width, pts] of BANDS) if (d <= width) return pts;
  return 0;
}

// ---- pins -------------------------------------------------------------
// A pin is "here's where I reckon it is" — purely advisory. It never touches
// dialPos and never clears anyone's lock, so people can show an opinion
// without three of them fighting over the one needle.
function pinList(room) {
  const s = room.state;
  if (!s || !s.pins) return [];
  return Object.keys(s.pins)
    .filter(id => room.players.has(id))
    .map(id => ({ id, pos: s.pins[id], name: nameOf(room, id) }));
}

function handlePin(room, player, pos) {
  const s = room.state;
  if (!s || s.phase !== 'guess') return null;
  // same eligibility as the dial: the clue writer never gets to point,
  // and in teams mode only the guessing team shows up on the arc.
  if (!canGuess(room, player)) return null;
  if (pos === null) {
    delete s.pins[player.id];
    return pinList(room);
  }
  if (typeof pos !== 'number' || !isFinite(pos)) return null;
  s.pins[player.id] = Math.max(0, Math.min(100, pos));
  return pinList(room);
}

function handleDial(room, player, pos) {
  const s = room.state;
  if (!canGuess(room, player)) return false;
  if (typeof pos !== 'number' || !isFinite(pos)) return false;
  const next = Math.max(0, Math.min(100, pos));
  // ignore no-op updates: only a real move invalidates the locks
  const moved = Math.abs(next - s.dialPos) > 0.05;
  s.dialPos = next;
  if (!moved) return { resetLocks: false };
  const had = Object.keys(s.locks).length > 0;
  if (had) s.locks = {};
  return { resetLocks: had };
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
      s.locks[player.id] = true;
      const need = lockers(room);
      if (!need.every(id => s.locks[id])) return true; // still waiting on someone
      const c = cur(s);
      const pts = guessPoints(c.target, s.dialPos);
      if (s.mode === 'coop') { applyCoop(room, pts); return true; }
      if (pts === 4) { applyTeams(room, pts, null); return true; }
      s.phase = 'counter';
      return true;
    }
    case 'unlock': {
      if (s.phase !== 'guess' || !s.locks[player.id]) return false;
      delete s.locks[player.id];
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
      advance(room);
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
  s.locks = {};
  s.pins = {};
  s.log.push(`${nameOf(room, writerId(s))}: "${cur(s).clue}" → ${result.guessPts} pt${result.guessPts === 1 ? '' : 's'}${result.counterPts ? ' (+1 counter)' : ''}`);
}

function advance(room) {
  const s = room.state;
  s.qi += 1;
  s.dialPos = 50;
  s.counterVotes = {}; s.counterTie = false; s.counterGuess = null;
  s.result = null;
  s.locks = {};
  s.pins = {};
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
  const need = s.phase === 'guess' ? lockers(room) : [];

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
    pins: s.phase === 'guess' ? pinList(room) : [],
    youCanGuess: canGuess(room, player),
    counterGuess: s.counterGuess,
    counterTie: s.counterTie,
    votesIn: Object.keys(s.counterVotes).length,
    votesNeeded: counterTeam ? teamMembers(room, counterTeam).filter(p => p.connected).length : 0,
    youVoted: !!s.counterVotes[player.id],
    result: revealed ? s.result : null,
    locksIn: need.filter(id => s.locks[id]).length,
    locksNeeded: need.length,
    youLocked: !!s.locks[player.id],
    lockedNames: need.filter(id => s.locks[id]).map(id => nameOf(room, id)),

    winner: s.winner,
    lbRank: s.lbRank || null,
    maxScore: s.queue.length * 4,
    log: s.log.slice(-14),
  };
}

module.exports = { canStart, create, handleAction, handleDial, handlePin, viewFor, PROMPT_OPTIONS, CARDS, PACKS };
