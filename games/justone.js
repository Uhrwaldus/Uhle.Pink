// Just One — co-op. Everyone writes a one-word clue for the guesser;
// duplicate clues cancel each other out. 13 words per game.

const WORDS = ('PIZZA,VAMPIRE,RAINBOW,CIRCUS,PIRATE,CHOCOLATE,VOLCANO,MERMAID,ROBOT,JUNGLE,'
+ 'GUITAR,TORNADO,WIZARD,CASTLE,PENGUIN,SPAGHETTI,GHOST,SUBMARINE,COWBOY,HONEYMOON,'
+ 'AVALANCHE,BUTTERFLY,DINOSAUR,FIREWORKS,IGLOO,KARAOKE,LIGHTHOUSE,MARATHON,NINJA,OASIS,'
+ 'PARACHUTE,QUICKSAND,SAFARI,TELESCOPE,UNICORN,WATERFALL,XYLOPHONE,YOGA,ZOMBIE,AQUARIUM,'
+ 'BIRTHDAY,CAMPFIRE,DETECTIVE,ECLIPSE,FORTUNE,GLACIER,HAMMOCK,INTERNET,JACKPOT,KANGAROO,'
+ 'LULLABY,MUSTACHE,NIGHTMARE,ORCHESTRA,PYRAMID,QUARANTINE,ROLLERCOASTER,SNOWMAN,TREASURE,'
+ 'UMBRELLA,VACATION,WEDDING,SANDCASTLE,BLIZZARD,COMPASS,DRAGON,ELEVATOR,FLAMINGO,GRAVITY,'
+ 'HELICOPTER,ISLAND,JELLYFISH,KEYBOARD,LABYRINTH,MICROSCOPE,NAPKIN,OCTOPUS,PAJAMAS,QUILT,'
+ 'RECIPE,SKELETON,TRAMPOLINE,UNIVERSE,VIOLIN,WHISTLE,YOGURT,ZEPPELIN,BACKPACK,CARNIVAL,'
+ 'DIAMOND,ENGINE,FOUNTAIN,GARDEN,HOSPITAL,ICEBERG,JOURNAL,KITE,LANTERN,MAGNET').split(',');

const ROUNDS = 13;

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
  if (n < 3) return 'Need at least 3 players for Just One';
  if (n > 7) return 'Just One plays 3-7 players';
  return null;
}

function create(room) {
  const ids = [...room.players.keys()];
  const state = {
    phase: 'clue', // clue | guess | result | gameover
    order: ids,
    deck: shuffled(WORDS).slice(0, ROUNDS),
    round: 0,
    totalRounds: ROUNDS,
    score: 0,
    guesserIdx: -1,
    guesserId: null, word: null,
    clues: {}, visibleClues: [], cancelled: [],
    guess: null, correct: null, passed: false,
    log: [],
  };
  room.state = state;
  nextRound(room);
  return state;
}

function nameOf(room, id) { const p = room.players.get(id); return p ? p.name : '?'; }
function norm(w) { return String(w || '').trim().toLowerCase(); }

function nextRound(room) {
  const s = room.state;
  s.round += 1;
  s.phase = 'clue';
  s.word = s.deck.pop();
  s.clues = {};
  s.visibleClues = []; s.cancelled = [];
  s.guess = null; s.correct = null; s.passed = false;
  s.guesserIdx = (s.guesserIdx + 1) % s.order.length;
  s.guesserId = s.order[s.guesserIdx];
}

function handleAction(room, player, msg) {
  const s = room.state;
  switch (msg.type) {
    case 'clue': {
      if (s.phase !== 'clue' || player.id === s.guesserId) return false;
      const w = String(msg.word || '').trim().slice(0, 24).split(/\s+/)[0]; // one word only
      if (!w) return false;
      s.clues[player.id] = w;
      const writers = s.order.filter(id => id !== s.guesserId);
      if (writers.every(id => s.clues[id])) {
        // cancel duplicates and clues too close to the word
        const byNorm = {};
        for (const [pid, clue] of Object.entries(s.clues)) {
          (byNorm[norm(clue)] = byNorm[norm(clue)] || []).push({ pid, clue });
        }
        s.visibleClues = []; s.cancelled = [];
        for (const [n, group] of Object.entries(byNorm)) {
          const tooClose = n === norm(s.word) || n.includes(norm(s.word)) || norm(s.word).includes(n);
          if (group.length > 1 || tooClose) s.cancelled.push(...group.map(g => g.clue));
          else s.visibleClues.push(group[0].clue);
        }
        s.visibleClues = shuffled(s.visibleClues);
        s.phase = 'guess';
      }
      return true;
    }
    case 'guess': {
      if (s.phase !== 'guess' || player.id !== s.guesserId) return false;
      const g = String(msg.word || '').trim().slice(0, 30);
      if (!g) return false;
      s.guess = g;
      s.correct = norm(g) === norm(s.word);
      if (s.correct) s.score += 1;
      s.log.push(`${nameOf(room, player.id)}: "${s.word}" → guessed "${g}" ${s.correct ? '✔' : '✘'}`);
      s.phase = 'result';
      return true;
    }
    case 'pass': {
      if (s.phase !== 'guess' || player.id !== s.guesserId) return false;
      s.passed = true;
      s.log.push(`${nameOf(room, player.id)} passed on "${s.word}"`);
      s.phase = 'result';
      return true;
    }
    case 'override': {
      // the table decides a "wrong" answer was actually right (synonym, typo…)
      if (s.phase !== 'result' || player.id !== room.hostId) return false;
      if (s.correct || s.passed || !s.guess) return false;
      s.correct = true;
      s.score += 1;
      s.log.push(`…the table ruled "${s.guess}" close enough! ✔`);
      return true;
    }
    case 'next': {
      if (s.phase !== 'result') return false;
      if (s.round >= s.totalRounds) { s.phase = 'gameover'; return true; }
      nextRound(room);
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

function viewFor(room, player) {
  const s = room.state;
  const isGuesser = player.id === s.guesserId;
  const showAll = s.phase === 'result' || s.phase === 'gameover';
  const writers = s.order.filter(id => id !== s.guesserId);
  return {
    phase: s.phase,
    order: s.order,
    round: s.round, totalRounds: s.totalRounds,
    score: s.score,
    guesserId: s.guesserId,
    isGuesser,
    word: (isGuesser && !showAll) ? null : s.word,
    yourClue: s.clues[player.id] || null,
    cluesIn: Object.keys(s.clues).length,
    cluesNeeded: writers.length,
    visibleClues: (s.phase === 'guess' || showAll) ? s.visibleClues : [],
    cancelled: showAll ? s.cancelled : [],
    guess: s.guess, correct: s.correct, passed: s.passed,
    log: s.log.slice(-14),
  };
}

module.exports = { canStart, create, handleAction, viewFor };
