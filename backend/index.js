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
  { text: "Figuring out something new, what's your instinct?", options: ["Read the instructions", "Watch someone else do it first", "Start pressing buttons", "Ask a person"] },
  { text: "First week somewhere new, which are you?", options: ["The one asking all the questions", "The one watching quietly first"] },
  { text: "When you're stuck, how long before you ask for help?", options: ["Straight away", "About an hour", "I'll search until 2am", "I'll suffer in silence"] },
  { text: "Where do you call home?", options: ["Karachi", "Lahore", "Islamabad or Rawalpindi", "Peshawar", "Quetta", "Somewhere smaller"] },
  { text: "Your order when you actually get to choose:", options: ["Chai", "Coffee", "Cold drink", "Juice", "Just water"] },
  { text: "If this career didn't exist, what would you be doing?", options: ["Musician", "Athlete", "Chef", "Teacher", "Running my own thing", "No idea yet"] }
];

const TEAM_COUNT = 10;
const TEAM_COLOURS = ["#FF2D2D", "#FF7A00", "#FFD400", "#4CD64C", "#00D9C0", "#00A3FF", "#4A5CFF", "#B14CFF", "#FF3D9E", "#FF6B6B"];

const ROCKET_SLOTS = [3, 8, 13];

// 17 icon + value pairs for the 17 non-rocket slots.
// `icon` is an id that maps to an SVG in the frontend's ICONS map — keep the
// two in sync if you add or rename any.
// >>> REPLACE valueText WITH CARNELIAN'S REAL VALUES BOARD BEFORE THE EVENT <<<
// These are placeholders. Each one is read aloud to the room by the team that
// places it, so the wording matters more here than anywhere else in the app.
const JIGSAW_CONTENT = [
  { icon: 'handshake', valueText: 'We show up for each other' },
  { icon: 'target', valueText: 'We aim before we act' },
  { icon: 'flame', valueText: 'We bring energy, not excuses' },
  { icon: 'compass', valueText: 'We choose direction over comfort' },
  { icon: 'chat', valueText: 'We say the honest thing, kindly' },
  { icon: 'sprout', valueText: 'We grow in public, mistakes included' },
  { icon: 'tools', valueText: 'We build things that last' },
  { icon: 'palette', valueText: 'We make the ordinary feel considered' },
  { icon: 'bolt', valueText: 'We move when it matters' },
  { icon: 'puzzle', valueText: "We trust the parts we can't see" },
  { icon: 'mirror', valueText: 'We hold ourselves to our own standard' },
  { icon: 'bridge', valueText: 'We connect people, not just tasks' },
  { icon: 'megaphone', valueText: "We speak up before it's too late" },
  { icon: 'clock', valueText: 'We respect the trust we have earned' },
  { icon: 'globe', valueText: 'We work where our clients are' },
  { icon: 'brain', valueText: 'We think before we template' },
  { icon: 'heart', valueText: 'We care past the invoice' },
];

// ============================================================
// STATE (flat, in-memory)
// ============================================================
let session = {
  activity: 'constellation',   // 'constellation' | 'jigsaw'
  state: 'idle',               // constellation: idle|populating|quiz_open|teams_formed
                                // jigsaw: act1|act2|complete
  jigsawStartedAt: null,
  jigsawClockRunning: false,
};
let participants = {};   // id -> { id, name, joinedAt, teamId }
let answers = [];        // { participantId, questionIndex, optionIndex, answeredAt }
let teams = [];          // { id, number, name, colour, memberIds }
let jigsawPieces = [];   // { slot, ownerTeamNumber, holderTeamNumber, decoderTeamNumber, icon, valueText, code, placed, placedAt, locked }

function resetSession() {
  session = { activity: 'constellation', state: 'idle', jigsawStartedAt: null, jigsawClockRunning: false };
  participants = {};
  answers = [];
  teams = [];
  jigsawPieces = [];
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
    colour: TEAM_COLOURS[i],
    memberIds: []
  }));

  const allParticipantIds = Object.keys(participants);
  const assigned = new Set();

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
        const target = teams
          .filter(t => t.memberIds.length < 11)
          .sort((a, b) => a.memberIds.length - b.memberIds.length)[0];
        target.memberIds.push(pid);
        participants[pid].teamId = target.id;
        assigned.add(pid);
      });
    });
  }

  allParticipantIds.forEach(pid => {
    if (!assigned.has(pid)) {
      const target = teams
        .filter(t => t.memberIds.length < 11)
        .sort((a, b) => a.memberIds.length - b.memberIds.length)[0];
      target.memberIds.push(pid);
      participants[pid].teamId = target.id;
      assigned.add(pid);
    }
  });

  session.state = 'teams_formed';
}

