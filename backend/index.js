const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

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
  { text: "How many years of work experience do you have?", options: ["Less than 2 years", "2 to 5 years", "6 to 10 years", "11 to 15 years", "More than 15 years"] },
  { text: "Which company are you from?", options: ["Pak Suzuki Motor Co. Ltd.", "Faysal Bank Limited", "Aga Khan University", "Martin Dow Limited", "Welnox Limited", "Ismail Industries Limited", "The Hub Power Company Limited", "Carnelian", "Currently not working"] },
  { text: "What's your favourite show?", options: ["Stranger Things", "Brooklyn Nine-Nine", "Sacred Games", "Friends", "Suits", "The Office", "No, I don't watch shows"] },
  { text: "Your go-to drink?", options: ["Chai", "Coffee", "Soft drink", "Just water", "Energy drink", "Green tea / Kahwa"] },
];

// Which question feeds which part of the team balance.
const Q_EXPERIENCE = 0;
const Q_COMPANY = 1;
const Q_SHOW = 2;
const Q_DRINK = 3;
const COMPANY_OTHER = QUESTIONS[Q_COMPANY].options.length - 1; // last option: not mentioned / not working, so not balanced

const TEAM_COUNT = 4;
const TEAM_COLOURS = ["#FF3B3B", "#FFC400", "#1EA7FF", "#2EDB6B"];
const GENDERS = ['man', 'woman'];

// Balance weights, in priority order: gender first, then company, then experience.
// The two fun questions only nudge the result once those three are even.
const WEIGHTS = { gender: 4, company: 2, experience: 1, experienceMean: 0.5, show: 0.1, drink: 0.1 };

// ============================================================
// STATE (flat, in-memory)
// ============================================================
let session = { activity: 'constellation', state: 'idle' }; // idle | populating | quiz_open | teams_formed
let participants = {};   // id -> { id, name, gender, joinedAt, teamId }
let answers = [];        // { participantId, questionIndex, optionIndex, answeredAt }
let teams = [];          // { id, number, name, colour, memberIds }

