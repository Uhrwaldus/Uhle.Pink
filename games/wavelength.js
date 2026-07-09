// Wavelength game logic.
// Dial positions are 0..100. Scoring bands around the hidden target:
//   |diff| <= 4  -> 4 pts (bullseye)
//   |diff| <= 8  -> 3 pts
//   |diff| <= 12 -> 2 pts
// If the guessing team scores < 4, the other team may counter-guess
// left/right of the guess for 1 pt. First team to 10 wins.

const WIN_SCORE = 10;
const BANDS = [ [4, 4], [8, 3], [12, 2] ];

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

function canStart(room) {
  const blue = teamMembers(room, 'blue').length;
  const red = teamMembers(room, 'red').length;
  if (blue < 2 || red < 2) return 'Need at least 2 players on each team';
  if ([...room.players.values()].some(p => !p.team)) return 'Everyone must pick a team';
  return null;
}

function create(room) {
  const state = {
    phase: 'clue',
    scores: { blue: 0, red: 0 },
    deck: shuffled(CARDS),
    activeTeam: Math.random() < 0.5 ? 'blue' : 'red',
    psychicIdx: { blue: -1, red: -1 },
    round: 0,
    // per-round fields set in startRound:
    psychicId: null, card: null, target: null, clue: null,
    dialPos: 50, counterGuess: null, result: null, winner: null,
  };
  room.state = state;
  startRound(room);
  return state;
}

function startRound(room) {
  const s = room.state;
  s.round += 1;
  s.phase = 'clue';
  s.clue = null;
  s.dialPos = 50;
  s.counterGuess = null;
  s.result = null;
  if (!s.deck.length) s.deck = shuffled(CARDS);
  s.card = s.deck.pop();
  s.target = 13 + Math.floor(Math.random() * 75); // keep full band on the dial
  // Rotate psychic within the active team.
  const members = teamMembers(room, s.activeTeam);
  s.psychicIdx[s.activeTeam] = (s.psychicIdx[s.activeTeam] + 1) % members.length;
  s.psychicId = members[s.psychicIdx[s.activeTeam]].id;
}

function guessPoints(target, pos) {
  const d = Math.abs(target - pos);
  for (const [width, pts] of BANDS) if (d <= width) return pts;
  return 0;
}

function otherTeam(t) { return t === 'blue' ? 'red' : 'blue'; }

function handleDial(room, player, pos) {
  const s = room.state;
  if (s.phase !== 'guess') return false;
  if (player.team !== s.activeTeam || player.id === s.psychicId) return false;
  if (typeof pos !== 'number' || !isFinite(pos)) return false;
  s.dialPos = Math.max(0, Math.min(100, pos));
  return true;
}

function handleAction(room, player, msg) {
  const s = room.state;
  switch (msg.type) {
    case 'clue': {
      if (s.phase !== 'clue' || player.id !== s.psychicId) return false;
      const clue = String(msg.clue || '').trim().slice(0, 60);
      if (!clue) return false;
      s.clue = clue;
      s.phase = 'guess';
      return true;
    }
    case 'lock': {
      if (s.phase !== 'guess') return false;
      if (player.team !== s.activeTeam || player.id === s.psychicId) return false;
      const pts = guessPoints(s.target, s.dialPos);
      if (pts === 4) {
        // Bullseye — no counter-guess possible.
        applyScores(room, pts, null);
      } else {
        s.phase = 'counter';
      }
      return true;
    }
    case 'counter': {
      if (s.phase !== 'counter') return false;
      if (player.team !== otherTeam(s.activeTeam)) return false;
      if (msg.dir !== 'left' && msg.dir !== 'right') return false;
      s.counterGuess = msg.dir;
      const pts = guessPoints(s.target, s.dialPos);
      const correct = msg.dir === 'left' ? s.target < s.dialPos : s.target > s.dialPos;
      applyScores(room, pts, correct);
      return true;
    }
    case 'next': {
      if (s.phase !== 'reveal') return false;
      s.activeTeam = otherTeam(s.activeTeam);
      startRound(room);
      return true;
    }
    case 'rematch': {
      if (s.phase !== 'gameover') return false;
      if (player.id !== room.hostId) return false;
      create(room);
      return true;
    }
    default:
      return false;
  }
}

function applyScores(room, guessPts, counterCorrect) {
  const s = room.state;
  const counterPts = counterCorrect === true ? 1 : 0;
  s.scores[s.activeTeam] += guessPts;
  s.scores[otherTeam(s.activeTeam)] += counterPts;
  s.result = { guessPts, counterPts, counterCorrect, target: s.target };
  if (s.scores.blue >= WIN_SCORE || s.scores.red >= WIN_SCORE) {
    if (s.scores.blue !== s.scores.red) {
      s.winner = s.scores.blue > s.scores.red ? 'blue' : 'red';
      s.phase = 'gameover';
      return;
    }
  }
  s.phase = 'reveal';
}

// Redact the target from everyone except the psychic (until reveal).
function viewFor(room, player) {
  const s = room.state;
  const revealed = s.phase === 'reveal' || s.phase === 'gameover';
  const isPsychic = player.id === s.psychicId;
  return {
    phase: s.phase,
    scores: s.scores,
    activeTeam: s.activeTeam,
    round: s.round,
    psychicId: s.psychicId,
    card: s.card,
    clue: s.clue,
    dialPos: s.dialPos,
    counterGuess: s.counterGuess,
    result: revealed ? s.result : null,
    winner: s.winner,
    target: (isPsychic || revealed) ? s.target : null,
    winScore: WIN_SCORE,
    bands: BANDS,
  };
}

module.exports = { canStart, create, handleAction, handleDial, viewFor };
