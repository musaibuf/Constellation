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
let puzzle = null;       // see CODE UP below
// (ownit, the third activity, is declared with its section below)

function resetSession() {
  session = { activity: 'constellation', state: 'idle' };
  participants = {};
  answers = [];
  teams = [];
  puzzle = null;
  ownit = null;
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

// One pass over the answers (the old version re-scanned every answer for
// every person and question, which got very slow with 200 people answering).
function submittedCount() {
  const perPerson = {};
  answers.forEach(a => { if (participants[a.participantId]) perPerson[a.participantId] = (perPerson[a.participantId] || 0) + 1; });
  return Object.values(perPerson).filter(n => n >= QUESTIONS.length).length;
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
  const started = session.activity === 'ownit' && ownit ? ownit.startedAt : (puzzle ? puzzle.startedAt : null);
  const since = offlineSince[pid] || started || Date.now();
  return Date.now() - since;
}

// ============================================================
// CODE UP (the puzzle activity)
// ============================================================
// The board is kfc-puzzle.png cut into 20 pieces (5 across, 4 down). Each team
// owns one piece, and each piece is cut into 4 quarters, so 80 quarters total.
//
// A team never unlocks its own quarters. Every round, each team is paired with
// another team (shuffled, never linear, never the same pair twice, and never
// a straight swap). 4 members of the SENDING team each answer one scenario.
// Their choices (1, 2 or 3) form a 4 digit code. They deliver it to the
// RECEIVING team's captain, who types it in. A correct code unlocks one
// quarter of the receiving team's piece straight away.
//
// 4 rounds per team: every team sends 4 codes and receives 4 codes.
const BOARD_COLS = 5;
const BOARD_ROWS = 4;
const ROUNDS = 4;
const CODE_LENGTH = 4;
const CAPTAIN_GRACE_MS = 30000;   // captain offline this long -> hand over
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

// How many answer slots each member of team n has been given so far.
function turnsTaken(n) {
  const counts = {};
  puzzle.deliveries.forEach(d => {
    if (d.from !== n) return;
    d.answerers.forEach(a => { if (a) counts[a] = (counts[a] || 0) + 1; });
  });
  return counts;
}

// Fair turns: nobody answers a second time until every teammate has had a
// first turn. The captain is busy receiving codes, so in teams of 5 or more
// they go last in each lap (after everyone else), but they still get a turn.
// People online right now are preferred, so a locked phone is not picked;
// they come first in the next round instead.
function pickAnswerers(n, count) {
  const members = teamMembers(n);
  if (members.length === 0) return Array(count).fill(null);
  const cap = puzzle.captains[n];
  const rot = puzzle.rotation[n];
  rot.order = rot.order.filter(id => members.includes(id));
  shuffle(members.filter(id => !rot.order.includes(id))).forEach(id => rot.order.push(id));
  const taken = turnsTaken(n);
  const weight = (id) => (taken[id] || 0) + (id === cap && members.length >= 5 ? 0.5 : 0);
  const rank = (list) => list.slice().sort((x, y) => (weight(x) - weight(y)) || (rot.order.indexOf(x) - rot.order.indexOf(y)));
  const online = rank(members.filter(isOnline));
  const base = online.length ? online : rank(members);
  const out = [];
  for (let j = 0; j < count; j++) out.push(base[j % base.length]);
  return out;
}

function pickCaptain(n, avoid) {
  const members = teamMembers(n);
  if (members.length === 0) return null;
  // Mid-game, skip people who still have a question to answer this round.
  const answering = new Set();
  if (puzzle && puzzle.deliveries) puzzle.deliveries.forEach(d => { if (d.from === n && d.status === 'answering') d.answerers.forEach((a, k) => { if (d.answers[k] === null) answering.add(a); }); });
  const freeMembers = members.filter(id => !answering.has(id));
  const online = (freeMembers.length ? freeMembers : members).filter(id => isOnline(id) && id !== avoid);
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

  // Ids are unique per game, so after a restart no phone can mistake a new
  // delivery for one from the previous game (e.g. a choice still highlighted).
  const gameTag = Date.now().toString(36);
  let seq = 0;
  for (let r = 0; r < ROUNDS; r++) {
    for (let i = 0; i < n; i++) {
      const from = ring[i];
      const to = ring[(i + shifts[r]) % n];
      puzzle.deliveries.push({
        id: `${gameTag}-d${++seq}`,
        round: r + 1,
        from, to,
        quarter: puzzle.pieces[to] ? puzzle.pieces[to].order[r] : r,
        status: 'pending', // pending|answering|ready|unlocked
        scenarioIds: [], answerers: [], answers: [], explained: null,
        code: null, openedAt: null, readyAt: null, unlockedAt: null,
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
  const busy = puzzle.deliveries.some(d => d.from === fromTeam && ['answering', 'ready'].includes(d.status));
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

// Chosen = which behaviour each answer showed. (The explained and matched
// fields stay at zero now that there is no explanation step; they are kept
// so older screens never break.)
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

  const open = puzzle.deliveries.filter(d => d.from === n && ['answering', 'ready'].includes(d.status));
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
      const cur = puzzle.deliveries.find(d => d.from === n && ['answering', 'ready'].includes(d.status));
      const waitingIn = puzzle.deliveries.filter(d => d.to === n && d.status === 'ready');
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
  if (!puzzle || session.activity !== 'puzzle' || session.state !== 'running') return;
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
        // Prefer someone who is not answering this round, so nobody has to
        // answer a scenario and receive codes at the same moment.
        const answering = new Set();
        puzzle.deliveries.forEach(d => { if (d.from === n && d.status === 'answering') d.answerers.forEach((a, k) => { if (d.answers[k] === null) answering.add(a); }); });
        const free = alt.filter(id => !answering.has(id));
        const pool = free.length ? free : alt;
        puzzle.captains[n] = pool[Math.floor(Math.random() * pool.length)];
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
      const taken = turnsTaken(d.from);
      // Online first, then someone not already answering this round, then
      // whoever has had the fewest turns (captain last).
      const ranked = shuffle(members).sort((x, y) => {
        const score = (id) => (isOnline(id) ? 0 : 1000) + (pending.has(id) ? 100 : 0) + (taken[id] || 0) * 2 + (id === cap && members.length >= 5 ? 1 : 0);
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
// OWN IT (the third activity)
// ============================================================
// Each team gets one of 3 cases (shuffled, 7 / 7 / 6 for 20 teams). The team
// brainstorms at its own pace, then its captain submits, in order:
//   1. a one-line problem statement (max 80 characters)
//   2. three solutions
//   3. how the solution enhances ROI = money in your till + love
// Any step can be changed until the ROI answer is in; then the team is done
// and locked (the facilitator can reopen it). Teams work independently.
const OWNIT_CASES = [
  {
    id: 1,
    name: 'Match Night Rush',
    pillar: 'Loved',
    pillarDetail: 'Guest experience, front of house',
    text: "It's a Pakistan vs India match night. Dine-in is full, there are 60+ delivery orders queued, and the drive-thru line reaches the road. A guest at the counter is live-streaming a complaint about a 40-minute wait, and a family's birthday order has gone wrong. Decide how to redeploy crew, which orders to prioritise, how to recover the unhappy guests, and what to say publicly.",
    tests: 'Leading under pressure, putting the guest first, decisions made in seconds.',
    placeholder: 'Peak-hour backlog is losing guests and damaging brand image',
  },
  {
    id: 2,
    name: 'The Cold Chain Call',
    pillar: 'Trusted',
    pillarDetail: 'Food safety and quality, back of house',
    text: "Load-shedding has run for three hours, and the generator failed partway through. Nobody can confirm the walk-in chiller's temperature log. Discarding the stock means running out of core menu items for the evening, and the supplier can't deliver until tomorrow. An area audit is also due tomorrow. Choose between protecting sales and protecting trust: whether to discard, how to escalate, what to tell guests, and how to keep it from happening again.",
    tests: "Ownership, integrity when nobody is watching, accountability that doesn't depend on rank.",
    placeholder: 'Unverified food safety is risking guest trust',
  },
  {
    id: 3,
    name: 'The Crew Crossroads',
    pillar: 'Connected',
    pillarDetail: 'People and team',
    text: "Your strongest shift manager has resigned and is joining a competitor. Two crew members didn't show up today, three new hires aren't trained yet, and the team's morale is low after a harsh audit last week. Decide who steps up, how to cross-train quickly, and how to rebuild energy in the team.",
    tests: 'Build winning teams, grow people "in person, not in title", the culture I create.',
    placeholder: 'Understaffed, low-morale crew cannot hold service standards',
  },
];
const OWNIT_PROBLEM_MAX = 80;
const OWNIT_TEXT_MAX = 300;
const OWNIT_ROI_QUESTION = 'How does your solution enhance ROI = money in your till + love?';

let ownit = null; // { startedAt, inPlay, teams: { [n]: {...} }, spotlight }

function ownitLive() { return !!ownit && session.activity === 'ownit'; }

function startOwnIt() {
  const inPlay = teams.filter(t => teamMembers(t.number).length > 0).map(t => t.number);
  // Shuffle the teams, then deal cases 1, 2, 3, 1, 2, 3... : 7 / 7 / 6 for 20 teams.
  const order = shuffle(inPlay);
  const caseOrder = [1, 2, 3]; // teams are shuffled, so dealing 1, 2, 3 in order gives Case 3 the 6
  ownit = { startedAt: Date.now(), inPlay, teams: {}, spotlight: null };
  order.forEach((n, i) => {
    // Keep the Code Up captain if they are still on the team, so nobody has to re-learn who it is.
    // (only if they are online right now; otherwise pick someone who is)
    const prevCap = puzzle && puzzle.captains && puzzle.captains[n];
    ownit.teams[n] = {
      caseId: caseOrder[i % 3],
      captainId: prevCap && teamMembers(n).includes(prevCap) && isOnline(prevCap) ? prevCap : pickOwnItCaptain(n),
      problem: '', solutions: ['', '', ''], roi: '',
      steps: { problem: false, solutions: false, roi: false },
      done: false, doneAt: null, updatedAt: null,
    };
  });
  session.activity = 'ownit';
  session.state = 'running';
}

function pickOwnItCaptain(n, avoid) {
  const members = teamMembers(n).filter(id => id !== avoid);
  if (!members.length) return teamMembers(n)[0] || null;
  const online = members.filter(isOnline);
  const pool = online.length ? online : members;
  return pool[Math.floor(Math.random() * pool.length)];
}

function caseById(id) { return OWNIT_CASES.find(c => c.id === id); }

function ownitTeamPublic(n) {
  const t = ownit.teams[n];
  const team = teamByNumber(n) || {};
  return {
    number: n,
    name: team.name || `Team ${n}`,
    colour: team.colour,
    caseId: t.caseId,
    problem: t.steps.problem ? t.problem : '',
    solutions: t.steps.solutions ? t.solutions.slice() : ['', '', ''],
    roi: t.steps.roi ? t.roi : '',
    steps: { ...t.steps },
    done: t.done,
    doneAt: t.doneAt,
    captainName: nameOf(t.captainId),
  };
}

function ownitBoardState() {
  if (!ownit) return null;
  const list = ownit.inPlay.slice().sort((a, b) => a - b).map(ownitTeamPublic);
  return {
    cases: OWNIT_CASES.map(({ id, name, pillar, pillarDetail }) => ({ id, name, pillar, pillarDetail })),
    teams: list,
    completeCount: list.filter(t => t.done).length,
    total: list.length,
    spotlight: ownit.spotlight,
  };
}

function ownitFacilitatorState() {
  if (!ownit) return null;
  return {
    ...ownitBoardState(),
    captains: Object.fromEntries(ownit.inPlay.map(n => [n, {
      captainId: ownit.teams[n].captainId,
      captainOnline: ownit.teams[n].captainId ? isOnline(ownit.teams[n].captainId) : false,
      members: teamMembers(n).map(id => ({ id, name: nameOf(id), online: isOnline(id) })),
    }])),
  };
}

// One person's view: only their own team's case and answers.
function ownitStateFor(pid) {
  if (!ownit) return null;
  const p = participants[pid];
  if (!p) return null;
  const team = teams.find(t => t.id === p.teamId);
  if (!team || !ownit.teams[team.number]) return { inPlay: false };
  const n = team.number;
  const t = ownit.teams[n];
  return {
    inPlay: true,
    gameId: ownit.startedAt,
    teamNumber: n,
    colour: team.colour,
    isCaptain: t.captainId === pid,
    captainName: nameOf(t.captainId),
    captainOnline: t.captainId ? isOnline(t.captainId) : false,
    case: caseById(t.caseId),
    problem: t.problem,
    solutions: t.solutions.slice(),
    roi: t.roi,
    steps: { ...t.steps },
    done: t.done,
    limits: { problem: OWNIT_PROBLEM_MAX, text: OWNIT_TEXT_MAX },
    roiQuestion: OWNIT_ROI_QUESTION,
    members: teamMembers(n).map(id => ({ name: nameOf(id), isMe: id === pid, isCaptain: id === t.captainId })),
  };
}

function pushOwnItTeams(teamNumbers) {
  if (!ownit) return;
  new Set(teamNumbers).forEach(n => {
    teamMembers(n).forEach(pid => { if (isOnline(pid)) io.to('p:' + pid).emit('ownit_me', ownitStateFor(pid)); });
  });
}
function pushOwnItBoard() {
  io.to('projectors').emit('ownit_board', ownitBoardState());
  io.to('facilitators').emit('ownit_facilitator', ownitFacilitatorState());
}

// Same rule as Code Up: a captain offline for 30 seconds hands over to a
// teammate who is online; a captain who left the team is replaced at once.
function repairOwnItCaptains({ onlyMembership } = {}) {
  if (!ownitLive()) return;
  const changed = [];
  ownit.inPlay.forEach(n => {
    const t = ownit.teams[n];
    const members = teamMembers(n);
    if (!members.length) return;
    if (!t.captainId || !members.includes(t.captainId)) {
      t.captainId = pickOwnItCaptain(n);
      changed.push(n);
    } else if (!onlyMembership && !isOnline(t.captainId) && offlineFor(t.captainId) > CAPTAIN_GRACE_MS) {
      const alt = members.filter(id => id !== t.captainId && isOnline(id));
      if (alt.length) {
        t.captainId = alt[Math.floor(Math.random() * alt.length)];
        changed.push(n);
      }
    }
  });
  if (changed.length) { pushOwnItTeams(changed); pushOwnItBoard(); }
}

setInterval(() => {
  try { repairOwnItCaptains(); } catch (e) { console.error('own it repair failed', e); }
}, 5000);

// ============================================================
// SOCKET EVENTS
// ============================================================
// Phones only need their own answers, never everyone's, and no puzzle board.
// Keeps every reconnect small when 200 phones are in the room.
function phoneState(pid) {
  return {
    session, participants, teams, questions: QUESTIONS,
    answers: pid ? answers.filter(a => a.participantId === pid) : [],
    puzzle: null,
  };
}
function stateFor(socket) {
  return socket.data.role === 'phone' ? phoneState(socket.data.pid) : fullState();
}
// Join counter for phones: a tiny number instead of the whole guest list.
// The full list only goes to the projector and facilitator screens.
function broadcastRoster() {
  io.to('projectors').to('facilitators').emit('participants_update', participants);
  io.emit('room_count', { count: Object.keys(participants).length });
}

function fullState() {
  return {
    session, participants, answers, teams, questions: QUESTIONS,
    // Anyone connecting mid-puzzle gets the current board straight away.
    puzzle: session.activity === 'puzzle' ? projectorPuzzleState() : null,
    ownit: session.activity === 'ownit' ? ownitBoardState() : null,
  };
}

io.on('connection', (socket) => {
  // Phones say role=phone when they connect and get their snapshot once they
  // identify. Projector, facilitator and older clients get the full state now.
  socket.data.role = (socket.handshake.query && socket.handshake.query.role) || 'screen';
  if (socket.data.role !== 'phone') socket.emit('state_sync', fullState());

  // Projector and facilitator screens announce themselves so they receive
  // the board and the facilitator detail (codes included) respectively.
  socket.on('hello', ({ role } = {}) => {
    // The screen's listeners are ready by the time it says hello, so send the
    // full picture again here (the copy sent on connect can arrive too early).
    if (role === 'projector' || role === 'facilitator') socket.emit('state_sync', fullState());
    if (role === 'projector') {
      socket.join('projectors');
      if (puzzle) socket.emit('puzzle_board', projectorPuzzleState());
      if (ownit) socket.emit('ownit_board', ownitBoardState());
    }
    if (role === 'facilitator') {
      socket.join('facilitators');
      socket.join('projectors'); // facilitator also previews the board
      if (puzzle) {
        socket.emit('puzzle_board', projectorPuzzleState());
        socket.emit('puzzle_facilitator', facilitatorPuzzleState());
      }
      if (ownit) {
        socket.emit('ownit_board', ownitBoardState());
        socket.emit('ownit_facilitator', ownitFacilitatorState());
      }
    }
  });

  // Every phone announces its stored id on (re)connect.
  socket.on('identify', ({ id } = {}) => {
    if (id && participants[id]) {
      markOnline(socket, id);
      if (puzzle) socket.emit('puzzle_me', puzzleStateFor(id));
      if (ownit) socket.emit('ownit_me', ownitStateFor(id));
    }
    if (socket.data.role === 'phone') socket.emit('state_sync', phoneState(socket.data.pid));
  });

  // Phones ask for a fresh snapshot when they come back to the foreground,
  // in case events arrived while the tab was frozen in the background.
  socket.on('request_sync', () => {
    socket.emit('state_sync', stateFor(socket));
    if (puzzle && socket.data.pid) socket.emit('puzzle_me', puzzleStateFor(socket.data.pid));
    if (ownit && socket.data.pid) socket.emit('ownit_me', ownitStateFor(socket.data.pid));
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
      socket.emit('state_sync', stateFor(socket));
      if (puzzle) socket.emit('puzzle_me', puzzleStateFor(id));
      if (ownit) socket.emit('ownit_me', ownitStateFor(id));
      return;
    }

    // Lost identity recovery. Once teams exist, someone whose phone lost its
    // stored id (in-app browser, cleared storage, different browser) can
    // re-enter their name and get their original self, team and role back.
    //  - their old phone is offline: the single offline match is them.
    //  - their old phone is still connected (they scanned again in another
    //    browser): if exactly one person has that name AND gender, it is them.
    // Two people who share a name are never merged while both are online.
    if (teams.length > 0) {
      const base = (n) => n.replace(/\s\(\d+\)$/, '').trim().toLowerCase();
      const wanted = base(name);
      const sameName = Object.values(participants).filter((p) =>
        base(p.name) === wanted && (!gender || p.gender === gender));
      const offline = sameName.filter((p) => !isOnline(p.id));
      const match = offline.length === 1 ? offline[0]
        : (GENDERS.includes(gender) && sameName.length === 1 ? sameName[0] : null);
      if (match) {
        const p = match;
        markOnline(socket, p.id);
        socket.emit('joined', p);
        socket.emit('state_sync', stateFor(socket));
        if (puzzle) socket.emit('puzzle_me', puzzleStateFor(p.id));
        if (ownit) socket.emit('ownit_me', ownitStateFor(p.id));
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
    socket.emit('state_sync', stateFor(socket));
    broadcastRoster();
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
    // Only the big screens draw answers; phones never needed these.
    io.to('projectors').emit('answer_received', answer);
    io.to('projectors').to('facilitators').emit('submitted_update', { submitted: submittedCount(), total: Object.keys(participants).length });
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
    if (ownit) {
      repairOwnItCaptains({ onlyMembership: true });
      pushOwnItTeams([fromTeam && fromTeam.number, target.number].filter(Boolean));
      pushOwnItBoard();
    }
  });

  socket.on('facilitator_delete_participant', ({ participantId } = {}) => {
    const fromTeam = teams.find(t => t.memberIds.includes(participantId));
    delete participants[participantId];
    answers = answers.filter(a => a.participantId !== participantId);
    teams.forEach(t => { t.memberIds = t.memberIds.filter(id => id !== participantId); });
    broadcastRoster();
    // Team rosters changed too, so every phone drops the removed person.
    if (teams.length > 0) io.emit('teams_formed', { teams, participants });
    if (puzzle) {
      repairPuzzleRoles({ onlyMembership: true });
      if (fromTeam) pushTeams([fromTeam.number]);
      scheduleBoard();
    }
    if (ownit) {
      repairOwnItCaptains({ onlyMembership: true });
      if (fromTeam) pushOwnItTeams([fromTeam.number]);
      pushOwnItBoard();
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
    if (!puzzle || session.activity !== 'puzzle') return;
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
    if (!puzzle || session.activity !== 'puzzle') return;
    const d = puzzle.deliveries.find(x => x.id === deliveryId);
    if (!d || d.status === 'unlocked' || d.status === 'pending') return;
    unlockDelivery(d, null, true);
    if (session.state === 'complete') io.emit('session_update', session);
    pushTeams([d.from, d.to]);
    pushBoardNow();
  });

  socket.on('facilitator_puzzle_set_captain', ({ teamNumber, participantId } = {}) => {
    if (!puzzle || session.activity !== 'puzzle' || !teamMembers(teamNumber).includes(participantId)) return;
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
    if (!pid || !puzzle || session.activity !== 'puzzle' || session.state !== 'running') return;
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
    if (!pid || !puzzle || session.activity !== 'puzzle' || session.state !== 'running') return;
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
    const clean = String(code || '').replace(/\D/g, '');
    const d = puzzle.deliveries
      .filter(x => x.to === n && x.status === 'ready' && x.code === clean)
      .sort((a, b) => a.round - b.round)[0];
    if (!d) {
      // The same correct code sent twice (a double tap) is not a wrong code.
      const justUsed = puzzle.deliveries.some(x => x.to === n && x.status === 'unlocked' && x.code === clean && Date.now() - (x.unlockedAt || 0) < 15000);
      if (justUsed) return;
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
    // Correct code: the quarter unlocks straight away.
    att.wrong = 0;
    unlockDelivery(d, null, false);
    if (session.state === 'complete') {
      io.emit('session_update', session);
      pushAllTeams();
    } else {
      // The sender's next round just opened, and its new receiver needs to
      // see the code coming.
      const next = puzzle.deliveries.find(x => x.from === d.from && x.status === 'answering');
      pushTeams([d.to, d.from, next ? next.to : null].filter(Boolean));
    }
    pushBoardNow();
  });
  // ---------- OWN IT: FACILITATOR ----------
  socket.on('facilitator_start_ownit', () => {
    if (teams.length === 0) return; // needs teams first
    if (!ownit) startOwnIt(); else { session.activity = 'ownit'; session.state = 'running'; }
    io.emit('session_update', session);
    io.emit('ownit_started', ownitBoardState());
    pushOwnItTeams(ownit.inPlay);
    pushOwnItBoard();
  });

  socket.on('facilitator_restart_ownit', () => {
    if (teams.length === 0) return;
    startOwnIt(); // fresh case draw, all answers cleared
    io.emit('session_update', session);
    io.emit('ownit_started', ownitBoardState());
    pushOwnItTeams(ownit.inPlay);
    pushOwnItBoard();
  });

  socket.on('facilitator_ownit_reopen', ({ teamNumber } = {}) => {
    if (!ownitLive() || !ownit.teams[teamNumber]) return;
    const t = ownit.teams[teamNumber];
    t.done = false; t.doneAt = null;
    pushOwnItTeams([teamNumber]);
    pushOwnItBoard();
  });

  socket.on('facilitator_ownit_spotlight', ({ teamNumber } = {}) => {
    if (!ownit) return;
    ownit.spotlight = ownit.teams[teamNumber] ? teamNumber : null;
    pushOwnItBoard();
  });

  socket.on('facilitator_ownit_set_captain', ({ teamNumber, participantId } = {}) => {
    if (!ownitLive() || !ownit.teams[teamNumber] || !teamMembers(teamNumber).includes(participantId)) return;
    ownit.teams[teamNumber].captainId = participantId;
    pushOwnItTeams([teamNumber]);
    pushOwnItBoard();
  });

  // ---------- OWN IT: PHONES ----------
  socket.on('ownit_get_me', ({ participantId } = {}) => {
    const pid = whoAmI(participantId);
    if (pid && ownit) socket.emit('ownit_me', ownitStateFor(pid));
  });

  // step: 'problem' | 'solutions' | 'roi'
  socket.on('ownit_submit', ({ participantId, step, problem, solutions, roi } = {}) => {
    const pid = whoAmI(participantId);
    if (!pid || !ownitLive()) return;
    const team = teams.find(t => t.id === participants[pid].teamId);
    const t = team && ownit.teams[team.number];
    if (!t) return;
    const fail = (message) => socket.emit('ownit_error', { message });
    if (t.captainId !== pid) return fail('Only your team captain can submit.');
    if (t.done) return fail('Your team has already submitted. Ask the facilitator if you need to change something.');
    const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    if (step === 'problem') {
      const v = clean(problem);
      if (!v) return fail('Write the problem in one line.');
      if (v.length > OWNIT_PROBLEM_MAX) return fail(`Keep the problem to ${OWNIT_PROBLEM_MAX} characters.`);
      t.problem = v; t.steps.problem = true;
    } else if (step === 'solutions') {
      if (!t.steps.problem) return fail('Submit the problem statement first.');
      if (!Array.isArray(solutions) || solutions.length !== 3) return fail('Write all 3 solutions.');
      const v = solutions.map(clean);
      if (v.some(x => !x)) return fail('Write all 3 solutions.');
      if (v.some(x => x.length > OWNIT_TEXT_MAX)) return fail(`Keep each solution to ${OWNIT_TEXT_MAX} characters.`);
      t.solutions = v; t.steps.solutions = true;
    } else if (step === 'roi') {
      if (!t.steps.problem || !t.steps.solutions) return fail('Submit the problem and the 3 solutions first.');
      const v = clean(roi);
      if (!v) return fail('Answer the ROI question.');
      if (v.length > OWNIT_TEXT_MAX) return fail(`Keep the answer to ${OWNIT_TEXT_MAX} characters.`);
      t.roi = v; t.steps.roi = true;
      t.done = true; t.doneAt = Date.now();
    } else {
      return;
    }
    t.updatedAt = Date.now();
    pushOwnItTeams([team.number]);
    pushOwnItBoard();
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