// ============================================================
// JIGSAW
// ============================================================
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Owner of slot N is team N (1-10), or N-10 for slots 11-20.
// Holder = (owner + 3) mod 10. Decoder = (owner + 7) mod 10.
// This guarantees owner, holder and decoder are always three
// different teams, forming one closed loop with no shortcuts.
function generateJigsawPieces() {
  const nonRocketSlots = [];
  for (let s = 1; s <= 20; s++) if (!ROCKET_SLOTS.includes(s)) nonRocketSlots.push(s);
  const shuffledContent = shuffle(JIGSAW_CONTENT);

  const pieces = [];
  for (let slot = 1; slot <= 20; slot++) {
    const ownerTeamNumber = slot <= 10 ? slot : slot - 10;
    const isRocket = ROCKET_SLOTS.includes(slot);
    const holderTeamNumber = ((ownerTeamNumber - 1 + 3) % 10) + 1;
    const decoderTeamNumber = isRocket ? null : ((ownerTeamNumber - 1 + 7) % 10) + 1;

    let icon = null, valueText = null, code = null;
    if (!isRocket) {
      const idx = nonRocketSlots.indexOf(slot);
      const content = shuffledContent[idx];
      icon = content.icon;
      valueText = content.valueText;
      code = randomCode();
    }

    pieces.push({
      slot, ownerTeamNumber, holderTeamNumber, decoderTeamNumber,
      icon, valueText, code, placed: false, placedAt: null, locked: isRocket,
    });
  }
  return pieces;
}

function nonRocketPieces() { return jigsawPieces.filter(p => !ROCKET_SLOTS.includes(p.slot)); }

function projectorJigsawState() {
  return {
    session,
    pieces: jigsawPieces.map(p => ({
      slot: p.slot,
      placed: p.placed,
      icon: p.placed ? p.icon : null,
      valueText: p.placed ? p.valueText : null,
      ownerTeamNumber: p.ownerTeamNumber,
      locked: p.locked,
      // Rocket pieces carry no icon or text by design, so the frontend needs
      // to know which spine segment to draw instead of rendering nothing.
      isRocket: ROCKET_SLOTS.includes(p.slot),
      rocketPart: ROCKET_SLOTS.includes(p.slot)
        ? (p.slot === 3 ? 'nose' : p.slot === 8 ? 'body' : 'flame')
        : null,
    })),
    teams: teams.map(t => ({
      ...t,
      placedCount: jigsawPieces.filter(p => p.ownerTeamNumber === t.number && p.placed).length,
    })),
  };
}

function teamJigsawState(teamNumber) {
  const board = jigsawPieces
    .filter(p => p.ownerTeamNumber === teamNumber)
    .map(p => {
      const isRocket = p.code === null;
      return {
        // Rocket slots have no code/decoder dependency, so the team's own
        // fixed slot number is safe to reveal even before placement.
        slot: (p.placed || isRocket) ? p.slot : null,
        icon: p.placed ? p.icon : null,
        valueText: p.placed ? p.valueText : null,
        placed: p.placed,
        locked: p.locked,
        isRocket,
      };
    });
  const holding = jigsawPieces
    .filter(p => p.holderTeamNumber === teamNumber && p.code !== null) // rocket pieces need no holder
    .map(p => ({ icon: p.icon, code: p.code, ownerTeamNumber: p.ownerTeamNumber, placed: p.placed }));
  const legend = jigsawPieces
    .filter(p => p.decoderTeamNumber === teamNumber)
    .map(p => ({ icon: p.icon, slot: p.slot, ownerTeamNumber: p.ownerTeamNumber, placed: p.placed }));
  return { board, holding, legend };
}

