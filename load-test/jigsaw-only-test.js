const { io } = require('socket.io-client');

// ---------- CONFIG ----------
const SERVER_URL = process.env.SERVER_URL || 'https://constellation-backend-4d88.onrender.com';
// Exactly 10 keeps the split algorithm's "fill the smallest team first" rule
// naturally landing one person per team — no special-casing needed.
const CLIENT_COUNT = 10;

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function randomId() { return 'jig_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }

const timings = {};
function mark(l) { timings[l] = Date.now(); }
function since(l) { return ((Date.now() - timings[l]) / 1000).toFixed(1) + 's'; }

function makeParticipant(index) {
  const id = randomId();
  const name = `Rep${index + 1}`;
  const socket = io(SERVER_URL, { reconnection: true, reconnectionAttempts: 5, reconnectionDelay: 1000, timeout: 15000 });
  let questionsCache = null;
  let hasAnswered = false;
  const view = { id, name, teamNumber: null, teamColour: null, teammates: [] };

  function captureTeam(teams, participants) {
    const me = participants[id];
    if (!me) return;
    const myTeam = teams.find((t) => t.id === me.teamId);
    if (!myTeam) return;
    view.teamNumber = myTeam.number;
    view.teamColour = myTeam.colour;
    view.teammates = myTeam.memberIds.filter((x) => x !== id).map((x) => participants[x] && participants[x].name).filter(Boolean);
  }

  socket.on('connect', () => socket.emit('join', { id, name }));
  socket.on('state_sync', (state) => {
    questionsCache = state.questions;
    if (state.teams && state.teams.length) captureTeam(state.teams, state.participants);
    if (state.session.state === 'quiz_open' && !hasAnswered) { hasAnswered = true; answerAll(); }
  });
  socket.on('session_update', (session) => {
    if (session.state === 'quiz_open' && questionsCache && !hasAnswered) { hasAnswered = true; answerAll(); }
  });
  socket.on('teams_formed', ({ teams, participants }) => captureTeam(teams, participants));

  function answerAll() {
    const total = questionsCache.length;
    let i = 0;
    function next() {
      if (i >= total) return;
      const q = questionsCache[i];
      socket.emit('submit_answer', { participantId: id, questionIndex: i, optionIndex: Math.floor(Math.random() * q.options.length) });
      i++;
      setTimeout(next, 150 + Math.random() * 250);
    }
    next();
  }

  return { socket, view };
}

async function run() {
  console.log(`\nJigsaw-only test: ${CLIENT_COUNT} reps (one per team) -> ${SERVER_URL}\n`);
  mark('start');

  console.log('Connecting and joining...');
  const clients = [];
  for (let i = 0; i < CLIENT_COUNT; i++) {
    clients.push(makeParticipant(i));
    await wait(150);
  }
  await wait(2000);

  console.log('Starting the quiz...');
  const facilitator = io(SERVER_URL);
  await new Promise((resolve) => facilitator.on('connect', resolve));
  facilitator.emit('facilitator_start_quiz');

  console.log('Waiting for all 10 to answer...');
  await wait(6000);

  console.log('Making teams...');
  facilitator.emit('facilitator_make_teams');
  await wait(2000);

  try {
    const res = await fetch(`${SERVER_URL}/state`);
    const data = await res.json();
    const teams = data.teams || [];
    console.log(`\n--- TEAM CHECK ---`);
    console.log(`Teams: ${teams.length} (expect 10)`);
    teams.forEach((t) => console.log(`  Team ${t.number}: ${t.memberIds.length} member(s)${t.memberIds.length !== 1 ? '  <-- expected exactly 1' : ''}`));
  } catch (err) {
    console.log(`Could not verify teams: ${err.message}`);
  }

  console.log(`\n--- PARTICIPANT SCREENS ---`);
  clients.forEach((c) => console.log(`  ${c.view.name}  ->  Team ${c.view.teamNumber}  (${c.view.teamColour})`));

  // ============================================================
  // JIGSAW
  // ============================================================
  console.log('\n--- JIGSAW ---');
  mark('jigsawStart');
  facilitator.emit('facilitator_start_jigsaw');
  await wait(1500);

  const jigsawStats = { placeErrors: [] };
  facilitator.on('jigsaw_place_error', ({ message }) => jigsawStats.placeErrors.push(message));

  function fetchTeamState(teamNumber, participantId) {
    return new Promise((resolve) => {
      function handler(data) {
        if (data.teamNumber === teamNumber) { facilitator.off('jigsaw_team_state', handler); resolve(data); }
      }
      facilitator.on('jigsaw_team_state', handler);
      facilitator.emit('jigsaw_get_team_state', { teamNumber, participantId });
    });
  }

  const holderOf = (t) => ((t - 1 + 3) % 10) + 1;
  const decoderOf = (t) => ((t - 1 + 7) % 10) + 1;

  // With exactly 1 person per team, that person is the only possible captain
  // and the only possible code/slot holder — role-spreading has nothing to
  // spread across here. Use jigsaw-only-test.js just for wiring/mechanics
  // checks; run load-test.js with a real team size to see roles actually split.
  const repIdByTeam = {};
  clients.forEach((c) => { repIdByTeam[c.view.teamNumber] = c.view.id; });

  console.log('Fetching board/holding/legend for all 10 teams...');
  const teamStates = {};
  for (let t = 1; t <= 10; t++) teamStates[t] = await fetchTeamState(t, repIdByTeam[t]);

  // ---------- FULL CODE/SLOT BREAKDOWN, PER TEAM ----------
  console.log('\n--- WHAT EACH TEAM ACTUALLY HAS ---');
  for (let t = 1; t <= 10; t++) {
    const s = teamStates[t];
    console.log(`\nTeam ${t}`);

    const boardDesc = s.board.map((row) => {
      if (row.isRocket) return `Section ${row.section}: rocket piece (locked until Act 2, no code needed)`;
      return `Section ${row.section}: needs a code + slot number (from Team ${holderOf(t)} and Team ${decoderOf(t)})`;
    }).join('  |  ');
    console.log(`  Owns:    ${boardDesc}`);

    if (s.holding.length === 0) {
      console.log(`  Holds:   none — the team it would hold for owns only rocket pieces, no code exists.`);
    } else {
      const holdDesc = s.holding.map((h) => `Team ${h.ownerTeamNumber} Section ${h.section} = "${h.code}"`).join('  |  ');
      console.log(`  Holds:   ${holdDesc}`);
    }

    if (s.legend.length === 0) {
      console.log(`  Decodes: none — the team it would decode for owns only rocket pieces, no slot to reveal.`);
    } else {
      const decodeDesc = s.legend.map((l) => `Team ${l.ownerTeamNumber} Section ${l.section} = slot ${l.slot}`).join('  |  ');
      console.log(`  Decodes: ${decodeDesc}`);
    }
  }

  // ---------- HINT CHECK ----------
  // Never exercised before this — verify the facilitator's hint button
  // actually reveals the real code and slot currently held for the team,
  // not just that some event fires.
  console.log('\n--- HINT CHECK ---');
  const hintTeam = 1;
  let receivedHint = null;
  facilitator.once('jigsaw_hint', (data) => { receivedHint = data; });
  facilitator.emit('facilitator_jigsaw_hint', { teamNumber: hintTeam });
  await wait(1000);
  if (!receivedHint) {
    console.log(`⚠ No hint event received for Team ${hintTeam}.`);
  } else if (receivedHint.teamNumber !== hintTeam) {
    console.log(`⚠ Hint came back tagged for Team ${receivedHint.teamNumber}, expected Team ${hintTeam}.`);
  } else {
    const holderState = teamStates[holderOf(hintTeam)];
    const decoderState = teamStates[decoderOf(hintTeam)];
    const matchesCode = holderState.holding.some((h) => h.ownerTeamNumber === hintTeam && h.section === receivedHint.section && h.code === receivedHint.code);
    const matchesSlot = decoderState.legend.some((l) => l.ownerTeamNumber === hintTeam && l.section === receivedHint.section && l.slot === receivedHint.slot);
    console.log(matchesCode && matchesSlot
      ? `✓ Hint for Team ${hintTeam} correctly revealed Section ${receivedHint.section}: slot ${receivedHint.slot}, code ${receivedHint.code} — matches the real distributed info.`
      : `⚠ Hint data doesn't match what's really held/known: ${JSON.stringify(receivedHint)}`);
  }

  console.log('\n--- HOW THE 3 ROCKET SLOTS DIFFER ---');
  console.log('Slots 3, 8, 13 skip the code/slot dance entirely. No team holds a code or');
  console.log('decodes a slot for them. Once Act 1 finishes (all 17 others placed), the');
  console.log('owning team just gets a single "Place" button — no fields to fill in.');
  console.log('That is the finale everyone watches together.\n');

  console.log('Solving the 17 non-rocket pieces (matching by section number)...');
  const rocketRows = [];
  for (let t = 1; t <= 10; t++) {
    const board = teamStates[t].board;
    board.forEach((row) => { if (!row.placed && row.isRocket) rocketRows.push({ teamNumber: t, slot: row.slot }); });
    const holderState = teamStates[holderOf(t)];
    const decoderState = teamStates[decoderOf(t)];
    const myCodes = holderState.holding.filter((h) => h.ownerTeamNumber === t && !h.placed);
    const mySlots = decoderState.legend.filter((l) => l.ownerTeamNumber === t && !l.placed);
    myCodes.forEach((codeEntry) => {
      const slotEntry = mySlots.find((s) => s.section === codeEntry.section);
      if (slotEntry) facilitator.emit('jigsaw_place_piece', { teamNumber: t, code: codeEntry.code, slotNumber: slotEntry.slot, participantId: repIdByTeam[t] });
    });
  }

  await wait(3000);
  if (rocketRows.length > 0) {
    console.log(`Placing ${rocketRows.length} rocket piece(s)...`);
    rocketRows.forEach(({ teamNumber, slot }) => facilitator.emit('jigsaw_place_rocket', { teamNumber, slotNumber: slot, participantId: repIdByTeam[teamNumber] }));
  }

  console.log('Polling /state until 20/20...');
  let placedCount = 0, finalState = '';
  for (let attempt = 0; attempt < 15; attempt++) {
    await wait(1000);
    try {
      const res = await fetch(`${SERVER_URL}/state`);
      const data = await res.json();
      const pieces = (data.jigsaw && data.jigsaw.pieces) || [];
      placedCount = pieces.filter((p) => p.placed).length;
      finalState = data.session.state;
      if (placedCount === 20 && finalState === 'complete') break;
    } catch (err) { /* keep retrying */ }
  }
  console.log(`(jigsaw solve took ${since('jigsawStart')})`);

  try {
    const res = await fetch(`${SERVER_URL}/state`);
    const data = await res.json();
    const pieces = (data.jigsaw && data.jigsaw.pieces) || [];
    placedCount = pieces.filter((p) => p.placed).length;

    console.log(`\n--- JIGSAW CHECK ---`);
    console.log(`Pieces placed: ${placedCount}/20`);
    console.log(`Session state: ${data.session.state} (expect 'complete')`);
    console.log(`Placement errors: ${jigsawStats.placeErrors.length}`);
    if (jigsawStats.placeErrors.length) [...new Set(jigsawStats.placeErrors)].forEach((m) => console.log('  -', m));
    console.log(placedCount === 20 && data.session.state === 'complete' ? '✓ Board complete.' : '⚠ Board did not fully complete.');

    console.log('\n--- FINAL OWNERSHIP ---');
    for (let t = 1; t <= 10; t++) {
      const owned = pieces.filter((p) => p.ownerTeamNumber === t).sort((a, b) => a.slot - b.slot);
      console.log(`Team ${t}  ->  ` + owned.map((p) => p.placed ? (p.isRocket ? `slot ${p.slot} (rocket)` : `slot ${p.slot}`) : `slot ${p.slot} (unplaced)`).join('  |  '));
    }
  } catch (err) {
    console.log(`Could not verify completion: ${err.message}`);
  }

  console.log(`\nTotal test duration: ${since('start')}`);
  console.log('Check the projector now. Disconnecting in 15s...');
  await wait(15000);
  clients.forEach((c) => c.socket.disconnect());
  facilitator.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Test crashed:', err);
  process.exit(1);
});