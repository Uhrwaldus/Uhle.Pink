// Codenames (words) — spymasters clue their team to the right tiles.
const WORDS = ('APPLE,BANK,BEACH,BEAR,BELL,BERLIN,BOARD,BOMB,BOOT,BOTTLE,BOW,BOX,BRIDGE,BRUSH,BUG,BUTTON,'
+ 'CANADA,CAPITAL,CARD,CASTLE,CAT,CHAIR,CHARGE,CHEST,CHICKEN,CHURCH,CIRCLE,CLOAK,CLUB,CODE,COLD,COMPOUND,'
+ 'COOK,COPPER,COURT,COVER,CROWN,CYCLE,DANCE,DATE,DAY,DEGREE,DIAMOND,DICE,DOCTOR,DOG,DRAGON,DREAM,DRESS,'
+ 'DRILL,DROP,DUCK,EAGLE,EGYPT,ENGINE,EUROPE,EYE,FACE,FAIR,FALL,FENCE,FIELD,FIGHTER,FILE,FILM,FIRE,FISH,'
+ 'FLUTE,FLY,FOOT,FOREST,FORK,FRANCE,GAME,GAS,GHOST,GIANT,GLASS,GLOVE,GOLD,GRACE,GRASS,GREECE,GREEN,GROUND,'
+ 'HAM,HAND,HAWK,HEAD,HEART,HONEY,HOOD,HOOK,HORN,HORSE,HOSPITAL,HOTEL,ICE,INDIA,IRON,IVORY,JACK,JAM,JET,'
+ 'JUPITER,KANGAROO,KETCHUP,KEY,KID,KING,KIWI,KNIFE,KNIGHT,LAB,LAP,LASER,LAWYER,LEAD,LEMON,LIGHT,LIMOUSINE,'
+ 'LINE,LION,LOCK,LOG,LONDON,LUCK,MAIL,MAMMOTH,MAPLE,MARBLE,MARCH,MASS,MATCH,MERCURY,MEXICO,MICROSCOPE,'
+ 'MILLIONAIRE,MINE,MINT,MISSILE,MODEL,MOLE,MOON,MOSCOW,MOUNT,MOUSE,MOUTH,MUG,NAIL,NEEDLE,NET,NIGHT,NINJA,'
+ 'NOTE,NOVEL,NURSE,NUT,OCTOPUS,OIL,OLIVE,OLYMPUS,OPERA,ORANGE,ORGAN,PALM,PAN,PANTS,PAPER,PARACHUTE,PARK,'
+ 'PART,PASS,PASTE,PENGUIN,PHOENIX,PIANO,PIE,PILOT,PIN,PIPE,PIRATE,PISTOL,PIT,PIZZA,PLANE,PLATE,PLAY,PLOT,'
+ 'POINT,POISON,POLE,POLICE,POOL,PORT,POST,PRINCESS,PUMPKIN,PUPIL,PYRAMID,QUEEN,RABBIT,RACKET,RAY,ROBIN,'
+ 'ROBOT,ROCK,ROME,ROOT,ROSE,ROULETTE,ROUND,ROW,RULER,SATELLITE,SATURN,SCALE,SCHOOL,SCIENTIST,SCORPION,'
+ 'SCREEN,SCUBA,SEAL,SERVER,SHADOW,SHAKESPEARE,SHARK,SHED,SHIP,SHOE,SHOP,SHOT,SINK,SKYSCRAPER,SLIP,SLUG,'
+ 'SMUGGLER,SNOW,SOCK,SOLDIER,SOUL,SOUND,SPACE,SPELL,SPIDER,SPIKE,SPINE,SPOT,SPRING,SPY,SQUARE,STADIUM,'
+ 'STAFF,STAR,STATE,STICK,STOCK,STRAW,STREAM,STRIKE,STRING,SUB,SUIT,SUPERHERO,SWING,SWITCH,TABLE,TABLET,'
+ 'TAG,TAIL,TAP,TEACHER,TELESCOPE,TEMPLE,THEATER,THIEF,THUMB,TICK,TIE,TIME,TOKYO,TOOTH,TORCH,TOWER,TRACK,'
+ 'TRAIN,TRIANGLE,TRIP,TRUNK,TUBE,TURKEY,UNDERTAKER,UNICORN,VACUUM,VAN,VET,WAKE,WALL,WAR,WASHER,WATCH,'
+ 'WATER,WAVE,WEB,WELL,WHALE,WHIP,WIND,WITCH,WORM,YARD').split(',');

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
  const starter = Math.random() < 0.5 ? 'blue' : 'red';
  const words = shuffled(WORDS).slice(0, 25);
  const key = shuffled([
    ...Array(9).fill(starter),
    ...Array(8).fill(starter === 'blue' ? 'red' : 'blue'),
    ...Array(7).fill('neutral'),
    'assassin',
  ]);
  // rotate spymasters between games
  room.cnSpy = room.cnSpy || { blue: -1, red: -1 };
  const spymasters = {};
  for (const t of ['blue', 'red']) {
    const members = teamMembers(room, t);
    room.cnSpy[t] = (room.cnSpy[t] + 1) % members.length;
    spymasters[t] = members[room.cnSpy[t]].id;
  }
  const state = {
    phase: 'clue', // clue | guess | gameover
    words, key,
    revealed: Array(25).fill(null),
    turn: starter,
    clue: null, guessesLeft: 0,
    spymasters,
    winner: null, reason: null,
    log: [],
  };
  room.state = state;
  return state;
}

