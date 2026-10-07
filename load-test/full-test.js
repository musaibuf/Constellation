const { io } = require('socket.io-client');

/* ============================================================
   FULL END-TO-END TEST
   Runs the entire event the way it will actually happen, slowly,
   with a verification step after every stage:

     1. 100 people join over a realistic window
     2. Quiz opens, everyone answers at their own pace
     3. Teams form — sizes and assignment checked
     4. Every phone checked for correct team + teammate list
     5. Jigsaw starts — roles distributed across individuals
     6. Full breakdown of who holds which code / knows which slot
     7. Facilitator hint verified against real distributed data
     8. Puzzle solved by each team's captain
     9. Final board and ownership verified

   Run:  $env:SERVER_URL="https://your-backend.onrender.com"
         node full-test.js
   ============================================================ */

const SERVER_URL = process.env.SERVER_URL || 'https://constellation-backend-4d88.onrender.com';
const CLIENT_COUNT = parseInt(process.env.CLIENT_COUNT || '100', 10);
// Seconds to spread the joins over. Real people trickle in across a ~10 min
// window; 120s keeps it realistic without making the test unbearably long.
const RAMP_SECONDS = parseInt(process.env.RAMP_SECONDS || '120', 10);

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function randomId() { return 'e2e_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }

const timings = {};
function mark(l) { timings[l] = Date.now(); }
function since(l) { return ((Date.now() - timings[l]) / 1000).toFixed(1) + 's'; }

function step(n, title) {
  console.log(`\n${'='.repeat(64)}`);
  console.log(`STEP ${n} — ${title}`);
  console.log('='.repeat(64));
}

const problems = [];
function ok(msg) { console.log(`  ✓ ${msg}`); }
function bad(msg) { console.log(`  ⚠ ${msg}`); problems.push(msg); }

/* ---------------- fake participant ---------------- */
function makeParticipant(index) {
  const id = randomId();
  const name = `Rep${index + 1}`;
  const socket = io(SERVER_URL, {
    reconnection: true, reconnectionAttempts: 5, reconnectionDelay: 1000, timeout: 15000,
  });
  let questionsCache = null;
  let hasAnswered = false;
  let connectedOnce = false;
  const view = { id, name, teamNumber: null, teamColour: null, teammates: [], answersConfirmed: 0 };

  function captureTeam(teams, participants) {
    const me = participants[id];
    if (!me) return;
    const myTeam = teams.find((t) => t.id === me.teamId);
    if (!myTeam) return;
    view.teamNumber = myTeam.number;
    view.teamColour = myTeam.colour;
    view.teammates = myTeam.memberIds
      .filter((x) => x !== id)
      .map((x) => participants[x] && participants[x].name)
      .filter(Boolean);
  }

  socket.on('connect', () => { connectedOnce = true; socket.emit('join', { id, name }); });
  socket.on('joined', (p) => { if (p && p.name) view.name = p.name; });
  socket.on('answer_confirmed', () => { view.answersConfirmed++; });
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
      socket.emit('submit_answer', {
        participantId: id, questionIndex: i, optionIndex: Math.floor(Math.random() * q.options.length),
      });
      i++;
      setTimeout(next, 400 + Math.random() * 1400); // people read before tapping
    }
    next();
  }

  return { socket, view, wasConnected: () => connectedOnce };
}

