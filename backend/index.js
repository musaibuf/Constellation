const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { SCENARIOS, BEHAVIORS, BEHAVIOR_DEFINITIONS } = require('./scenarios');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ============================================================
// CONFIG
// ============================================================
const QUESTIONS = [
  { text: "On a long road trip, you're the one:", options: ["Driving", "Navigating", "Picking the music", "Handling the snacks", "Asleep in the back"] },
  { text: "Pick your spot in the cricket team:", options: ["Opening batter", "Finisher", "Fast bowler", "Spinner", "Wicketkeeper"] },
  { text: "When you're stuck, how long before you ask for help?", options: ["Straight away", "About an hour", "I'll figure it out myself", "I'll suffer in silence"] },
  { text: "Your restaurant on a Saturday night feels like:", options: ["A wedding hall", "A cricket stadium", "A railway station", "A concert", "A well-oiled machine"] },
  { text: "Your order when you actually get to choose:", options: ["Chai", "Coffee", "Cold drink", "Juice", "Just water"] },
  { text: "Your KFC order on a day off:", options: ["Zinger", "Mighty Zinger", "Hot Wings", "Krunch Burger", "Just fries", "I'm not eating KFC on my day off"] }
];

const TEAM_COUNT = 20;
// 20 high-saturation hues. Team numbers are always shown alongside colour,
// so two similar shades are still never ambiguous, but test on the real
// projector, it washes out mid-tones.
const TEAM_COLOURS = [
  "#FF2D2D", "#FF7A00", "#FFD400", "#4CD64C", "#00D9C0",
  "#00A3FF", "#4A5CFF", "#B14CFF", "#FF3D9E", "#A8E600",
  "#FF9E80", "#7FDBFF", "#FFB300", "#00FF9C", "#E040FB",
  "#F5F5F5", "#9C8CFF", "#FF6F91", "#C6A15B", "#2E8BFF",
];
const GENDERS = ['male', 'female'];

// ============================================================
// STATE (flat, in-memory)
// ============================================================
let session = {
  activity: 'constellation',   // 'constellation' | 'puzzle'
  state: 'idle',               // constellation: idle|populating|quiz_open|teams_formed
                               // puzzle: running|complete
};
let participants = {};   // id -> { id, name, gender, joinedAt, teamId }
let answers = [];        // { participantId, questionIndex, optionIndex, answeredAt }
let teams = [];          // { id, number, name, colour, memberIds }
let puzzle = null;       // see ACCOUNTABILITY PUZZLE below

function resetSession() {
  session = { activity: 'constellation', state: 'idle' };
  participants = {};
  answers = [];
  teams = [];
  puzzle = null;
}

function nameExists(name) {
  return Object.values(participants).some(p => p.name === name);
}