function resetSession() {
  session = { activity: 'constellation', state: 'idle' };
  participants = {};
  answers = [];
  teams = [];
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
  const perPerson = {};
  answers.forEach(a => { if (participants[a.participantId]) perPerson[a.participantId] = (perPerson[a.participantId] || 0) + 1; });
  return Object.values(perPerson).filter(n => n >= QUESTIONS.length).length;
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
// TEAM SPLIT
// ============================================================
// Every team should look like a small copy of the whole room: same share of
// women, same spread of companies, same spread of experience. The split
// scores how far each team is from that, then keeps swapping pairs of people
// between teams while a swap makes the score better. It does this from many
// random starting points and keeps the best result, so it is fair and still
// different every time "Make teams" is pressed.
function profileOf(pid) {
  const mine = {};
  answers.forEach(a => { if (a.participantId === pid) mine[a.questionIndex] = a.optionIndex; });
  const company = mine[Q_COMPANY];
  return {
    gender: participants[pid].gender,
    company: company === undefined || company === COMPANY_OTHER ? null : company,
    experience: mine[Q_EXPERIENCE] === undefined ? null : mine[Q_EXPERIENCE],
    show: mine[Q_SHOW] === undefined ? null : mine[Q_SHOW],
    drink: mine[Q_DRINK] === undefined ? null : mine[Q_DRINK],
  };
}

const FIELDS = ['gender', 'company', 'experience', 'show', 'drink'];

function runSplit() {
  teams = Array.from({ length: TEAM_COUNT }, (_, i) => ({
    id: `team_${i + 1}`,
    number: i + 1,
    name: `Team ${i + 1}`,
    colour: TEAM_COLOURS[i % TEAM_COLOURS.length],
    memberIds: []
  }));

  const ids = Object.keys(participants);
  if (ids.length === 0) { session.state = 'teams_formed'; return; }

  const prof = {};
  ids.forEach(pid => { prof[pid] = profileOf(pid); });

  // Room totals: what one team "should" hold is total / TEAM_COUNT.
  const totals = {};
  FIELDS.forEach(f => { totals[f] = {}; });
  let expSum = 0, expN = 0;
  ids.forEach(pid => {
    FIELDS.forEach(f => { const v = prof[pid][f]; if (v !== null && v !== undefined) totals[f][v] = (totals[f][v] || 0) + 1; });
    if (prof[pid].experience !== null) { expSum += prof[pid].experience; expN++; }
  });
  const expMean = expN ? expSum / expN : 0;

  // Running tallies per team, so a swap is scored in constant time instead of
  // recounting whole teams. Keeps "Make teams" fast for any room size.
  const ideal = {};
  FIELDS.forEach(f => { ideal[f] = {}; Object.keys(totals[f]).forEach(v => { ideal[f][v] = totals[f][v] / TEAM_COUNT; }); });

  function buildTally(group) {
    const t = { counts: {}, eSum: 0, eN: 0 };
    FIELDS.forEach(f => { t.counts[f] = {}; });
    group.forEach(pid => addTo(t, prof[pid], 1));
    return t;
  }
  function addTo(t, p, d) {
    FIELDS.forEach(f => { const v = p[f]; if (v !== null && v !== undefined) t.counts[f][v] = (t.counts[f][v] || 0) + d; });
    if (p.experience !== null) { t.eSum += d * p.experience; t.eN += d; }
  }
  function meanCost(sum, n) {
    if (!n) return 0;
    const d = sum / n - expMean;
    return WEIGHTS.experienceMean * d * d * n;
  }
  function tallyCost(t) {
    let cost = 0;
    FIELDS.forEach(f => {
      Object.keys(totals[f]).forEach(v => { const diff = (t.counts[f][v] || 0) - ideal[f][v]; cost += WEIGHTS[f] * diff * diff; });
    });
    return cost + meanCost(t.eSum, t.eN);
  }
  // Change in total cost if person x (in team ta) and person y (in team tb) swap.
  function swapDelta(ta, tb, x, y) {
    let delta = 0;
    FIELDS.forEach(f => {
      const vx = x[f], vy = y[f];
      if (vx === vy) return;
      const step = (t, v, d) => {
        if (v === null || v === undefined) return 0;
        const c = (t.counts[f][v] || 0) - ideal[f][v];
        return WEIGHTS[f] * (2 * d * c + d * d);
      };
      delta += step(ta, vx, -1) + step(ta, vy, +1) + step(tb, vy, -1) + step(tb, vx, +1);
    });
    const ex = x.experience === null ? null : x.experience;
    const ey = y.experience === null ? null : y.experience;
    if (ex !== ey) {
      const aSum = ta.eSum - (ex ?? 0) + (ey ?? 0), aN = ta.eN - (ex === null ? 0 : 1) + (ey === null ? 0 : 1);
      const bSum = tb.eSum - (ey ?? 0) + (ex ?? 0), bN = tb.eN - (ey === null ? 0 : 1) + (ex === null ? 0 : 1);
      delta += meanCost(aSum, aN) + meanCost(bSum, bN) - meanCost(ta.eSum, ta.eN) - meanCost(tb.eSum, tb.eN);
    }
    return delta;
  }

  const restarts = ids.length <= 60 ? 80 : ids.length <= 200 ? 30 : ids.length <= 600 ? 12 : 4;
  let best = null, bestCost = Infinity;

  for (let r = 0; r < restarts; r++) {
    // Deal shuffled people round-robin, so team sizes never differ by more than one.
    const groups = Array.from({ length: TEAM_COUNT }, () => []);
    shuffle(ids).forEach((pid, i) => groups[i % TEAM_COUNT].push(pid));
    const tallies = groups.map(buildTally);

    let improved = true, passes = 0;
    while (improved && passes < 40) {
      improved = false; passes++;
      for (let a = 0; a < TEAM_COUNT; a++) {
        for (let b = a + 1; b < TEAM_COUNT; b++) {
          for (let i = 0; i < groups[a].length; i++) {
            for (let j = 0; j < groups[b].length; j++) {
              const x = prof[groups[a][i]], y = prof[groups[b][j]];
              if (swapDelta(tallies[a], tallies[b], x, y) < -1e-9) {
                addTo(tallies[a], x, -1); addTo(tallies[a], y, 1);
                addTo(tallies[b], y, -1); addTo(tallies[b], x, 1);
                [groups[a][i], groups[b][j]] = [groups[b][j], groups[a][i]];
                improved = true;
              }
            }
          }
        }
      }
    }

    const total = tallies.reduce((s, t) => s + tallyCost(t), 0);
    if (total < bestCost - 1e-9) { bestCost = total; best = groups.map(g => g.slice()); }
  }

  // Random team numbers, so Team 1 is not always the "first" group found.
  shuffle(best).forEach((group, i) => {
    teams[i].memberIds = group;
    group.forEach(pid => { participants[pid].teamId = teams[i].id; });
  });

  session.state = 'teams_formed';
}

// ============================================================
// WHO IS CONNECTED
// ============================================================
const onlineSockets = {}; // participantId -> Set of socket ids
function markOnline(socket, pid) {
  if (!pid) return;
  if (socket.data.pid && socket.data.pid !== pid) markOffline(socket);
  socket.data.pid = pid;
  if (!onlineSockets[pid]) onlineSockets[pid] = new Set();
  onlineSockets[pid].add(socket.id);
}
function markOffline(socket) {
  const pid = socket.data.pid;
  if (pid && onlineSockets[pid]) {
    onlineSockets[pid].delete(socket.id);
    if (onlineSockets[pid].size === 0) delete onlineSockets[pid];
  }
}
function isOnline(pid) { return !!onlineSockets[pid]; }

// ============================================================
// SOCKET EVENTS
// ============================================================
// Phones only get their own answers; the big screens get everything.
function phoneState(pid) {
  return {
    session, participants, teams, questions: QUESTIONS,
    answers: pid ? answers.filter(a => a.participantId === pid) : [],
  };
}
function fullState() {
  return { session, participants, answers, teams, questions: QUESTIONS };
}
function stateFor(socket) {
  return socket.data.role === 'phone' ? phoneState(socket.data.pid) : fullState();
}
function broadcastRoster() {
  io.to('projectors').to('facilitators').emit('participants_update', participants);
  io.emit('room_count', { count: Object.keys(participants).length });
}

io.on('connection', (socket) => {
  socket.data.role = (socket.handshake.query && socket.handshake.query.role) || 'screen';
  if (socket.data.role !== 'phone') socket.emit('state_sync', fullState());

  socket.on('hello', ({ role } = {}) => {
    if (role === 'projector' || role === 'facilitator') socket.emit('state_sync', fullState());
    if (role === 'projector') socket.join('projectors');
    if (role === 'facilitator') { socket.join('facilitators'); socket.join('projectors'); }
  });

  // Every phone announces its stored id on (re)connect.
  socket.on('identify', ({ id } = {}) => {
    if (id && participants[id]) markOnline(socket, id);
    if (socket.data.role === 'phone') socket.emit('state_sync', phoneState(socket.data.pid));
  });

  socket.on('request_sync', () => socket.emit('state_sync', stateFor(socket)));

  socket.on('disconnect', () => markOffline(socket));

  socket.on('join', ({ id, name, gender } = {}) => {
    if (!name || name.trim().length === 0 || name.trim().length > 40) {
      socket.emit('join_error', { message: 'Invalid name' });
      return;
    }
    if (participants[id]) {
      markOnline(socket, id);
      socket.emit('joined', participants[id]);
      socket.emit('state_sync', stateFor(socket));
      return;
    }

    // Lost identity recovery once teams exist: someone whose phone lost its
    // stored id can re-enter their name and get their own team back.
    //  - their old phone is offline: the single offline match is them.
    //  - their old phone is still connected: exactly one name + gender match is them.
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
        markOnline(socket, match.id);
        socket.emit('joined', match);
        socket.emit('state_sync', stateFor(socket));
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
    if (!(optionIndex >= 0 && optionIndex < QUESTIONS[questionIndex].options.length)) return;
    const already = answers.find(a => a.participantId === participantId && a.questionIndex === questionIndex);
    if (already) return;

    const answer = { participantId, questionIndex, optionIndex, answeredAt: Date.now() };
    answers.push(answer);
    socket.emit('answer_confirmed', answer);
    io.to('projectors').emit('answer_received', answer);
    io.to('projectors').to('facilitators').emit('submitted_update', { submitted: submittedCount(), total: Object.keys(participants).length });
  });

  // ---------- FACILITATOR CONTROLS ----------
  socket.on('facilitator_start_quiz', () => {
    session.state = 'quiz_open';
    io.emit('session_update', session);
  });

  // Pressing it again reshuffles into a new, equally balanced split.
  socket.on('facilitator_make_teams', () => {
    runSplit();
    io.emit('teams_formed', { teams, participants });
    io.emit('session_update', session);
  });

  socket.on('facilitator_move_participant', ({ participantId, teamId } = {}) => {
    if (!participants[participantId]) return;
    const target = teams.find(t => t.id === teamId);
    if (!target) return;
    teams.forEach(t => { t.memberIds = t.memberIds.filter(id => id !== participantId); });
    target.memberIds.push(participantId);
    participants[participantId].teamId = teamId;
    io.emit('teams_formed', { teams, participants });
  });

  socket.on('facilitator_delete_participant', ({ participantId } = {}) => {
    delete participants[participantId];
    answers = answers.filter(a => a.participantId !== participantId);
    teams.forEach(t => { t.memberIds = t.memberIds.filter(id => id !== participantId); });
    broadcastRoster();
    if (teams.length > 0) io.emit('teams_formed', { teams, participants });
  });

  socket.on('facilitator_reset', () => {
    resetSession();
    io.emit('reset', { session, participants, answers, teams });
  });
});

// ============================================================
// HTTP
// ============================================================
app.get('/state', (req, res) => res.json(fullState()));
app.get('/health', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));