/* ---------------- main ---------------- */
async function run() {
  console.log(`\nFULL END-TO-END TEST`);
  console.log(`Server:       ${SERVER_URL}`);
  console.log(`Participants: ${CLIENT_COUNT}`);
  console.log(`Join window:  ${RAMP_SECONDS}s`);
  mark('start');

  /* ---------- STEP 1: JOIN ---------- */
  step(1, 'People arriving and joining');
  const clients = [];
  const delayPerClient = (RAMP_SECONDS * 1000) / CLIENT_COUNT;
  for (let i = 0; i < CLIENT_COUNT; i++) {
    clients.push(makeParticipant(i));
    if ((i + 1) % 20 === 0) console.log(`  ...${i + 1}/${CLIENT_COUNT} have scanned in (${since('start')})`);
    await wait(delayPerClient);
  }
  console.log('  Waiting for the last joins to settle...');
  await wait(6000);

  const connected = clients.filter((c) => c.wasConnected()).length;
  if (connected === CLIENT_COUNT) ok(`All ${CLIENT_COUNT} phones connected and joined.`);
  else bad(`Only ${connected}/${CLIENT_COUNT} phones connected.`);

  const facilitator = io(SERVER_URL);
  await new Promise((resolve) => facilitator.on('connect', resolve));

  /* ---------- STEP 2: QUIZ ---------- */
  step(2, 'Facilitator opens the quiz — everyone answers at their own pace');
  mark('quiz');
  facilitator.emit('facilitator_start_quiz');
  console.log('  Quiz is open. Letting people work through it...');
  await wait(35000);

  const totalConfirmed = clients.reduce((s, c) => s + c.view.answersConfirmed, 0);
  const fullyDone = clients.filter((c) => c.view.answersConfirmed >= 6).length;
  console.log(`  ${totalConfirmed} answers confirmed by the server.`);
  if (fullyDone >= CLIENT_COUNT * 0.9) ok(`${fullyDone}/${CLIENT_COUNT} finished the full quiz (${since('quiz')}).`);
  else bad(`Only ${fullyDone}/${CLIENT_COUNT} finished all 6 questions.`);

  /* ---------- STEP 3: TEAM FORMATION ---------- */
  step(3, 'Facilitator forms the teams');
  mark('teams');
  facilitator.emit('facilitator_make_teams');
  await wait(4000);

  let stateTeams = [], stateParticipants = {};
  try {
    const res = await fetch(`${SERVER_URL}/state`);
    const data = await res.json();
    stateTeams = data.teams || [];
    stateParticipants = data.participants || {};
  } catch (err) {
    bad(`Could not read /state after team formation: ${err.message}`);
  }

  console.log(`  Teams created: ${stateTeams.length}`);
  stateTeams.forEach((t) => console.log(`    Team ${t.number}: ${t.memberIds.length} members`));

  if (stateTeams.length === 10) ok('Exactly 10 teams created.');
  else bad(`Expected 10 teams, got ${stateTeams.length}.`);

  const totalPeople = Object.keys(stateParticipants).length;
  const assigned = Object.values(stateParticipants).filter((p) => p.teamId).length;
  if (assigned === totalPeople) ok(`All ${totalPeople} participants assigned to a team.`);
  else bad(`${totalPeople - assigned} participant(s) left without a team.`);

  const sizes = stateTeams.map((t) => t.memberIds.length);
  const outOfRange = sizes.filter((s) => s < 9 || s > 11).length;
  if (outOfRange === 0) ok(`All team sizes within 9-11 (actual: ${Math.min(...sizes)}-${Math.max(...sizes)}).`);
  else bad(`${outOfRange} team(s) outside the 9-11 range.`);

  /* ---------- STEP 4: PARTICIPANT SCREENS ---------- */
  step(4, "What each person's phone is showing");
  await wait(2000);

  const withTeam = clients.filter((c) => c.view.teamNumber !== null);
  if (withTeam.length === clients.length) ok(`All ${clients.length} phones received their team.`);
  else bad(`${clients.length - withTeam.length} phone(s) never received a team assignment.`);

  console.log('\n  Sample screens (first 3 teams):');
  for (let n = 1; n <= 3; n++) {
    const s = withTeam.find((c) => c.view.teamNumber === n);
    if (!s) continue;
    console.log(`\n    [${s.view.name}'s phone]`);
    console.log(`      Team ${s.view.teamNumber}   colour ${s.view.teamColour}`);
    console.log(`      Your ${s.view.teammates.length} teammates:`);
    s.view.teammates.forEach((t) => console.log(`        - ${t}`));
  }

  // Verify every roster is complete and mutual, not just present.
  const namesByTeam = {};
  withTeam.forEach((c) => { (namesByTeam[c.view.teamNumber] = namesByTeam[c.view.teamNumber] || []).push(c.view.name); });
  let rosterIssues = 0;
  withTeam.forEach((c) => {
    const expected = (namesByTeam[c.view.teamNumber] || []).filter((n) => n !== c.view.name);
    if (c.view.teammates.length !== expected.length) rosterIssues++;
    c.view.teammates.forEach((mate) => {
      const other = withTeam.find((x) => x.view.name === mate);
      if (other && !other.view.teammates.includes(c.view.name)) rosterIssues++;
    });
  });
  console.log('');
  if (rosterIssues === 0) ok('Every teammate list is complete and mutual (if A lists B, B lists A).');
  else bad(`${rosterIssues} roster inconsistency/inconsistencies found.`);

  const colourByTeam = {};
  let colourIssues = 0;
  withTeam.forEach((c) => {
    if (colourByTeam[c.view.teamNumber] && colourByTeam[c.view.teamNumber] !== c.view.teamColour) colourIssues++;
    colourByTeam[c.view.teamNumber] = c.view.teamColour;
  });
  if (colourIssues === 0) ok('Everyone on the same team sees the same team colour.');
  else bad(`${colourIssues} phone(s) show a different colour than their teammates.`);

  /* ---------- STEP 5: JIGSAW STARTS ---------- */
  step(5, 'Facilitator starts the jigsaw');
  mark('jigsaw');
  facilitator.emit('facilitator_start_jigsaw');
  await wait(2500);

  const jigsawErrors = [];
  facilitator.on('jigsaw_place_error', ({ message }) => jigsawErrors.push(message));

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

  // Roster comes from /state (the server's own record), never from each
  // phone's local memory — that can lag and cause a real person to be missed.
  const membersByTeam = {};
  stateTeams.forEach((t) => {
    membersByTeam[t.number] = t.memberIds.map((id) => ({
      id, name: stateParticipants[id] ? stateParticipants[id].name : id,
    }));
  });

  console.log(`  Asking all ${CLIENT_COUNT} phones individually what they were given...`);
  const boardByTeam = {}, captainByTeam = {};
  const codeHolders = [], slotKnowers = [];
  for (let t = 1; t <= 10; t++) {
    for (const m of (membersByTeam[t] || [])) {
      const data = await fetchStateFor(t, m.id);
      if (!boardByTeam[t]) boardByTeam[t] = data.board;
      if (data.isCaptain) captainByTeam[t] = m;
      data.holding.forEach((h) => codeHolders.push({ holderTeamNumber: t, holderName: m.name, ownerTeamNumber: h.ownerTeamNumber, section: h.section, code: h.code }));
      data.legend.forEach((l) => slotKnowers.push({ knowerTeamNumber: t, knowerName: m.name, ownerTeamNumber: l.ownerTeamNumber, section: l.section, slot: l.slot }));
    }
  }
  ok('Collected every individual role assignment.');

  /* ---------- STEP 6: FULL BREAKDOWN ---------- */
  step(6, 'Who got what — codes, slots, and who can place');
  for (let t = 1; t <= 10; t++) {
    const captain = captainByTeam[t];
    const held = codeHolders.filter((c) => c.holderTeamNumber === t);
    const known = slotKnowers.filter((s) => s.knowerTeamNumber === t);
    const members = membersByTeam[t] || [];
    const roleNames = new Set([captain && captain.name, ...held.map((h) => h.holderName), ...known.map((s) => s.knowerName)].filter(Boolean));
    const noRole = members.filter((m) => !roleNames.has(m.name));

    console.log(`\n  TEAM ${t}  (${members.length} members)`);
    console.log(`    Captain — the only one who can enter codes:  ${captain ? captain.name : '⚠ NONE'}`);

    const ownBoard = boardByTeam[t] || [];
    ownBoard.forEach((row) => {
      console.log(`    Owns Section ${row.section}: ${row.isRocket ? 'rocket piece — no code needed, placed in Act 2' : `needs code from Team ${holderOf(t)}, slot from Team ${decoderOf(t)}`}`);
    });

    if (held.length === 0) console.log(`    Holds no codes (paired with a rocket-only team)`);
    else held.forEach((h) => console.log(`    ${h.holderName} holds Team ${h.ownerTeamNumber} Section ${h.section}'s code:  "${h.code}"`));

    if (known.length === 0) console.log(`    Knows no slots (paired with a rocket-only team)`);
    else known.forEach((s) => console.log(`    ${s.knowerName} knows Team ${s.ownerTeamNumber} Section ${s.section}'s slot:  ${s.slot}`));

    console.log(`    No active role this round (${noRole.length}):  ${noRole.map((m) => m.name).join(', ') || 'none'}`);
  }

  console.log('\n  Checking the distribution rules...');
  let roleProblems = 0;
  for (let t = 1; t <= 10; t++) {
    const captain = captainByTeam[t];
    const held = codeHolders.filter((c) => c.holderTeamNumber === t);
    const known = slotKnowers.filter((s) => s.knowerTeamNumber === t);
    if (!captain) { bad(`Team ${t} has no captain.`); roleProblems++; continue; }
    if (new Set(held.map((h) => h.holderName)).size < held.length) { bad(`Team ${t} gave one person two codes.`); roleProblems++; }
    if (new Set(known.map((s) => s.knowerName)).size < known.length) { bad(`Team ${t} gave one person two slots.`); roleProblems++; }
    const all = [captain.name, ...held.map((h) => h.holderName), ...known.map((s) => s.knowerName)];
    if (new Set(all).size < all.length) { bad(`Team ${t} reused a person across roles.`); roleProblems++; }
  }
  if (roleProblems === 0) ok('Every team: one captain, and each code/slot held by a different person.');

  if (codeHolders.length === 17) ok('Exactly 17 codes exist across the room (one per non-rocket piece).');
  else bad(`Expected 17 codes in the room, found ${codeHolders.length}.`);
  if (slotKnowers.length === 17) ok('Exactly 17 slot numbers exist across the room.');
  else bad(`Expected 17 slot numbers in the room, found ${slotKnowers.length}.`);

  let chainProblems = 0;
  for (let t = 1; t <= 10; t++) {
    (boardByTeam[t] || []).forEach((row) => {
      if (row.isRocket || row.placed) return;
      const codeOk = codeHolders.some((c) => c.holderTeamNumber === holderOf(t) && c.ownerTeamNumber === t && c.section === row.section);
      const slotOk = slotKnowers.some((s) => s.knowerTeamNumber === decoderOf(t) && s.ownerTeamNumber === t && s.section === row.section);
      if (!codeOk || !slotOk) { bad(`Team ${t} Section ${row.section} is missing a ${!codeOk ? 'code' : 'slot'} somewhere in the room.`); chainProblems++; }
    });
  }
  if (chainProblems === 0) ok('Every team can actually reach both halves of what they need.');

  /* ---------- STEP 7: HINT ---------- */
  step(7, 'Facilitator hint button (for a stuck team)');
  for (const hintTeam of [1, 5]) {
    let hint = null;
    facilitator.once('jigsaw_hint', (d) => { hint = d; });
    facilitator.emit('facilitator_jigsaw_hint', { teamNumber: hintTeam });
    await wait(1200);
    if (!hint) { bad(`No hint came back for Team ${hintTeam}.`); continue; }
    if (hint.teamNumber !== hintTeam) { bad(`Hint was tagged Team ${hint.teamNumber}, expected Team ${hintTeam}.`); continue; }
    const codeOk = codeHolders.some((c) => c.ownerTeamNumber === hintTeam && c.section === hint.section && c.code === hint.code);
    const slotOk = slotKnowers.some((s) => s.ownerTeamNumber === hintTeam && s.section === hint.section && s.slot === hint.slot);
    if (codeOk && slotOk) ok(`Team ${hintTeam} hint → Section ${hint.section}, slot ${hint.slot}, code ${hint.code} — matches the real data teammates hold.`);
    else bad(`Team ${hintTeam} hint doesn't match real distributed data: ${JSON.stringify(hint)}`);
  }

  /* ---------- STEP 8: SOLVE ---------- */
  step(8, 'Teams find each other and place their pieces');
  const rocketRows = [];
  for (let t = 1; t <= 10; t++) {
    const captain = captainByTeam[t];
    if (!captain) continue;
    (boardByTeam[t] || []).forEach((row) => {
      if (row.placed) return;
      if (row.isRocket) { rocketRows.push({ teamNumber: t, slot: row.slot, captainId: captain.id }); return; }
      const code = codeHolders.find((c) => c.ownerTeamNumber === t && c.section === row.section);
      const slot = slotKnowers.find((s) => s.ownerTeamNumber === t && s.section === row.section);
      if (code && slot) {
        facilitator.emit('jigsaw_place_piece', { teamNumber: t, code: code.code, slotNumber: slot.slot, participantId: captain.id });
      }
    });
  }
  console.log('  Act 1 placements submitted. Waiting for the board to catch up...');
  await wait(5000);

  console.log(`  Act 2 — ${rocketRows.length} rocket pieces placed live by their captains.`);
  rocketRows.forEach(({ teamNumber, slot, captainId }) =>
    facilitator.emit('jigsaw_place_rocket', { teamNumber, slotNumber: slot, participantId: captainId }));

  /* ---------- STEP 9: FINAL BOARD ---------- */
  step(9, 'Final board');
  let placed = 0, finalState = '', pieces = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    await wait(1000);
    try {
      const res = await fetch(`${SERVER_URL}/state`);
      const data = await res.json();
      pieces = (data.jigsaw && data.jigsaw.pieces) || [];
      placed = pieces.filter((p) => p.placed).length;
      finalState = data.session.state;
      if (placed === 20 && finalState === 'complete') break;
    } catch (err) { /* retry */ }
  }

  console.log(`  Pieces placed:  ${placed}/20`);
  console.log(`  Session state:  ${finalState}`);
  console.log(`  Placement errors: ${jigsawErrors.length}`);
  if (jigsawErrors.length) [...new Set(jigsawErrors)].forEach((m) => console.log(`    - ${m}`));

  if (placed === 20) ok('All 20 pieces placed.'); else bad(`Only ${placed}/20 pieces placed.`);
  if (finalState === 'complete') ok("Session reached 'complete'."); else bad(`Session ended in '${finalState}', expected 'complete'.`);
  if (jigsawErrors.length === 0) ok('No placement errors.'); else bad(`${jigsawErrors.length} placement error(s).`);

  console.log('\n  Final ownership:');
  for (let t = 1; t <= 10; t++) {
    const owned = pieces.filter((p) => p.ownerTeamNumber === t).sort((a, b) => a.slot - b.slot);
    console.log(`    Team ${t}:  ` + owned.map((p) => p.placed ? (p.isRocket ? `slot ${p.slot} (rocket)` : `slot ${p.slot}`) : `slot ${p.slot} UNPLACED`).join('   '));
  }

  /* ---------- SUMMARY ---------- */
  console.log(`\n${'='.repeat(64)}`);
  console.log('SUMMARY');
  console.log('='.repeat(64));
  console.log(`Total duration: ${since('start')}`);
  if (problems.length === 0) {
    console.log('\n✓ EVERYTHING PASSED — joins, quiz, team formation, participant');
    console.log('  screens, role distribution, hints, placement, and completion.\n');
  } else {
    console.log(`\n⚠ ${problems.length} PROBLEM(S) FOUND:\n`);
    problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
    console.log('');
  }

  console.log('Check the projector now — disconnecting everyone in 20s.\n');
  await wait(20000);
  clients.forEach((c) => c.socket.disconnect());
  facilitator.disconnect();
  process.exit(problems.length === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('\nTest crashed:', err);
  process.exit(1);
});