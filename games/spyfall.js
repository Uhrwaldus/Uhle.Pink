// Spyfall — everyone sees the location except the spy. Talk it out on a call;
// accuse by majority vote, or the spy can try to guess the location.

const LOCATIONS = [
  'Airplane', 'Bank', 'Beach', 'Casino', 'Cathedral', 'Circus Tent',
  'Corporate Party', 'Crusader Army', 'Day Spa', 'Embassy', 'Hospital',
  'Hotel', 'Military Base', 'Movie Studio', 'Ocean Liner', 'Passenger Train',
  'Pirate Ship', 'Polar Station', 'Police Station', 'Restaurant', 'School',
  'Service Station', 'Space Station', 'Submarine', 'Supermarket', 'Theater',
  'University', 'Zoo',
];

const GAME_MINUTES = 8;

function canStart(room) {
  if (room.players.size < 3) return 'Need at least 3 players for Spyfall';
  return null;
}

function create(room) {
  const ids = [...room.players.keys()];
  const state = {
    phase: 'playing', // playing | voting | reveal
    spyId: ids[Math.floor(Math.random() * ids.length)],
    location: LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)],
    endsAt: Date.now() + GAME_MINUTES * 60 * 1000,
    accused: null,
    accuser: null,
    votes: {},
    winner: null,   // 'spy' | 'crew'
    reason: null,
    order: ids,
  };
  room.state = state;
  return state;
}

function connectedIds(room) {
  return [...room.players.values()].filter(p => p.connected).map(p => p.id);
}

function handleAction(room, player, msg) {
  const s = room.state;
  switch (msg.type) {
    case 'accuse': {
      if (s.phase !== 'playing') return false;
      if (!s.order.includes(msg.pid) || msg.pid === player.id) return false;
      s.phase = 'voting';
      s.accused = msg.pid;
      s.accuser = player.id;
      s.votes = { [player.id]: true };
      checkVotes(room);
      return true;
    }
    case 'vote': {
      if (s.phase !== 'voting') return false;
      if (player.id === s.accused) return false;
      s.votes[player.id] = !!msg.yes;
      checkVotes(room);
      return true;
    }
    case 'spy_guess': {
      if (player.id !== s.spyId) return false;
      if (s.phase !== 'playing' && s.phase !== 'voting') return false;
      if (!LOCATIONS.includes(msg.location)) return false;
      s.phase = 'reveal';
      if (msg.location === s.location) { s.winner = 'spy'; s.reason = `The spy guessed the location: ${s.location}!`; }
      else { s.winner = 'crew'; s.reason = `The spy guessed ${msg.location} — but it was ${s.location}.`; }
      return true;
    }
    case 'rematch': {
      if (s.phase !== 'reveal') return false;
      if (player.id !== room.hostId) return false;
      create(room);
      return true;
    }
    default:
      return false;
  }
}

function checkVotes(room) {
  const s = room.state;
  const voters = connectedIds(room).filter(id => id !== s.accused);
  const votes = Object.entries(s.votes).filter(([id]) => voters.includes(id));
  if (votes.length < voters.length) return;
  const yes = votes.filter(([, v]) => v).length;
  if (yes > voters.length / 2) {
    s.phase = 'reveal';
    if (s.accused === s.spyId) { s.winner = 'crew'; s.reason = `${nameOf(room, s.accused)} was the spy!`; }
    else { s.winner = 'spy'; s.reason = `${nameOf(room, s.accused)} was innocent — ${nameOf(room, s.spyId)} was the spy.`; }
  } else {
    s.phase = 'playing';
    s.accused = null; s.accuser = null; s.votes = {};
  }
}

function nameOf(room, id) {
  const p = room.players.get(id);
  return p ? p.name : '?';
}

function viewFor(room, player) {
  const s = room.state;
  const isSpy = player.id === s.spyId;
  const revealed = s.phase === 'reveal';
  return {
    phase: s.phase,
    isSpy,
    location: (isSpy && !revealed) ? null : s.location,
    locations: LOCATIONS,
    endsAt: s.endsAt,
    accused: s.accused,
    accuser: s.accuser,
    votesIn: Object.keys(s.votes).length,
    votersTotal: connectedIds(room).filter(id => id !== s.accused).length,
    youVoted: s.votes[player.id] !== undefined,
    winner: s.winner,
    reason: s.reason,
    spyId: revealed ? s.spyId : null,
    order: s.order,
  };
}

module.exports = { canStart, create, handleAction, viewFor };
