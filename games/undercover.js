// Undercover — most players share a secret word, undercovers got a similar
// one, Mr. White got nothing. Describe, deduce, vote. Mr. White can steal the
// win by guessing the civilian word when eliminated.

const PAIRS = [
  ['Coffee', 'Tea'], ['Cat', 'Dog'], ['Beach', 'Desert'], ['Pizza', 'Burger'],
  ['Guitar', 'Violin'], ['Ship', 'Submarine'], ['Butter', 'Margarine'],
  ['Hotel', 'Hostel'], ['Football', 'Handball'], ['Apple', 'Pear'],
  ['Snow', 'Ice'], ['Moon', 'Sun'], ['Pirate', 'Viking'], ['Wizard', 'Witch'],
  ['Bicycle', 'Motorcycle'], ['Soup', 'Porridge'], ['King', 'Emperor'],
  ['Bee', 'Wasp'], ['Lake', 'River'], ['Sofa', 'Armchair'], ['Train', 'Tram'],
  ['Book', 'Magazine'], ['Rain', 'Hail'], ['Cinema', 'Theater'],
  ['Whiskey', 'Rum'], ['Pancake', 'Waffle'], ['Doctor', 'Nurse'],
  ['Prison', 'Zoo'], ['Ladder', 'Stairs'], ['Beard', 'Mustache'],
  ['Christmas', 'Easter'], ['Chess', 'Checkers'], ['Piano', 'Organ'],
  ['Tent', 'Caravan'], ['Squirrel', 'Rat'], ['Helicopter', 'Airplane'],
  ['Honey', 'Jam'], ['Boxing', 'Wrestling'], ['Vampire', 'Zombie'],
  ['Castle', 'Palace'], ['Salt', 'Sugar'], ['Mirror', 'Window'],
  ['Police', 'Security guard'], ['Sushi', 'Sashimi'], ['Twins', 'Clones'],
  ['Birthday', 'Wedding'], ['Socks', 'Gloves'], ['Painter', 'Sculptor'],
  ['Island', 'Peninsula'], ['Teacher', 'Professor'], ['Milk', 'Cream'],
  ['Dream', 'Memory'], ['Spider', 'Scorpion'], ['Karaoke', 'Concert'],
  ['Sauna', 'Hot tub'], ['Camping', 'Picnic'], ['Diamond', 'Pearl'],
];

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function roleCounts(n) {
  const uc = n <= 6 ? 1 : n <= 8 ? 2 : 3;
  const white = n >= 5 ? 1 : 0;
  return { uc, white };
}

function canStart(room) {
  const n = room.players.size;
  if (n < 3) return 'Need at least 3 players for Undercover';
  if (n > 10) return 'Undercover plays 3-10 players';
  return null;
}

function create(room) {
  const ids = [...room.players.keys()];
  const { uc, white } = roleCounts(ids.length);
  const pair = shuffled(PAIRS)[0];
  const flip = Math.random() < 0.5;
  const civWord = flip ? pair[0] : pair[1];
  const ucWord = flip ? pair[1] : pair[0];
  const bag = shuffled(ids);
  const roles = {};
  bag.forEach((id, i) => {
    roles[id] = i < uc ? 'undercover' : i < uc + white ? 'white' : 'civilian';
  });
  const state = {
    phase: 'describe', // describe | vote | whiteguess | gameover
    order: ids,
    roles, civWord, ucWord,
    alive: Object.fromEntries(ids.map(id => [id, true])),
    round: 0,
    descOrder: [], turnIdx: 0,
    descriptions: [],
    votes: {},
    pendingWhite: null,
    eliminatedRoles: {},
    winner: null, reason: null,
    log: [],
  };
  room.state = state;
  newRound(room);
  return state;
}

function nameOf(room, id) { const p = room.players.get(id); return p ? p.name : '?'; }
function aliveIds(s) { return s.order.filter(id => s.alive[id]); }
function infiltrators(s) { return aliveIds(s).filter(id => s.roles[id] !== 'civilian'); }

function newRound(room) {
  const s = room.state;
  s.round += 1;
  s.phase = 'describe';
  s.votes = {};
  s.turnIdx = 0;
  s.descOrder = shuffled(aliveIds(s));
  // Mr. White never describes first
  if (s.roles[s.descOrder[0]] === 'white' && s.descOrder.length > 1) {
    [s.descOrder[0], s.descOrder[1]] = [s.descOrder[1], s.descOrder[0]];
  }
  s.log.push(`— round ${s.round}: describe your word —`);
}