function uniqueName(base) {
  if (!nameExists(base)) return base;
  let n = 2;
  while (nameExists(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

function submittedCount() {
  return Object.keys(participants).filter(pid =>
    QUESTIONS.every((_, qi) => answers.some(a => a.participantId === pid && a.questionIndex === qi))
  ).length;
}

// ============================================================
// CONSTELLATION SPLIT
// ============================================================
function runSplit() {
  teams = Array.from({ length: TEAM_COUNT }, (_, i) => ({
    id: `team_${i + 1}`,
    number: i + 1,
    name: `Team ${i + 1}`,
    colour: TEAM_COLOURS[i % TEAM_COLOURS.length],
    memberIds: []
  }));

  const allParticipantIds = Object.keys(participants);
  const assigned = new Set();
  // Cap scales with headcount (200 / 20 = 10). Ceiling guarantees total
  // capacity always covers everyone, so no one can ever be left unplaced.
  const cap = Math.max(1, Math.ceil(allParticipantIds.length / TEAM_COUNT));
  const femaleCount = (t) => t.memberIds.filter(id => participants[id] && participants[id].gender === 'female').length;
  const open = () => teams.filter(t => t.memberIds.length < cap);

  // PHASE 1: spread women first, one per team before any team gets a second.
  // With fewer women than teams, a random subset of teams gets exactly one
  // each (the rest get none). With more, it stays as even as possible.
  const women = shuffle(allParticipantIds.filter(pid => participants[pid].gender === 'female'));
  const teamOrder = shuffle(teams.slice()); // randomises which teams get the first woman
  women.forEach(pid => {
    const target = open()
      .sort((a, b) => (femaleCount(a) - femaleCount(b)) || (a.memberIds.length - b.memberIds.length) || (teamOrder.indexOf(a) - teamOrder.indexOf(b)))[0];
    if (!target) return;
    target.memberIds.push(pid);
    participants[pid].teamId = target.id;
    assigned.add(pid);
  });

  // PHASE 2: everyone else, mixed by answers (same rule as before).
  for (let q = 0; q < QUESTIONS.length; q++) {
    const qAnswers = answers.filter(a => a.questionIndex === q && !assigned.has(a.participantId));
    const groups = {};
    qAnswers.forEach(a => {
      if (!groups[a.optionIndex]) groups[a.optionIndex] = [];
      groups[a.optionIndex].push(a.participantId);
    });

    Object.values(groups).forEach(group => {
      group.forEach(pid => {
        if (assigned.has(pid)) return;
        const target = open().sort((a, b) => a.memberIds.length - b.memberIds.length)[0];
        if (!target) return;
        target.memberIds.push(pid);
        participants[pid].teamId = target.id;
        assigned.add(pid);
      });
    });
  }

  allParticipantIds.forEach(pid => {
    if (!assigned.has(pid)) {
      const target = open().sort((a, b) => a.memberIds.length - b.memberIds.length)[0];
      if (!target) return;
      target.memberIds.push(pid);
      participants[pid].teamId = target.id;
      assigned.add(pid);
    }
  });

  session.state = 'teams_formed';
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================
// WHO IS CONNECTED
// ============================================================
// Tracked per participant id (not per socket), so a phone that drops and
// reconnects is still the same person. Each phone also joins a private room
// ('p:<id>') so the server can push that person their own puzzle screen.
const onlineSockets = {}; // participantId -> Set of socket ids
const offlineSince = {};  // participantId -> ms timestamp they went offline
function markOnline(socket, pid) {
  if (!pid) return;
  if (socket.data.pid && socket.data.pid !== pid) markOffline(socket);
  socket.data.pid = pid;
  if (!onlineSockets[pid]) onlineSockets[pid] = new Set();
  onlineSockets[pid].add(socket.id);
  delete offlineSince[pid];
  socket.join('p:' + pid);
}
function markOffline(socket) {
  const pid = socket.data.pid;
  if (pid && onlineSockets[pid]) {
    onlineSockets[pid].delete(socket.id);
    if (onlineSockets[pid].size === 0) {
      delete onlineSockets[pid];
      offlineSince[pid] = Date.now();
    }
  }
  if (pid) socket.leave('p:' + pid);
}
function isOnline(pid) { return !!onlineSockets[pid]; }
function offlineFor(pid) {
  if (isOnline(pid)) return 0;
  const since = offlineSince[pid] || (puzzle ? puzzle.startedAt : Date.now());
  return Date.now() - since;
}

// ============================================================
// ACCOUNTABILITY PUZZLE
// ============================================================
// The board is kfc-puzzle.png cut into 20 pieces (5 across, 4 down). Each team
// owns one piece, and each piece is cut into 4 quarters, so 80 quarters total.
//
// A team never unlocks its own quarters. Every round, each team is paired with
// another team (shuffled, never linear, never the same pair twice, and never
// a straight swap). 4 members of the SENDING team each answer one scenario.
// Their choices (1, 2 or 3) form a 4 digit code. They walk it over to the
// RECEIVING team, explain which behaviour each choice shows, and the receiving
// captain enters the code, then taps which behaviour was explained for each
// digit. That unlocks one quarter of the receiving team's piece.
//
// 4 rounds per team: every team sends 4 codes and receives 4 codes.
const BOARD_COLS = 5;
const BOARD_ROWS = 4;
const ROUNDS = 4;
const CODE_LENGTH = 4;
const CAPTAIN_GRACE_MS = 20000;   // captain offline this long -> hand over
const ANSWERER_GRACE_MS = 30000;  // answerer offline this long -> hand over
const WRONG_LIMIT = 3;            // wrong codes in a row before a cool-down
const LOCKOUT_MS = 20000;
const FEED_LIMIT = 8;

const SCENARIO_BY_ID = Object.fromEntries(SCENARIOS.map(s => [s.id, s]));

function teamByNumber(n) { return teams.find(t => t.number === n); }
function teamMembers(n) {
  const t = teamByNumber(n);
  return t ? t.memberIds.filter(id => participants[id]) : [];
}
function nameOf(pid) { return pid && participants[pid] ? participants[pid].name : null; }

// Pick distinct shifts so the pairing is a shuffled ring. With shift s,
// sender at ring position i sends to position i+s. Excluding n/2 and never
// using both s and n-s means no two teams ever just swap codes with each
// other. Small test events (2 to 4 teams) relax this as far as needed.
function pickShifts(n) {
  if (n <= 1) return Array(ROUNDS).fill(0);
  const pool = shuffle(Array.from({ length: n - 1 }, (_, i) => i + 1));
  const chosen = [];
  for (const s of pool) {
    if (chosen.length === ROUNDS) break;
    if (2 * s === n || chosen.includes(n - s)) continue;
    chosen.push(s);
  }
  for (const s of pool) {
    if (chosen.length === ROUNDS) break;
    if (!chosen.includes(s)) chosen.push(s);
  }
  let i = 0;
  while (chosen.length < ROUNDS) chosen.push(chosen[i++]);
  return chosen;
}

function scenarioPublic(id) {
  const s = SCENARIO_BY_ID[id];
  if (!s) return null;
  // Behaviour labels are hidden while answering, so the explanation to the
  // receiving team comes from the answerer, not from the screen.
  return { id: s.id, category: s.category, text: s.text, options: s.options.map(o => ({ title: o.title, detail: o.detail })) };
}

function drawScenarios(n, count) {
  const deck = puzzle.decks[n];
  const out = [];
  for (let i = 0; i < count; i++) {
    if (deck.idx >= deck.order.length) { deck.order = shuffle(SCENARIOS.map(s => s.id)); deck.idx = 0; }
    out.push(deck.order[deck.idx++]);
  }
  return out;
}

// Rotates answering duty through the team so different people answer each
// round. The captain is left out when the team is big enough (5+), because
// the captain is busy receiving. Prefers people who are online right now.
function pickAnswerers(n, count) {
  const members = teamMembers(n);
  if (members.length === 0) return Array(count).fill(null);
  const cap = puzzle.captains[n];
  const pool = members.length >= 5 ? members.filter(id => id !== cap) : members.slice();
  const rot = puzzle.rotation[n];
  rot.order = rot.order.filter(id => pool.includes(id));
  shuffle(pool.filter(id => !rot.order.includes(id))).forEach(id => rot.order.push(id));
  const ordered = rot.order.map((_, i) => rot.order[(rot.idx + i) % rot.order.length]);
  const online = ordered.filter(isOnline);
  const base = online.length ? online : ordered;
  const out = [];
  for (let j = 0; j < count; j++) out.push(base[j % base.length]);
  const used = new Set(out);
  // Advance the rotation past everyone who just got picked.
  let advance = 0;
  while (advance < rot.order.length && used.has(rot.order[(rot.idx + advance) % rot.order.length])) advance++;
  rot.idx = (rot.idx + Math.max(1, advance)) % rot.order.length;
  return out;
}

function pickCaptain(n, avoid) {
  const members = teamMembers(n);
  if (members.length === 0) return null;
  const online = members.filter(id => isOnline(id) && id !== avoid);
  const pool = online.length ? online : members.filter(id => id !== avoid);
  const list = pool.length ? pool : members;
  return list[Math.floor(Math.random() * list.length)];
}

function startPuzzle() {
  const inPlay = teams.filter(t => teamMembers(t.number).length > 0).map(t => t.number);
  const ring = shuffle(inPlay);
  const n = ring.length;
  const shifts = pickShifts(n);

  puzzle = {
    startedAt: Date.now(),
    completedAt: null,
    showResults: false,
    inPlay,
    pieces: {},
    deliveries: [],
    captains: {},
    rotation: {},
    decks: {},
    attempts: {},
    feed: [],
  };

  // One piece per board slot. Slot N belongs to Team N. A slot whose team has
  // nobody in it starts fully open, so the picture can still be completed.
  for (let slot = 1; slot <= BOARD_COLS * BOARD_ROWS; slot++) {
    const playing = inPlay.includes(slot);
    puzzle.pieces[slot] = {
      slot,
      teamNumber: playing ? slot : null,
      quarters: [!playing, !playing, !playing, !playing],
      order: shuffle([0, 1, 2, 3]), // which quarter each round unlocks
    };
  }

  inPlay.forEach(num => {
    puzzle.rotation[num] = { order: [], idx: 0 };
    puzzle.decks[num] = { order: shuffle(SCENARIOS.map(s => s.id)), idx: 0 };
    puzzle.attempts[num] = { wrong: 0, lockedUntil: 0 };
    puzzle.captains[num] = pickCaptain(num);
  });

  let seq = 0;
  for (let r = 0; r < ROUNDS; r++) {
    for (let i = 0; i < n; i++) {
      const from = ring[i];
      const to = ring[(i + shifts[r]) % n];
      puzzle.deliveries.push({
        id: `d${++seq}`,
        round: r + 1,
        from, to,
        quarter: puzzle.pieces[to] ? puzzle.pieces[to].order[r] : r,
        status: 'pending', // pending|answering|ready|verified|unlocked
        scenarioIds: [], answerers: [], answers: [], explained: null,
        code: null, openedAt: null, readyAt: null, verifiedAt: null, unlockedAt: null,
        byFacilitator: false,
      });
    }
  }

  inPlay.forEach(num => openNextRound(num));
  session.activity = 'puzzle';
  session.state = 'running';
}

function openNextRound(fromTeam) {
  const next = puzzle.deliveries
    .filter(d => d.from === fromTeam && d.status === 'pending')
    .sort((a, b) => a.round - b.round)[0];
  if (!next) return null;
  // Only one open delivery per sending team at a time.
  const busy = puzzle.deliveries.some(d => d.from === fromTeam && ['answering', 'ready', 'verified'].includes(d.status));
  if (busy) return null;
  next.status = 'answering';
  next.openedAt = Date.now();
  next.scenarioIds = drawScenarios(fromTeam, CODE_LENGTH);
  next.answerers = pickAnswerers(fromTeam, CODE_LENGTH);
  next.answers = Array(CODE_LENGTH).fill(null);
  return next;
}

function unlockDelivery(d, explained, byFacilitator) {
  if (d.status === 'unlocked') return;
  d.status = 'unlocked';
  d.unlockedAt = Date.now();
  d.explained = explained || null;
  d.byFacilitator = !!byFacilitator;
  const piece = puzzle.pieces[d.to];
  if (piece) piece.quarters[d.quarter] = true;
  addFeed(`Team ${d.from} helped Team ${d.to} unlock a piece`, d.from, d.to);
  openNextRound(d.from);
  if (puzzle.deliveries.every(x => x.status === 'unlocked')) completePuzzle();
}

function completePuzzle() {
  Object.values(puzzle.pieces).forEach(p => { p.quarters = [true, true, true, true]; });
  puzzle.completedAt = puzzle.completedAt || Date.now();
  session.state = 'complete';
}

function addFeed(text, from, to) {
  puzzle.feed.unshift({ at: Date.now(), text, from, to });
  puzzle.feed = puzzle.feed.slice(0, FEED_LIMIT);
}

function behaviorOf(scenarioId, optionIndex) {
  const s = SCENARIO_BY_ID[scenarioId];
  return s && s.options[optionIndex] ? s.options[optionIndex].behavior : null;
}

// Chosen = what people picked. Explained = what the receiving captain heard
// when the sending team explained each digit. Match = the two agree.
function computeStats(teamNumber) {
  const empty = () => Object.fromEntries(BEHAVIORS.map(b => [b, 0]));
  const chosen = empty(), explained = empty(), matched = empty();
  let answersGiven = 0, explainedTotal = 0, matchTotal = 0, notExplained = 0;
  if (!puzzle) return { chosen, explained, matched, answersGiven, explainedTotal, matchTotal, notExplained };
  puzzle.deliveries.forEach(d => {
    if (teamNumber && d.from !== teamNumber) return;
    d.answers.forEach((opt, j) => {
      if (opt === null || opt === undefined) return;
      const b = behaviorOf(d.scenarioIds[j], opt);
      if (!b) return;
      chosen[b]++; answersGiven++;
      if (!d.explained) return;
      const e = d.explained[j];
      if (!BEHAVIORS.includes(e)) { notExplained++; return; }
      explained[e]++; explainedTotal++;
      if (e === b) { matched[b]++; matchTotal++; }
    });
  });
  return { chosen, explained, matched, answersGiven, explainedTotal, matchTotal, notExplained };
}

function teamProgress(n) {
  const ds = puzzle.deliveries;
  return {
    sent: ds.filter(d => d.from === n && d.status === 'unlocked').length,
    received: ds.filter(d => d.to === n && d.status === 'unlocked').length,
  };
}

function projectorPuzzleState() {
  if (!puzzle) return null;
  const pieces = Object.values(puzzle.pieces).map(p => ({
    slot: p.slot,
    teamNumber: p.teamNumber,
    colour: p.teamNumber ? (teamByNumber(p.teamNumber) || {}).colour : null,
    quarters: p.quarters.slice(),
  }));
  const unlocked = pieces.reduce((s, p) => s + p.quarters.filter(Boolean).length, 0);
  return {
    state: session.state,
    showResults: puzzle.showResults,
    cols: BOARD_COLS, rows: BOARD_ROWS,
    pieces,
    unlocked,
    total: BOARD_COLS * BOARD_ROWS * 4,
    feed: puzzle.feed,
    behaviors: BEHAVIORS,
    stats: (puzzle.showResults || session.state === 'complete') ? computeStats() : null,
  };
}

// Everything one person needs on their phone, and nothing they shouldn't see.
function puzzleStateFor(pid) {
  if (!puzzle) return null;
  const p = participants[pid];
  if (!p) return null;
  const team = teams.find(t => t.id === p.teamId);
  if (!team || !puzzle.inPlay.includes(team.number)) {
    return { inPlay: false, state: session.state };
  }
  const n = team.number;
  const capId = puzzle.captains[n];
  const isCaptain = capId === pid;
  const colourOf = (num) => (teamByNumber(num) || {}).colour;

  const open = puzzle.deliveries.filter(d => d.from === n && ['answering', 'ready', 'verified'].includes(d.status));
  const tasks = [];
  open.forEach(d => {
    d.answerers.forEach((a, j) => {
      if (a !== pid) return;
      const ans = d.answers[j];
      tasks.push({
        deliveryId: d.id, round: d.round, position: j + 1, toTeam: d.to,
        scenario: scenarioPublic(d.scenarioIds[j]),
        answered: ans, digit: ans === null ? null : ans + 1,
      });
    });
  });

  const cur = open[0] || null;
  const outgoing = cur ? {
    id: cur.id, round: cur.round, status: cur.status,
    toTeam: cur.to, toColour: colourOf(cur.to),
    toCaptainName: nameOf(puzzle.captains[cur.to]),
    answeredCount: cur.answers.filter(a => a !== null).length,
    answerers: cur.answerers.map((a, j) => ({ position: j + 1, name: nameOf(a), done: cur.answers[j] !== null, isMe: a === pid })),
    code: cur.status === 'answering' ? null : cur.code,
  } : null;

  const incoming = puzzle.deliveries
    .filter(d => d.to === n)
    .sort((a, b) => a.round - b.round)
    .map(d => ({
      id: d.id, round: d.round, fromTeam: d.from, fromColour: colourOf(d.from),
      quarter: d.quarter,
      status: d.status === 'pending' || d.status === 'answering' ? 'waiting' : d.status,
    }));

  const att = puzzle.attempts[n] || { lockedUntil: 0 };
  const prog = teamProgress(n);
  return {
    inPlay: true,
    state: session.state,
    teamNumber: n,
    colour: team.colour,
    isCaptain,
    captainName: nameOf(capId),
    captainOnline: capId ? isOnline(capId) : false,
    tasks,
    outgoing,
    sent: prog.sent,
    received: prog.received,
    rounds: ROUNDS,
    incoming,
    lockedUntil: att.lockedUntil > Date.now() ? att.lockedUntil : 0,
    piece: { slot: n, cols: BOARD_COLS, rows: BOARD_ROWS, quarters: (puzzle.pieces[n] || { quarters: [] }).quarters.slice() },
    behaviors: BEHAVIORS,
    definitions: BEHAVIOR_DEFINITIONS,
  };
}

function facilitatorPuzzleState() {
  if (!puzzle) return null;
  return {
    state: session.state,
    showResults: puzzle.showResults,
    behaviors: BEHAVIORS,
    stats: computeStats(),
    teams: puzzle.inPlay.slice().sort((a, b) => a - b).map(n => {
      const t = teamByNumber(n) || {};
      const capId = puzzle.captains[n];
      const cur = puzzle.deliveries.find(d => d.from === n && ['answering', 'ready', 'verified'].includes(d.status));
      const waitingIn = puzzle.deliveries.filter(d => d.to === n && (d.status === 'ready' || d.status === 'verified'));
      const att = puzzle.attempts[n] || { lockedUntil: 0 };
      return {
        number: n,
        colour: t.colour,
        captainId: capId,
        captainName: nameOf(capId),
        captainOnline: capId ? isOnline(capId) : false,
        members: teamMembers(n).map(id => ({ id, name: nameOf(id), online: isOnline(id) })),
        ...teamProgress(n),
        lockedUntil: att.lockedUntil > Date.now() ? att.lockedUntil : 0,
        outgoing: cur ? {
          id: cur.id, round: cur.round, toTeam: cur.to, status: cur.status,
          code: cur.code,
          since: cur.status === 'answering' ? cur.openedAt : (cur.readyAt || cur.openedAt),
          answerers: cur.answerers.map((a, j) => ({ name: nameOf(a), online: a ? isOnline(a) : false, done: cur.answers[j] !== null })),
        } : null,
        waitingIn: waitingIn.map(d => ({ id: d.id, fromTeam: d.from, status: d.status, code: d.code })),
        stats: computeStats(n),
      };
    }),
  };
}

// ---------- pushing updates ----------
// Phones get a personal screen through their private room. The projector and
// facilitator get coalesced updates so 200 people answering at once does not
// flood the big screen.
function pushTeams(teamNumbers) {
  if (!puzzle) return;
  new Set(teamNumbers).forEach(n => {
    teamMembers(n).forEach(pid => {
      if (isOnline(pid)) io.to('p:' + pid).emit('puzzle_me', puzzleStateFor(pid));
    });
  });
}
function pushAllTeams() { if (puzzle) pushTeams(teams.map(t => t.number)); }

let boardTimer = null;
function scheduleBoard() {
  if (boardTimer) return;
  boardTimer = setTimeout(() => {
    boardTimer = null;
    io.to('projectors').emit('puzzle_board', projectorPuzzleState());
    io.to('facilitators').emit('puzzle_facilitator', facilitatorPuzzleState());
  }, 150);
}
function pushBoardNow() {
  if (boardTimer) { clearTimeout(boardTimer); boardTimer = null; }
  io.to('projectors').emit('puzzle_board', projectorPuzzleState());
  io.to('facilitators').emit('puzzle_facilitator', facilitatorPuzzleState());
}

// ---------- keeping roles filled ----------
// Roles are stored by participant id. If someone is moved, removed, or their
// phone has been gone too long, hand the role to someone who is here, so no
// team can get stuck waiting for a person who left.
function repairPuzzleRoles({ onlyMembership } = {}) {
  if (!puzzle || session.state !== 'running') return;
  const changed = new Set();

  puzzle.inPlay.forEach(n => {
    const members = teamMembers(n);
    const cap = puzzle.captains[n];
    if (!cap || !members.includes(cap)) {
      puzzle.captains[n] = pickCaptain(n);
      changed.add(n);
    } else if (!onlyMembership && !isOnline(cap) && offlineFor(cap) > CAPTAIN_GRACE_MS) {
      const alt = members.filter(id => id !== cap && isOnline(id));
      if (alt.length) {
        puzzle.captains[n] = alt[Math.floor(Math.random() * alt.length)];
        changed.add(n);
      }
    }
  });

  puzzle.deliveries.forEach(d => {
    if (d.status !== 'answering') return;
    const members = teamMembers(d.from);
    if (members.length === 0) return;
    d.answerers.forEach((a, j) => {
      if (d.answers[j] !== null) return;
      const gone = !a || !members.includes(a);
      const away = !gone && !onlyMembership && !isOnline(a) && offlineFor(a) > ANSWERER_GRACE_MS;
      if (!gone && !away) return;
      const pending = new Set(d.answerers.filter((x, k) => d.answers[k] === null && k !== j));
      const cap = puzzle.captains[d.from];
      const ranked = shuffle(members).sort((x, y) => {
        const score = (id) => (isOnline(id) ? 0 : 4) + (pending.has(id) ? 2 : 0) + (id === cap && members.length >= 5 ? 1 : 0);
        return score(x) - score(y);
      });
      const pick = ranked[0];
      if (gone || isOnline(pick)) {
        if (pick !== a) { d.answerers[j] = pick; changed.add(d.from); }
      }
    });
  });

  if (changed.size) {
    // Receivers show the sending captain's name, so refresh their partners too.
    puzzle.deliveries.forEach(d => { if (changed.has(d.to) && d.status !== 'unlocked') changed.add(d.from); });
    pushTeams([...changed]);
    scheduleBoard();
  }
}

setInterval(() => {
  try { repairPuzzleRoles(); } catch (e) { console.error('repair failed', e); }
}, 5000);

// ============================================================
// SOCKET EVENTS
// ============================================================
function fullState() {
  return {
    session, participants, answers, teams, questions: QUESTIONS,
    // Anyone connecting mid-puzzle gets the current board straight away.
    puzzle: session.activity === 'puzzle' ? projectorPuzzleState() : null,
  };
}

io.on('connection', (socket) => {
  socket.emit('state_sync', fullState());

  // Projector and facilitator screens announce themselves so they receive
  // the board and the facilitator detail (codes included) respectively.
  socket.on('hello', ({ role } = {}) => {
    if (role === 'projector') {
      socket.join('projectors');
      if (puzzle) socket.emit('puzzle_board', projectorPuzzleState());
    }
    if (role === 'facilitator') {
      socket.join('facilitators');
      socket.join('projectors'); // facilitator also previews the board
      if (puzzle) {
        socket.emit('puzzle_board', projectorPuzzleState());
        socket.emit('puzzle_facilitator', facilitatorPuzzleState());
      }
    }
  });

  // Every phone announces its stored id on (re)connect.
  socket.on('identify', ({ id } = {}) => {
    if (id && participants[id]) {
      markOnline(socket, id);
      if (puzzle) socket.emit('puzzle_me', puzzleStateFor(id));
    }
  });

  // Phones ask for a fresh snapshot when they come back to the foreground,
  // in case events arrived while the tab was frozen in the background.
  socket.on('request_sync', () => {
    socket.emit('state_sync', fullState());
    if (puzzle && socket.data.pid) socket.emit('puzzle_me', puzzleStateFor(socket.data.pid));
  });

  socket.on('disconnect', () => {
    const pid = socket.data.pid;
    markOffline(socket);
    if (puzzle && pid && !isOnline(pid)) scheduleBoard();
  });

  socket.on('join', ({ id, name, gender } = {}) => {
    if (!name || name.trim().length === 0 || name.length > 20) {
      socket.emit('join_error', { message: 'Invalid name' });
      return;
    }
    if (participants[id]) {
      markOnline(socket, id);
      socket.emit('joined', participants[id]);
      socket.emit('state_sync', fullState());
      if (puzzle) socket.emit('puzzle_me', puzzleStateFor(id));
      return;
    }

    // Lost identity recovery. Once teams exist, someone whose phone lost its
    // stored id (in-app browser, cleared storage, different browser) can
    // re-enter their name and get their original self, team and role back.
    // Only matches a single participant who is currently offline, so two
    // people with the same name can never be merged into one.
    if (teams.length > 0) {
      const base = (n) => n.replace(/\s\(\d+\)$/, '').trim().toLowerCase();
      const wanted = base(name);
      const candidates = Object.values(participants).filter((p) =>
        base(p.name) === wanted && !isOnline(p.id) && (!gender || p.gender === gender));
      if (candidates.length === 1) {
        const p = candidates[0];
        markOnline(socket, p.id);
        socket.emit('joined', p);
        socket.emit('state_sync', fullState());
        if (puzzle) socket.emit('puzzle_me', puzzleStateFor(p.id));
        return;
      }
    }

    if (!GENDERS.includes(gender)) {
      socket.emit('join_error', { message: 'Please select your gender.' });
      return;
    }
    const finalName = uniqueName(name.trim());
    participants[id] = { id, name: finalName, gender, joinedAt: Date.now(), teamId: null };
    markOnline(socket, id);
    socket.emit('joined', participants[id]);
    socket.emit('state_sync', fullState());
    io.emit('participants_update', participants);
  });

  socket.on('submit_answer', ({ participantId, questionIndex, optionIndex } = {}) => {
    if (session.state !== 'quiz_open') return;
    if (questionIndex < 0 || questionIndex >= QUESTIONS.length) return;
    if (!participants[participantId]) return;
    const already = answers.find(a => a.participantId === participantId && a.questionIndex === questionIndex);
    if (already) return;

    const answer = { participantId, questionIndex, optionIndex, answeredAt: Date.now() };
    answers.push(answer);
    socket.emit('answer_confirmed', answer);
    io.emit('answer_received', answer);
    io.emit('submitted_update', { submitted: submittedCount(), total: Object.keys(participants).length });
  });

  // ---------- CONSTELLATION FACILITATOR CONTROLS ----------
  socket.on('facilitator_start_quiz', () => {
    session.state = 'quiz_open';
    io.emit('session_update', session);
  });

  socket.on('facilitator_make_teams', () => {
    runSplit();
    io.emit('teams_formed', { teams, participants });
    io.emit('session_update', session);
  });

  socket.on('facilitator_move_participant', ({ participantId, teamId } = {}) => {
    if (!participants[participantId]) return;
    const fromTeam = teams.find(t => t.memberIds.includes(participantId));
    teams.forEach(t => { t.memberIds = t.memberIds.filter(id => id !== participantId); });
    const target = teams.find(t => t.id === teamId);
    if (!target) return;
    target.memberIds.push(participantId);
    participants[participantId].teamId = teamId;
    io.emit('teams_formed', { teams, participants });
    if (puzzle) {
      repairPuzzleRoles({ onlyMembership: true });
      pushTeams([fromTeam && fromTeam.number, target.number].filter(Boolean));
      scheduleBoard();
    }
  });

  socket.on('facilitator_delete_participant', ({ participantId } = {}) => {
    const fromTeam = teams.find(t => t.memberIds.includes(participantId));
    delete participants[participantId];
    answers = answers.filter(a => a.participantId !== participantId);
    teams.forEach(t => { t.memberIds = t.memberIds.filter(id => id !== participantId); });
    io.emit('participants_update', participants);
    // Team rosters changed too, so every phone drops the removed person.
    if (teams.length > 0) io.emit('teams_formed', { teams, participants });
    if (puzzle) {
      repairPuzzleRoles({ onlyMembership: true });
      if (fromTeam) pushTeams([fromTeam.number]);
      scheduleBoard();
    }
  });

  socket.on('facilitator_reset', () => {
    resetSession();
    io.emit('reset', { session, participants, answers, teams });
  });

  // ---------- PUZZLE: FACILITATOR ----------
  socket.on('facilitator_start_puzzle', () => {
    if (teams.length === 0) return; // needs teams from a completed split
    startPuzzle();
    io.emit('session_update', session);
    io.emit('puzzle_started', projectorPuzzleState());
    pushAllTeams();
    pushBoardNow();
  });

  socket.on('facilitator_restart_puzzle', () => {
    if (session.activity !== 'puzzle') return;
    startPuzzle(); // fresh pairings, scenarios, captains
    io.emit('session_update', session);
    io.emit('puzzle_started', projectorPuzzleState());
    pushAllTeams();
    pushBoardNow();
  });

  // Ends the game early and shows the whole picture.
  socket.on('facilitator_puzzle_reveal', () => {
    if (!puzzle) return;
    completePuzzle();
    io.emit('session_update', session);
    pushAllTeams();
    pushBoardNow();
  });

  socket.on('facilitator_puzzle_results', ({ show } = {}) => {
    if (!puzzle) return;
    puzzle.showResults = !!show;
    pushBoardNow();
  });

  // For a pair that is genuinely stuck: open that quarter without the code.
  socket.on('facilitator_puzzle_unlock', ({ deliveryId } = {}) => {
    if (!puzzle) return;
    const d = puzzle.deliveries.find(x => x.id === deliveryId);
    if (!d || d.status === 'unlocked' || d.status === 'pending') return;
    unlockDelivery(d, null, true);
    if (session.state === 'complete') io.emit('session_update', session);
    pushTeams([d.from, d.to]);
    pushBoardNow();
  });

  socket.on('facilitator_puzzle_set_captain', ({ teamNumber, participantId } = {}) => {
    if (!puzzle || !teamMembers(teamNumber).includes(participantId)) return;
    puzzle.captains[teamNumber] = participantId;
    const partners = puzzle.deliveries.filter(d => d.to === teamNumber).map(d => d.from);
    pushTeams([teamNumber, ...partners]);
    scheduleBoard();
  });

  // ---------- PUZZLE: PHONES ----------
  function whoAmI(participantId) {
    if (!socket.data.pid && participantId && participants[participantId]) markOnline(socket, participantId);
    return socket.data.pid && participants[socket.data.pid] ? socket.data.pid : null;
  }

  socket.on('puzzle_get_me', ({ participantId } = {}) => {
    const pid = whoAmI(participantId);
    if (pid && puzzle) socket.emit('puzzle_me', puzzleStateFor(pid));
  });

  socket.on('puzzle_answer', ({ participantId, deliveryId, position, optionIndex } = {}) => {
    const pid = whoAmI(participantId);
    if (!pid || !puzzle || session.state !== 'running') return;
    const d = puzzle.deliveries.find(x => x.id === deliveryId);
    const j = Number(position) - 1;
    const opt = Number(optionIndex);
    if (!d || d.status !== 'answering' || !(j >= 0 && j < CODE_LENGTH)) return;
    if (d.answerers[j] !== pid || d.answers[j] !== null) return;
    if (!(opt >= 0 && opt <= 2)) return;
    d.answers[j] = opt;
    if (d.answers.every(a => a !== null)) {
      d.code = d.answers.map(a => String(a + 1)).join('');
      d.status = 'ready';
      d.readyAt = Date.now();
      pushTeams([d.from, d.to]);
    } else {
      pushTeams([d.from]);
    }
    scheduleBoard();
  });

  socket.on('puzzle_submit_code', ({ participantId, code } = {}) => {
    const pid = whoAmI(participantId);
    if (!pid || !puzzle || session.state !== 'running') return;
    const team = teams.find(t => t.id === participants[pid].teamId);
    if (!team || !puzzle.inPlay.includes(team.number)) return;
    const n = team.number;
    if (puzzle.captains[n] !== pid) {
      socket.emit('puzzle_error', { message: 'Only your team captain can enter codes.' });
      return;
    }
    const att = puzzle.attempts[n];
    if (att.lockedUntil > Date.now()) {
      socket.emit('puzzle_error', { message: 'Too many wrong codes. Wait a moment, then try again.', lockedUntil: att.lockedUntil });
      return;
    }
    // Only one code can be mid-explanation at a time per team.
    const midway = puzzle.deliveries.find(d => d.to === n && d.status === 'verified');
    if (midway) {
      socket.emit('puzzle_error', { message: `Finish matching the behaviours for Team ${midway.from} first.` });
      return;
    }
    const clean = String(code || '').replace(/\D/g, '');
    const d = puzzle.deliveries
      .filter(x => x.to === n && x.status === 'ready' && x.code === clean)
      .sort((a, b) => a.round - b.round)[0];
    if (!d) {
      att.wrong += 1;
      if (att.wrong >= WRONG_LIMIT) {
        att.wrong = 0;
        att.lockedUntil = Date.now() + LOCKOUT_MS;
        socket.emit('puzzle_error', { message: 'Three wrong codes. Wait 20 seconds and check the code with the team bringing it.', lockedUntil: att.lockedUntil });
        pushTeams([n]);
      } else {
        socket.emit('puzzle_error', { message: "That code doesn't match. Check it with the team bringing it." });
      }
      scheduleBoard();
      return;
    }
    att.wrong = 0;
    d.status = 'verified';
    d.verifiedAt = Date.now();
    pushTeams([n, d.from]);
    scheduleBoard();
  });

  socket.on('puzzle_confirm', ({ participantId, deliveryId, explained } = {}) => {
    const pid = whoAmI(participantId);
    if (!pid || !puzzle || session.state !== 'running') return;
    const d = puzzle.deliveries.find(x => x.id === deliveryId);
    if (!d || d.status !== 'verified') return;
    if (puzzle.captains[d.to] !== pid) {
      socket.emit('puzzle_error', { message: 'Only your team captain can confirm this.' });
      return;
    }
    if (!Array.isArray(explained) || explained.length !== CODE_LENGTH) return;
    const clean = explained.map(e => (BEHAVIORS.includes(e) ? e : 'none'));
    unlockDelivery(d, clean, false);
    if (session.state === 'complete') {
      io.emit('session_update', session);
      pushAllTeams();
    } else {
      // The sender's next round just opened, and the next round's receiver
      // needs to see it coming.
      const next = puzzle.deliveries.find(x => x.from === d.from && x.status === 'answering');
      pushTeams([d.to, d.from, next ? next.to : null].filter(Boolean));
    }
    pushBoardNow();
  });
});

// ============================================================
// HTTP FALLBACK
// ============================================================
app.get('/state', (req, res) => {
  res.json(fullState());
});

app.get('/health', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));