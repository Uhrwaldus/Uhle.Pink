// The Resistance — spies vs resistance across 5 missions.
const SPY_COUNT = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4 };
const TEAM_SIZES = {
  5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5],
};

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
  if (n < 5) return 'The Resistance needs at least 5 players';
  if (n > 10) return 'The Resistance plays 5-10 players';
  return null;
}

function create(room) {
  const ids = [...room.players.keys()];
  const n = ids.length;
  const shuffledIds = shuffled(ids);
  const spies = shuffledIds.slice(0, SPY_COUNT[n]);
  const state = {
    phase: 'propose', // propose | vote | mission | result | gameover
    order: ids,
    roles: Object.fromEntries(ids.map(id => [id, spies.includes(id) ? 'spy' : 'resistance'])),
    spies,
    teamSizes: TEAM_SIZES[n],
    missionNum: 0, // 0-indexed
    leaderIdx: Math.floor(Math.random() * n),
    proposal: [],
    votes: {},
    lastVote: null,
    voteTrack: 0,
    missionPlays: {},
    missions: [], // {size, fails, success}
    lastMission: null,
    winner: null, reason: null,
    log: [],
  };
  room.state = state;
  state.log.push(`Mission 1 — ${nameOf(room, leader(state))} leads`);
  return state;
}

function nameOf(room, id) { const p = room.players.get(id); return p ? p.name : '?'; }
function leader(s) { return s.order[s.leaderIdx]; }
function twoFailsNeeded(s) { return s.order.length >= 7 && s.missionNum === 3; }

function handleAction(room, player, msg) {
  const s = room.state;
  switch (msg.type) {
    case 'propose': {
      if (s.phase !== 'propose' || player.id !== leader(s)) return false;
      const team = [...new Set(msg.team || [])];
      if (team.length !== s.teamSizes[s.missionNum]) return false;
      if (!team.every(id => s.order.includes(id))) return false;
      s.proposal = team;
      s.votes = {};
      s.phase = 'vote';
      s.log.push(`${nameOf(room, player.id)} proposes: ${team.map(id => nameOf(room, id)).join(', ')}`);
      return true;
    }
    case 'vote': {
      if (s.phase !== 'vote') return false;
      if (s.votes[player.id] !== undefined) return false;
      s.votes[player.id] = !!msg.approve;
      if (Object.keys(s.votes).length < s.order.length) return true;
      const approves = Object.values(s.votes).filter(Boolean).length;
      const approved = approves > s.order.length / 2;
      s.lastVote = { votes: { ...s.votes }, approved };
      s.log.push(`Vote ${approved ? 'APPROVED' : 'REJECTED'} (${approves}/${s.order.length})`);
      if (approved) {
        s.voteTrack = 0;
        s.missionPlays = {};
        s.phase = 'mission';
      } else {
        s.voteTrack += 1;
        if (s.voteTrack >= 5) {
          s.winner = 'spies'; s.reason = '5 proposals rejected in a row — chaos wins.';
          s.phase = 'gameover';
          return true;
        }
        s.leaderIdx = (s.leaderIdx + 1) % s.order.length;
        s.proposal = [];
        s.phase = 'propose';
        s.log.push(`${nameOf(room, leader(s))} now leads (reject ${s.voteTrack}/5)`);
      }
      return true;
    }
    case 'mission_play': {
      if (s.phase !== 'mission') return false;
      if (!s.proposal.includes(player.id)) return false;
      if (s.missionPlays[player.id] !== undefined) return false;
      const success = !!msg.success;
      if (s.roles[player.id] === 'resistance' && !success) return false; // resistance can't sabotage
      s.missionPlays[player.id] = success;
      if (Object.keys(s.missionPlays).length < s.proposal.length) return true;
      const fails = Object.values(s.missionPlays).filter(v => !v).length;
      const needed = twoFailsNeeded(s) ? 2 : 1;
      const succeeded = fails < needed;
      s.missions.push({ size: s.proposal.length, fails, success: succeeded });
      s.lastMission = { fails, success: succeeded, needed };
      s.log.push(`Mission ${s.missionNum + 1}: ${succeeded ? '✅ SUCCESS' : '💥 FAILED'}${fails ? ` (${fails} fail card${fails > 1 ? 's' : ''})` : ''}`);
      const wins = s.missions.filter(m => m.success).length;
      const losses = s.missions.filter(m => !m.success).length;
      if (wins >= 3) { s.winner = 'resistance'; s.reason = 'Three missions succeeded!'; s.phase = 'gameover'; return true; }
      if (losses >= 3) { s.winner = 'spies'; s.reason = 'Three missions sabotaged!'; s.phase = 'gameover'; return true; }
      s.phase = 'result';
      return true;
    }
    case 'next': {
      if (s.phase !== 'result') return false;
      s.missionNum += 1;
      s.leaderIdx = (s.leaderIdx + 1) % s.order.length;
      s.proposal = [];
      s.phase = 'propose';
      s.log.push(`Mission ${s.missionNum + 1} — ${nameOf(room, leader(s))} leads`);
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
  const isSpy = s.roles[player.id] === 'spy';
  const over = s.phase === 'gameover';
  return {
    phase: s.phase,
    order: s.order,
    role: s.roles[player.id],
    spies: (isSpy || over) ? s.spies : null,
    teamSizes: s.teamSizes,
    missionNum: s.missionNum,
    twoFails: twoFailsNeeded(s),
    leader: leader(s),
    proposal: s.proposal,
    youVoted: s.votes[player.id] !== undefined,
    votesIn: Object.keys(s.votes).length,
    lastVote: s.lastVote,
    voteTrack: s.voteTrack,
    onTeam: s.proposal.includes(player.id),
    youPlayed: s.missionPlays[player.id] !== undefined,
    playsIn: Object.keys(s.missionPlays).length,
    missions: s.missions,
    lastMission: s.lastMission,
    roles: over ? s.roles : null,
    winner: s.winner, reason: s.reason,
    log: s.log.slice(-14),
  };
}

module.exports = { canStart, create, handleAction, viewFor };
