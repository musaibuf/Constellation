const { io } = require('socket.io-client');

// ---------- CONFIG ----------
const SERVER_URL = process.env.SERVER_URL || 'https://constellation-backend-4d88.onrender.com';
const CLIENT_COUNT = parseInt(process.env.CLIENT_COUNT || '100', 10);

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
  const view = { id, name, teamNumber: null };

  function captureTeam(teams, participants) {
    const me = participants[id];
    if (!me) return;
    const myTeam = teams.find((t) => t.id === me.teamId);
    if (myTeam) view.teamNumber = myTeam.number;
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
      setTimeout(next, 60 + Math.random() * 120); // fast — this is a jigsaw mechanics test, not a load test
    }
    next();
  }

  return { socket, view };
}

async function run() {
  console.log(`\nJigsaw test: ${CLIENT_COUNT} participants -> ${SERVER_URL}`);
  console.log('(Fast setup — this is purely to get real-sized teams into the jigsaw quickly, not a connection load test.)\n');
  mark('start');

  console.log('Connecting and joining...');
  const clients = [];
  const delayPerClient = Math.max(5, 8000 / CLIENT_COUNT);
  for (let i = 0; i < CLIENT_COUNT; i++) {
    clients.push(makeParticipant(i));
    await wait(delayPerClient);
  }
  await wait(3000);

  console.log('Starting the quiz...');
  const facilitator = io(SERVER_URL);
  await new Promise((resolve) => facilitator.on('connect', resolve));
  facilitator.emit('facilitator_start_quiz');

  console.log('Waiting for everyone to answer...');
  await wait(8000);

  console.log('Making teams...');
  facilitator.emit('facilitator_make_teams');
  await wait(2000);

  // Fetch the roster from /state — the server's own authoritative record —
  // rather than trusting each fake phone's local memory of its own team,
  // which can lag the server by a moment due to ordinary network delivery
  // timing and cause a real person to go unqueried below.
  let stateTeams = [], stateParticipants = {};
  try {
    const res = await fetch(`${SERVER_URL}/state`);
    const data = await res.json();
    stateTeams = data.teams || [];
    stateParticipants = data.participants || {};
    console.log(`\n--- TEAM CHECK ---`);
    console.log(`Teams: ${stateTeams.length} (expect 10)`);
    stateTeams.forEach((t) => console.log(`  Team ${t.number}: ${t.memberIds.length} member(s)`));
  } catch (err) {
    console.log(`Could not verify teams: ${err.message}`);
  }

  // ============================================================
  // JIGSAW
  // ============================================================
  console.log('\n--- JIGSAW ---');
  mark('jigsawStart');
  facilitator.emit('facilitator_start_jigsaw');
  await wait(1500);

  const jigsawStats = { placeErrors: [] };
  facilitator.on('jigsaw_place_error', ({ message }) => jigsawStats.placeErrors.push(message));

  function fetchStateFor(teamNumber, participantId) {
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

  const membersByTeam = {};
  stateTeams.forEach((t) => {
    membersByTeam[t.number] = t.memberIds.map((id) => ({ id, name: stateParticipants[id] ? stateParticipants[id].name : id }));
  });

  console.log(`Querying every one of ${clients.length} phones individually to see who actually got what...`);
  const boardByTeam = {};
  const captainByTeam = {};
  const codeHolders = [];
  const slotKnowers = [];

  for (let t = 1; t <= 10; t++) {
    const members = membersByTeam[t] || [];
    for (const m of members) {
      const data = await fetchStateFor(t, m.id);
      if (!boardByTeam[t]) boardByTeam[t] = data.board;
      if (data.isCaptain) captainByTeam[t] = m;
      data.holding.forEach((h) => codeHolders.push({ holderTeamNumber: t, holderName: m.name, ownerTeamNumber: h.ownerTeamNumber, section: h.section, code: h.code }));
      data.legend.forEach((l) => slotKnowers.push({ knowerTeamNumber: t, knowerName: m.name, ownerTeamNumber: l.ownerTeamNumber, section: l.section, slot: l.slot }));
    }
  }

  console.log('\n--- WHO GOT WHAT ROLE, PER TEAM ---');
  const roleIssues = [];
  for (let t = 1; t <= 10; t++) {
    const captain = captainByTeam[t];
    console.log(`\nTeam ${t}`);
    console.log(`  Captain (only one who can place):  ${captain ? captain.name : '⚠ none found'}`);

    const held = codeHolders.filter((c) => c.holderTeamNumber === t);
    const known = slotKnowers.filter((s) => s.knowerTeamNumber === t);
    if (held.length === 0) console.log(`  Holds no one's codes (paired with a rocket-only team)`);
    else held.forEach((h) => console.log(`  Holds Team ${h.ownerTeamNumber} Section ${h.section}'s code:  ${h.holderName}`));
    if (known.length === 0) console.log(`  Decodes no one's slots (paired with a rocket-only team)`);
    else known.forEach((s) => console.log(`  Knows Team ${s.ownerTeamNumber} Section ${s.section}'s slot:  ${s.knowerName}`));

    if (!captain) roleIssues.push(`Team ${t} has no captain`);
    const distinctRoleHolders = new Set([captain?.name, ...held.map((h) => h.holderName), ...known.map((s) => s.knowerName)].filter(Boolean));
    const expectedDistinct = 1 + held.length + known.length;
    if (distinctRoleHolders.size < expectedDistinct && (membersByTeam[t] || []).length >= expectedDistinct) {
      roleIssues.push(`Team ${t} reused the same person for more than one role despite having enough members`);
    }
    const uniqueHolderNames = new Set(held.map((h) => h.holderName));
    if (uniqueHolderNames.size < held.length) roleIssues.push(`Team ${t} gave the same person two codes instead of splitting them`);
    const uniqueKnowerNames = new Set(known.map((s) => s.knowerName));
    if (uniqueKnowerNames.size < known.length) roleIssues.push(`Team ${t} gave the same person two slots instead of splitting them`);
  }

  console.log(roleIssues.length === 0
    ? '\n✓ Every team has exactly one captain, and codes/slots are split across different people as designed.'
    : `\n⚠ Role assignment issues:\n` + roleIssues.map((m) => '  - ' + m).join('\n'));

  console.log('\n--- CROSS-CHECK: does every team\'s captain have somewhere to go? ---');
  let crossCheckOk = true;
  for (let t = 1; t <= 10; t++) {
    const board = boardByTeam[t] || [];
    const needsInfo = board.filter((r) => !r.isRocket && !r.placed);
    needsInfo.forEach((row) => {
      const codeExists = codeHolders.some((c) => c.holderTeamNumber === holderOf(t) && c.ownerTeamNumber === t && c.section === row.section);
      const slotExists = slotKnowers.some((s) => s.knowerTeamNumber === decoderOf(t) && s.ownerTeamNumber === t && s.section === row.section);
      if (!codeExists || !slotExists) {
        crossCheckOk = false;
        console.log(`  ⚠ Team ${t} Section ${row.section}: ${!codeExists ? 'no code found on the holder team' : ''} ${!slotExists ? 'no slot found on the decoder team' : ''}`);
      }
    });
  }
  if (crossCheckOk) console.log('  ✓ Every unplaced section has both a findable code and a findable slot somewhere in the room.');

  // ---------- HINT CHECK ----------
  // Never exercised before this — verify the facilitator's hint button
  // actually reveals the real, currently-held code and slot for the
  // requested team, not just that some event fires.
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
    const matchesCode = codeHolders.some((c) => c.ownerTeamNumber === hintTeam && c.section === receivedHint.section && c.code === receivedHint.code);
    const matchesSlot = slotKnowers.some((s) => s.ownerTeamNumber === hintTeam && s.section === receivedHint.section && s.slot === receivedHint.slot);
    if (matchesCode && matchesSlot) {
      console.log(`✓ Hint for Team ${hintTeam} correctly revealed Section ${receivedHint.section}: slot ${receivedHint.slot}, code ${receivedHint.code} — matches what teammates actually hold/know.`);
    } else {
      console.log(`⚠ Hint data doesn't match what's really distributed among teammates: ${JSON.stringify(receivedHint)}`);
    }
  }

  console.log('\nSolving the 17 non-rocket pieces (as each team\'s captain, using what their teammates found)...');
  const rocketRows = [];
  for (let t = 1; t <= 10; t++) {
    const captain = captainByTeam[t];
    if (!captain) continue;
    (boardByTeam[t] || []).forEach((row) => {
      if (row.placed) return;
      if (row.isRocket) { rocketRows.push({ teamNumber: t, slot: row.slot, captainId: captain.id }); return; }
      const codeEntry = codeHolders.find((c) => c.ownerTeamNumber === t && c.section === row.section);
      const slotEntry = slotKnowers.find((s) => s.ownerTeamNumber === t && s.section === row.section);
      if (codeEntry && slotEntry) {
        facilitator.emit('jigsaw_place_piece', { teamNumber: t, code: codeEntry.code, slotNumber: slotEntry.slot, participantId: captain.id });
      }
    });
  }

  await wait(3000);
  if (rocketRows.length > 0) {
    console.log(`Placing ${rocketRows.length} rocket piece(s) as each team's captain...`);
    rocketRows.forEach(({ teamNumber, slot, captainId }) => facilitator.emit('jigsaw_place_rocket', { teamNumber, slotNumber: slot, participantId: captainId }));
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