// ============================================================
// SOCKET EVENTS
// ============================================================
io.on('connection', (socket) => {
  socket.emit('state_sync', {
    session, participants, answers, teams, questions: QUESTIONS,
    // Any client connecting or reconnecting mid- or post-jigsaw needs the
    // full current board immediately — otherwise it only learns about
    // placements from live broadcasts, and misses everything that happened
    // before it connected (or during a brief disconnect).
    jigsaw: session.activity === 'jigsaw' ? projectorJigsawState() : null,
  });

  socket.on('join', ({ id, name }) => {
    if (!name || name.trim().length === 0 || name.length > 20) {
      socket.emit('join_error', { message: 'Invalid name' });
      return;
    }
    if (participants[id]) {
      socket.emit('joined', participants[id]);
      return;
    }
    const finalName = uniqueName(name.trim());
    participants[id] = { id, name: finalName, joinedAt: Date.now(), teamId: null };
    socket.emit('joined', participants[id]);
    io.emit('participants_update', participants);
  });

  socket.on('submit_answer', ({ participantId, questionIndex, optionIndex }) => {
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

  socket.on('facilitator_move_participant', ({ participantId, teamId }) => {
    if (!participants[participantId]) return;
    teams.forEach(t => { t.memberIds = t.memberIds.filter(id => id !== participantId); });
    const target = teams.find(t => t.id === teamId);
    if (!target) return;
    target.memberIds.push(participantId);
    participants[participantId].teamId = teamId;
    io.emit('teams_formed', { teams, participants });
  });

  socket.on('facilitator_delete_participant', ({ participantId }) => {
    delete participants[participantId];
    answers = answers.filter(a => a.participantId !== participantId);
    teams.forEach(t => { t.memberIds = t.memberIds.filter(id => id !== participantId); });
    io.emit('participants_update', participants);
  });

  socket.on('facilitator_reset', () => {
    resetSession();
    io.emit('reset', { session, participants, answers, teams });
  });

  // ---------- JIGSAW ----------
  socket.on('facilitator_start_jigsaw', () => {
    if (teams.length === 0) return; // need teams from a completed split first
    jigsawPieces = generateJigsawPieces();
    session.activity = 'jigsaw';
    session.state = 'act1';
    session.jigsawStartedAt = Date.now();
    session.jigsawClockRunning = true;
    io.emit('jigsaw_started', projectorJigsawState());
    io.emit('session_update', session);
  });

  socket.on('facilitator_restart_jigsaw', () => {
    if (session.activity !== 'jigsaw') return;
    jigsawPieces = generateJigsawPieces(); // fresh codes, per acceptance test
    session.state = 'act1';
    session.jigsawStartedAt = Date.now();
    session.jigsawClockRunning = true;
    io.emit('jigsaw_started', projectorJigsawState());
    io.emit('session_update', session);
  });

  socket.on('jigsaw_get_team_state', ({ teamNumber }) => {
    socket.emit('jigsaw_team_state', { teamNumber, ...teamJigsawState(teamNumber) });
  });

  socket.on('jigsaw_place_piece', ({ teamNumber, code, slotNumber }) => {
    const slot = Number(slotNumber);
    const piece = jigsawPieces.find(p => p.slot === slot);

    if (!piece || piece.ownerTeamNumber !== teamNumber) {
      socket.emit('jigsaw_place_error', { message: "That slot number isn't right. Check with the team decoding it." });
      return;
    }
    if (piece.placed) return; // silent no-op, likely a teammate already placed it
    if (piece.locked) {
      socket.emit('jigsaw_place_error', { message: 'This one stays locked until the rest of the board is done.' });
      return;
    }
    if (!piece.code || String(code || '').trim().toUpperCase() !== piece.code) {
      socket.emit('jigsaw_place_error', { message: "That code isn't right. Check with the team holding it." });
      return;
    }

    placePiece(piece);
  });

  socket.on('jigsaw_place_rocket', ({ teamNumber, slotNumber }) => {
    const slot = Number(slotNumber);
    const piece = jigsawPieces.find(p => p.slot === slot);
    if (!piece || piece.ownerTeamNumber !== teamNumber) return;
    if (piece.placed) return;
    if (session.state !== 'act2' || piece.locked) {
      socket.emit('jigsaw_place_error', { message: 'This one stays locked until the rest of the board is done.' });
      return;
    }
    placePiece(piece);
  });

  function placePiece(piece) {
    piece.placed = true;
    piece.placedAt = Date.now();

    io.emit('jigsaw_piece_placed', {
      slot: piece.slot, icon: piece.icon, valueText: piece.valueText, ownerTeamNumber: piece.ownerTeamNumber,
      isRocket: ROCKET_SLOTS.includes(piece.slot),
      rocketPart: ROCKET_SLOTS.includes(piece.slot)
        ? (piece.slot === 3 ? 'nose' : piece.slot === 8 ? 'body' : 'flame')
        : null,
    });
    io.emit('jigsaw_refresh', { teamNumbers: [piece.ownerTeamNumber, piece.holderTeamNumber, piece.decoderTeamNumber].filter(Boolean) });

    if (session.state === 'act1' && !ROCKET_SLOTS.includes(piece.slot)) {
      const allDone = nonRocketPieces().every(p => p.placed);
      if (allDone) {
        jigsawPieces.forEach(p => { if (ROCKET_SLOTS.includes(p.slot)) p.locked = false; });
        session.state = 'act2';
        io.emit('jigsaw_act2_unlocked', {});
        io.emit('session_update', session);
      }
    }

    if (jigsawPieces.every(p => p.placed)) {
      session.state = 'complete';
      session.jigsawClockRunning = false;
      io.emit('session_update', session);
    }

    io.emit('jigsaw_board_update', projectorJigsawState());
  }

  socket.on('facilitator_jigsaw_hint', ({ teamNumber }) => {
    const piece = jigsawPieces.find(p => p.ownerTeamNumber === teamNumber && !p.placed && !p.locked && p.code !== null);
    if (!piece) return;
    io.emit('jigsaw_hint', { teamNumber, slot: piece.slot, icon: piece.icon, code: piece.code });
  });
});

// ============================================================
// HTTP FALLBACK
// ============================================================
app.get('/state', (req, res) => {
  res.json({
    session, participants, answers, teams, questions: QUESTIONS,
    jigsaw: session.activity === 'jigsaw' ? projectorJigsawState() : null,
  });
});

app.get('/health', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));