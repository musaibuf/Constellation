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

// ---------- CONFIG ----------
const QUESTIONS = [
  { text: "Figuring out something new, what's your instinct?", options: ["Read the instructions", "Watch someone else do it first", "Start pressing buttons", "Ask a person"] },
  { text: "First week somewhere new, which are you?", options: ["The one asking all the questions", "The one watching quietly first"] },
  { text: "When you're stuck, how long before you ask for help?", options: ["Straight away", "About an hour", "I'll search until 2am", "I'll suffer in silence"] },
  { text: "Where do you call home?", options: ["Karachi", "Lahore", "Islamabad or Rawalpindi", "Peshawar", "Quetta", "Somewhere smaller"] },
  { text: "Your order when you actually get to choose:", options: ["Chai", "Coffee", "Cold drink", "Juice", "Just water"] },
  { text: "If this career didn't exist, what would you be doing?", options: ["Musician", "Athlete", "Chef", "Teacher", "Running my own thing", "No idea yet"] }
];

const TEAM_NAMES = ["Aldebaran", "Vega", "Altair", "Deneb", "Rigel", "Antares", "Mizar", "Fomalhaut", "Alnilam", "Algol"];
const TEAM_COLOURS = ["#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#00C7BE", "#30B0C7", "#007AFF", "#5856D6", "#AF52DE", "#FF2D55"];

// ---------- STATE (flat, in-memory) ----------
let session = { state: 'idle', currentQuestion: null, createdAt: Date.now() };
let participants = {};   // id -> { id, name, joinedAt, teamId }
let answers = [];        // { participantId, questionIndex, optionIndex, answeredAt }
let teams = [];          // { id, name, colour, memberIds }

function resetSession() {
  session = { state: 'idle', currentQuestion: null, createdAt: Date.now() };
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

function answerCountForCurrentQuestion() {
  if (session.currentQuestion === null) return 0;
  return answers.filter(a => a.questionIndex === session.currentQuestion).length;
}

// ---------- SPLIT ALGORITHM ----------
// Walks question 1 through 6 in order. Within each question, groups
// participants by the option they chose, then places each unassigned
// participant into whichever team currently has the fewest members.
// This satisfies the brief's "prefer smallest team" rule without needing
// per-option-per-team tracking, and keeps sizes between 9 and 11.
function runSplit() {
  teams = TEAM_NAMES.map((name, i) => ({
    id: `team_${i}`,
    name,
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

  // anyone who answered nothing at all -> smallest team
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

  session.state = 'split';
}

// ---------- SOCKET EVENTS ----------
io.on('connection', (socket) => {
  socket.emit('state_sync', {
    session,
    participants,
    answers,
    teams,
    questions: QUESTIONS
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
    if (session.state !== 'question' || questionIndex !== session.currentQuestion) return;
    if (!participants[participantId]) return;
    const already = answers.find(a => a.participantId === participantId && a.questionIndex === questionIndex);
    if (already) return;

    const answer = { participantId, questionIndex, optionIndex, answeredAt: Date.now() };
    answers.push(answer);
    io.emit('answer_received', answer);
    io.emit('answer_count', {
      questionIndex,
      count: answerCountForCurrentQuestion(),
      total: Object.keys(participants).length
    });
  });

  // ---------- FACILITATOR CONTROLS ----------
  socket.on('facilitator_next_question', () => {
    const next = session.currentQuestion === null ? 0 : session.currentQuestion + 1;
    if (next >= QUESTIONS.length) return;
    session.state = 'question';
    session.currentQuestion = next;
    io.emit('question_live', { questionIndex: next, question: QUESTIONS[next] });
    io.emit('session_update', session);
  });

  socket.on('facilitator_previous_question', () => {
    if (session.currentQuestion === null || session.currentQuestion === 0) return;
    session.currentQuestion -= 1;
    session.state = 'question';
    io.emit('question_live', { questionIndex: session.currentQuestion, question: QUESTIONS[session.currentQuestion] });
    io.emit('session_update', session);
  });

  socket.on('facilitator_trigger_split', () => {
    runSplit();
    io.emit('split_triggered', { teams, participants });
    io.emit('session_update', session);
  });

  socket.on('facilitator_reset', () => {
    resetSession();
    io.emit('reset', { session, participants, answers, teams });
  });

  socket.on('facilitator_move_participant', ({ participantId, teamId }) => {
    if (!participants[participantId]) return;
    teams.forEach(t => { t.memberIds = t.memberIds.filter(id => id !== participantId); });
    const target = teams.find(t => t.id === teamId);
    if (!target) return;
    target.memberIds.push(participantId);
    participants[participantId].teamId = teamId;
    io.emit('split_triggered', { teams, participants });
  });

  socket.on('facilitator_delete_participant', ({ participantId }) => {
    delete participants[participantId];
    answers = answers.filter(a => a.participantId !== participantId);
    teams.forEach(t => { t.memberIds = t.memberIds.filter(id => id !== participantId); });
    io.emit('participants_update', participants);
  });
});

// ---------- HTTP FALLBACK (polling backup for dropped sockets) ----------
app.get('/state', (req, res) => {
  res.json({ session, participants, answers, teams, questions: QUESTIONS });
});

app.get('/health', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));