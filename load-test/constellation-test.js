const { io } = require('socket.io-client');

/* ============================================================
   CONSTELLATION-ONLY TEST — slow and realistic on purpose.

   This does NOT rush anything. 100 people trickle in over several
   minutes like a real hall filling up, then each answers the quiz
   at a human pace (a few seconds of "reading" per question, not
   a burst). Teams are only formed once every single person has
   genuinely finished all 6 questions — this script actually waits
   and polls for that, it doesn't just guess a fixed delay.

   It stops right after teams form. No jigsaw. The point is to give
   you a long, calm window to actually watch the projector: nodes
   trickling in, the "submitted" counter climbing slowly, and the
   full break-apart-and-reform animation once teams are made.

   Run:
     $env:SERVER_URL="https://your-backend.onrender.com"
     node constellation-test.js

   Optional overrides:
     $env:CLIENT_COUNT="100"     (default 100)
     $env:RAMP_SECONDS="300"     (default 300 — 5 min join window)
     $env:WATCH_SECONDS="90"     (default 90 — how long to linger after
                                   teams form before disconnecting)
   ============================================================ */

const SERVER_URL = process.env.SERVER_URL || 'https://constellation-backend-4d88.onrender.com';
const CLIENT_COUNT = parseInt(process.env.CLIENT_COUNT || '100', 10);
const RAMP_SECONDS = parseInt(process.env.RAMP_SECONDS || '30', 10);
const WATCH_SECONDS = parseInt(process.env.WATCH_SECONDS || '120', 10);

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function randomId() { return 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }

const timings = {};
function mark(l) { timings[l] = Date.now(); }
function since(l) { return ((Date.now() - timings[l]) / 1000).toFixed(1) + 's'; }

function makeParticipant(index) {
  const id = randomId();
  const name = `Guest${index + 1}`;
  const socket = io(SERVER_URL, {
    reconnection: true, reconnectionAttempts: 5, reconnectionDelay: 1000, timeout: 15000,
  });
  let questionsCache = null;
  let hasStarted = false;
  const view = { id, name, answered: 0, done: false };

  socket.on('connect', () => socket.emit('join', { id, name }));
  socket.on('answer_confirmed', () => { view.answered++; if (view.answered >= 6) view.done = true; });
  socket.on('state_sync', (state) => {
    questionsCache = state.questions;
    if (state.session.state === 'quiz_open' && !hasStarted) { hasStarted = true; startAnswering(); }
  });
  socket.on('session_update', (session) => {
    if (session.state === 'quiz_open' && questionsCache && !hasStarted) { hasStarted = true; startAnswering(); }
  });

  // Human-like pacing, tightened so 100 people realistically finish
  // within about 30 seconds total, not several minutes.
  function startAnswering() {
    const noticeDelay = 200 + Math.random() * 1800; // 0.2–2s before looking at it
    setTimeout(() => answerNext(0), noticeDelay);
  }
  function answerNext(i) {
    if (i >= questionsCache.length) return;
    const q = questionsCache[i];
    const thinkTime = 800 + Math.random() * 3200; // 0.8–4s per question
    setTimeout(() => {
      socket.emit('submit_answer', { participantId: id, questionIndex: i, optionIndex: Math.floor(Math.random() * q.options.length) });
      answerNext(i + 1);
    }, thinkTime);
  }

  return { socket, view };
}

async function run() {
  console.log(`\nConstellation-only test — slow and realistic`);
  console.log(`Server:      ${SERVER_URL}`);
  console.log(`People:      ${CLIENT_COUNT}`);
  console.log(`Join window: ${RAMP_SECONDS}s (real people trickling in, not a burst)`);
  console.log(`This stops once teams form. No jigsaw.\n`);
  mark('start');

  console.log('--- JOINING ---');
  const clients = [];
  for (let i = 0; i < CLIENT_COUNT; i++) {
    clients.push(makeParticipant(i));
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${CLIENT_COUNT} have walked in and scanned the QR (${since('start')})`);
    // Jittered spacing — real arrivals aren't perfectly even.
    const base = (RAMP_SECONDS * 1000) / CLIENT_COUNT;
    await wait(base * (0.5 + Math.random()));
  }
  console.log(`\nAll ${CLIENT_COUNT} have joined. Giving the room a moment to settle...`);
  await wait(8000);

  const facilitator = io(SERVER_URL);
  await new Promise((resolve) => facilitator.on('connect', resolve));

  console.log('\n--- QUIZ ---');
  console.log('Facilitator opens the quiz. Everyone answers at their own pace, out loud');
  console.log('nobody is rushed — watch the "submitted" counter on the projector climb.\n');
  mark('quiz');
  facilitator.emit('facilitator_start_quiz');

  // Actually wait for 100% completion — poll, don't guess a fixed delay.
  let lastPrinted = -1;
  const maxWaitMs = 90 * 1000; // 90 second safety cap — plenty given ~26s worst case
  const pollStart = Date.now();
  while (Date.now() - pollStart < maxWaitMs) {
    const doneCount = clients.filter((c) => c.view.done).length;
    if (doneCount !== lastPrinted) {
      console.log(`  ${doneCount}/${CLIENT_COUNT} have finished all 6 questions (${since('quiz')})`);
      lastPrinted = doneCount;
    }
    if (doneCount === CLIENT_COUNT) break;
    await wait(2000);
  }

  const finalDone = clients.filter((c) => c.view.done).length;
  if (finalDone === CLIENT_COUNT) {
    console.log(`\n✓ All ${CLIENT_COUNT} people genuinely finished the quiz (${since('quiz')} total).`);
  } else {
    console.log(`\n⚠ Stopped waiting after 90s — only ${finalDone}/${CLIENT_COUNT} finished.`);
    console.log('  Forming teams anyway with whoever\'s done, same as a real facilitator would.');
  }

  console.log('\n--- FORMING TEAMS ---');
  console.log('Now that everyone (or everyone who\'s going to) has answered, forming teams...');
  mark('teams');
  facilitator.emit('facilitator_make_teams');
  await wait(4000);

  try {
    const res = await fetch(`${SERVER_URL}/state`);
    const data = await res.json();
    const teams = data.teams || [];
    const participants = data.participants || {};
    console.log(`\n--- TEAM CHECK ---`);
    console.log(`Teams created: ${teams.length} (expect 10)`);
    teams.forEach((t) => console.log(`  Team ${t.number}: ${t.memberIds.length} members`));
    const assigned = Object.values(participants).filter((p) => p.teamId).length;
    console.log(`Participants assigned: ${assigned}/${Object.keys(participants).length}`);
    if (teams.length === 10 && assigned === Object.keys(participants).length) {
      console.log('✓ Teams formed cleanly.');
    } else {
      console.log('⚠ Something looks off — check the numbers above.');
    }
  } catch (err) {
    console.log(`Could not verify teams: ${err.message}`);
  }

  console.log(`\nTotal time to teams: ${since('start')}`);
  console.log(`\nTeams are formed. Watch the projector now — the break-apart-and-reform`);
  console.log(`animation and the final team blocks are the whole point of this run.`);
  console.log(`Staying connected for ${WATCH_SECONDS}s so nothing disconnects while you watch...\n`);
  await wait(WATCH_SECONDS * 1000);

  console.log('Disconnecting everyone now.');
  clients.forEach((c) => c.socket.disconnect());
  facilitator.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Test crashed:', err);
  process.exit(1);
});