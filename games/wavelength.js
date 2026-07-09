// Wavelength game logic (teams + co-op).
const WIN_SCORE = 10;
const COOP_ROUND_OPTIONS = [10, 20, 30];
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

function allPlayers(room) {
  return [...room.players.values()];
}

function newTarget() {
  return 13 + Math.floor(Math.random() * 75);
}

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
  const rounds = COOP_ROUND_OPTIONS.includes(room.coopRounds) ? room.coopRounds : 10;
  const state = {
    mode,
    phase: 'clue',
    scores: mode === 'coop' ? { total: 0 } : { blue: 0, red: 0 },
    deck: shuffled(CARDS),
    activeTeam: mode === 'coop' ? null : (Math.random() < 0.5 ? 'blue' : 'red'),
    psychicIdx: { blue: -1, red: -1, all: -1 },
    round: 0,
    totalRounds: mode === 'coop' ? rounds : null,
    recorded: false,
    psychicId: null, card: null, target: null, clue: null,
    dialPos: 50, counterVotes: {}, counterTie: false, counterGuess: null,
    rerolls: { target: false, card: false },
    result: null, winner: null,
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
  s.counterVotes = {};
  s.counterTie = false;
  s.counterGuess = null;
  s.rerolls = { target: false, card: false };
  s.result = null;
  s.card = drawCard(s);
  s.target = newTarget();
  if (s.mode === 'coop') {
    const members = allPlayers(room);
    s.psychicIdx.all = (s.psychicIdx.all + 1) % members.length;
    s.psychicId = members[s.psychicIdx.all].id;
  } else {
    const members = teamMembers(room, s.activeTeam);
    s.psychicIdx[s.activeTeam] = (s.psychicIdx[s.activeTeam] + 1) % members.length;
    s.psychicId = members[s.psychicIdx[s.activeTeam]].id;
  }
}

function guessPoints(target, pos) {
  const d = Math.abs(target - pos);
  for (const [width, pts] of BANDS) if (d <= width) return pts;
  return 0;
}

function otherTeam(t) { return t === 'blue' ? 'red' : 'blue'; }

function canGuess(s, player) {
  if (player.id === s.psychicId) return false;
  if (s.mode === 'coop') return true;
  return player.team === s.activeTeam;
}

function handleDial(room, player, pos) {
  const s = room.state;
  if (s.phase !== 'guess') return false;
  if (!canGuess(s, player)) return false;
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
    case 'reroll_target': {
      if (s.phase !== 'clue' || player.id !== s.psychicId || s.rerolls.target) return false;
      s.target = newTarget();
      s.rerolls.target = true;
      return true;
    }
    case 'reroll_card': {
      if (s.phase !== 'clue' || player.id !== s.psychicId || s.rerolls.card) return false;
      s.card = drawCard(s);
      s.rerolls.card = true;
      return true;
    }
    case 'lock': {
      if (s.phase !== 'guess') return false;
      if (!canGuess(s, player)) return false;
      const pts = guessPoints(s.target, s.dialPos);
      if (s.mode === 'coop') {
        applyCoopScore(room, pts);
      } else if (pts === 4) {
        applyTeamScores(room, pts, null);
      } else {
        s.phase = 'counter';
      }
      return true;
    }
    case 'counter': {
      if (s.mode === 'coop') return false;
      if (s.phase !== 'counter') return false;
      if (player.team !== otherTeam(s.activeTeam)) return false;
      if (msg.dir !== 'left' && msg.dir !== 'right') return false;
      s.counterVotes[player.id] = msg.dir;
      s.counterTie = false;
      const eligible = teamMembers(room, otherTeam(s.activeTeam)).filter(p => p.connected);
      const votes = Object.values(s.counterVotes);
      if (votes.length < Math.max(1, eligible.length)) return true;
      const left = votes.filter(v => v === 'left').length;
      const right = votes.length - left;
      if (left === right) {
        s.counterVotes = {};
        s.counterTie = true;
        return true;
      }
      const dir = left > right ? 'left' : 'right';
      s.counterGuess = dir;
      const pts = guessPoints(s.target, s.dialPos);
      const correct = dir === 'left' ? s.target < s.dialPos : s.target > s.dialPos;
      applyTeamScores(room, pts, correct);
      return true;
    }
    case 'next': {
      if (s.phase !== 'reveal') return false;
      if (s.mode !== 'coop') s.activeTeam = otherTeam(s.activeTeam);
      startRound(room);
      return true;
    }
    case 'rematch': {
      if (s.phase !== 'gameover') return false;
      if (player.id !== room.hostId) return false;
      if (canStart(room)) return false;
      create(room);
      return true;
    }
    default:
      return false;
  }
}

function applyCoopScore(room, pts) {
  const s = room.state;
  s.scores.total += pts;
  s.result = { guessPts: pts, counterPts: 0, counterCorrect: null, target: s.target };
  s.phase = s.round >= s.totalRounds ? 'gameover' : 'reveal';
}

function applyTeamScores(room, guessPts, counterCorrect) {
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

function viewFor(room, player) {
  const s = room.state;
  const revealed = s.phase === 'reveal' || s.phase === 'gameover';
  const isPsychic = player.id === s.psychicId;
  const counterTeam = s.mode === 'teams' ? otherTeam(s.activeTeam) : null;
  return {
    mode: s.mode,
    phase: s.phase,
    scores: s.scores,
    activeTeam: s.activeTeam,
    round: s.round,
    totalRounds: s.totalRounds,
    teamName: room.teamName || null,
    psychicId: s.psychicId,
    card: s.card,
    clue: s.clue,
    dialPos: s.dialPos,
    counterGuess: s.counterGuess,
    counterTie: s.counterTie,
    votesIn: Object.keys(s.counterVotes).length,
    votesNeeded: counterTeam ? teamMembers(room, counterTeam).filter(p => p.connected).length : 0,
    youVoted: !!s.counterVotes[player.id],
    rerolls: s.rerolls,
    result: revealed ? s.result : null,
    winner: s.winner,
    lbRank: s.lbRank || null,
    target: (isPsychic || revealed) ? s.target : null,
    winScore: WIN_SCORE,
    bands: BANDS,
  };
}

module.exports = { canStart, create, handleAction, handleDial, viewFor, COOP_ROUND_OPTIONS };