function nameOf(room, id) { const p = room.players.get(id); return p ? p.name : '?'; }
function remaining(s, team) { return s.key.filter((k, i) => k === team && !s.revealed[i]).length; }

function passTurn(s) {
  s.turn = s.turn === 'blue' ? 'red' : 'blue';
  s.phase = 'clue';
  s.clue = null;
  s.guessesLeft = 0;
}

function handleAction(room, player, msg) {
  const s = room.state;
  switch (msg.type) {
    case 'clue': {
      if (s.phase !== 'clue' || player.id !== s.spymasters[s.turn]) return false;
      const word = String(msg.word || '').trim().slice(0, 20);
      const num = parseInt(msg.num, 10);
      if (!word || !(num >= 0 && num <= 9)) return false;
      s.clue = { word, num };
      s.guessesLeft = num === 0 ? 99 : num + 1;
      s.phase = 'guess';
      s.log.push(`${s.turn.toUpperCase()} clue: "${word}" ${num}`);
      return true;
    }
    case 'pick': {
      if (s.phase !== 'guess') return false;
      if (player.team !== s.turn || player.id === s.spymasters[s.turn]) return false;
      const i = msg.i;
      if (!(i >= 0 && i < 25) || s.revealed[i]) return false;
      const k = s.key[i];
      s.revealed[i] = k;
      s.log.push(`${nameOf(room, player.id)} picked ${s.words[i]} → ${k}`);
      if (k === 'assassin') {
        s.winner = s.turn === 'blue' ? 'red' : 'blue';
        s.reason = 'assassin!';
        s.phase = 'gameover';
        return true;
      }
      for (const t of ['blue', 'red']) {
        if (remaining(s, t) === 0) {
          s.winner = t; s.reason = 'all agents found';
          s.phase = 'gameover';
          return true;
        }
      }
      if (k !== s.turn) { passTurn(s); return true; }
      s.guessesLeft -= 1;
      if (s.guessesLeft <= 0) passTurn(s);
      return true;
    }
    case 'stop': {
      if (s.phase !== 'guess') return false;
      if (player.team !== s.turn || player.id === s.spymasters[s.turn]) return false;
      passTurn(s);
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

function viewFor(room, player) {
  const s = room.state;
  const isSpymaster = player.id === s.spymasters.blue || player.id === s.spymasters.red;
  const over = s.phase === 'gameover';
  return {
    phase: s.phase,
    words: s.words,
    revealed: s.revealed,
    key: (isSpymaster || over) ? s.key : null,
    turn: s.turn,
    clue: s.clue,
    guessesLeft: s.guessesLeft,
    spymasters: s.spymasters,
    isSpymaster,
    remaining: { blue: remaining(s, 'blue'), red: remaining(s, 'red') },
    winner: s.winner, reason: s.reason,
    log: s.log.slice(-5),
  };
}

module.exports = { canStart, create, handleAction, viewFor };