function checkWin(room) {
  const s = room.state;
  if (infiltrators(s).length === 0) {
    s.winner = 'civilians';
    s.reason = 'All infiltrators found!';
    s.phase = 'gameover';
    return true;
  }
  if (aliveIds(s).length <= 2) {
    s.winner = 'infiltrators';
    s.reason = 'The infiltrators survived to the end.';
    s.phase = 'gameover';
    return true;
  }
  return false;
}

function eliminate(room, id) {
  const s = room.state;
  s.alive[id] = false;
  s.eliminatedRoles[id] = s.roles[id];
  const label = { civilian: '🧑 a civilian', undercover: '🥸 UNDERCOVER', white: '🕵️ MR. WHITE' }[s.roles[id]];
  s.log.push(`☠ ${nameOf(room, id)} was voted out — ${label}!`);
  if (s.roles[id] === 'white') {
    s.pendingWhite = id;
    s.phase = 'whiteguess';
    s.log.push(`${nameOf(room, id)} gets one guess at the civilian word…`);
    return;
  }
  if (!checkWin(room)) newRound(room);
}

function handleAction(room, player, msg) {
  const s = room.state;
  switch (msg.type) {
    case 'describe': {
      if (s.phase !== 'describe') return false;
      if (s.descOrder[s.turnIdx] !== player.id) return false;
      const text = String(msg.text || '').trim().slice(0, 60);
      if (!text) return false;
      s.descriptions.push({ pid: player.id, text, round: s.round });
      s.log.push(`${nameOf(room, player.id)}: "${text}"`);
      s.turnIdx += 1;
      if (s.turnIdx >= s.descOrder.length) {
        s.phase = 'vote';
        s.votes = {};
        s.log.push('🗳 everyone votes!');
      }
      return true;
    }
    case 'vote': {
      if (s.phase !== 'vote') return false;
      if (!s.alive[player.id]) return false;
      if (!s.alive[msg.pid] || msg.pid === player.id) return false;
      if (s.votes[player.id]) return false;
      s.votes[player.id] = msg.pid;
      if (Object.keys(s.votes).length < aliveIds(s).length) return true;
      const tally = {};
      for (const t of Object.values(s.votes)) tally[t] = (tally[t] || 0) + 1;
      const max = Math.max(...Object.values(tally));
      const top = Object.keys(tally).filter(id => tally[id] === max);
      if (top.length > 1) {
        s.log.push('⚖️ vote tied — nobody is out. Describe again!');
        newRound(room);
        return true;
      }
      eliminate(room, top[0]);
      return true;
    }
    case 'white_guess': {
      if (s.phase !== 'whiteguess' || player.id !== s.pendingWhite) return false;
      const guess = String(msg.word || '').trim();
      if (!guess) return false;
      s.pendingWhite = null;
      if (guess.toLowerCase() === s.civWord.toLowerCase()) {
        s.winner = 'white';
        s.reason = `Mr. White guessed the word: ${s.civWord}!`;
        s.phase = 'gameover';
        s.log.push(`💥 ${nameOf(room, player.id)} guessed "${guess}" — correct! MR. WHITE WINS!`);
      } else {
        s.log.push(`${nameOf(room, player.id)} guessed "${guess}" — wrong (it wasn't that)`);
        if (!checkWin(room)) newRound(room);
      }
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
  const role = s.roles[player.id];
  const over = s.phase === 'gameover';
  return {
    phase: s.phase,
    order: s.order,
    alive: s.alive,
    round: s.round,
    word: role === 'white' ? null : role === 'civilian' ? s.civWord : s.ucWord,
    isWhite: role === 'white',
    describer: s.phase === 'describe' ? s.descOrder[s.turnIdx] : null,
    descOrder: s.descOrder,
    turnIdx: s.turnIdx,
    descriptions: s.descriptions,
    votesIn: Object.keys(s.votes).length,
    votesNeeded: aliveIds(s).length,
    youVoted: !!s.votes[player.id],
    pendingWhite: s.pendingWhite,
    eliminatedRoles: s.eliminatedRoles,
    winner: s.winner, reason: s.reason,
    civWord: over ? s.civWord : null,
    ucWord: over ? s.ucWord : null,
    roles: over ? s.roles : null,
    log: s.log.slice(-14),
  };
}

module.exports = { canStart, create, handleAction, viewFor };
