const { io } = require('socket.io-client');

// ---------- CONFIG (override via environment variables) ----------
const SERVER_URL = process.env.SERVER_URL || 'https://constellation-backend-4d88.onrender.com';
const CLIENT_COUNT = parseInt(process.env.CLIENT_COUNT || '200', 10);
const RUN_JIGSAW = process.env.RUN_JIGSAW === 'true';
// Spread connections over this many seconds. Real people join over ~10 minutes
// (600s) as they walk in and scan the QR code. Default here is a deliberately
// harsher burst than reality — set RAMP_SECONDS=300 for a realistic run.
const RAMP_SECONDS = parseInt(process.env.RAMP_SECONDS || '30', 10);
// Real phones auto-reconnect (see App.js's socket config). Mirror that here
// instead of counting a transient blip as a hard failure.
const ALLOW_RECONNECT = process.env.ALLOW_RECONNECT !== 'false';

const stats = {
  connected: 0,
  connectErrors: 0,
  joined: 0,
  joinErrors: 0,
  answersSent: 0,
  answersConfirmed: 0,
  disconnectedFinal: 0,
  errorMessages: [],
};

const timings = {};
function mark(label) { timings[label] = Date.now(); }
function elapsedSince(label) { return ((Date.now() - timings[label]) / 1000).toFixed(1) + 's'; }

function randomId() {
  return 'load_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function makeParticipant(index) {
  const id = randomId();
  const name = `Load${index}`;
  const socket = io(SERVER_URL, {
    reconnection: ALLOW_RECONNECT,
    reconnectionAttempts: ALLOW_RECONNECT ? 5 : 0,
    reconnectionDelay: 1000,
    timeout: 15000,
  });
  let questionsCache = null;
  let hasAnswered = false;
  let isConnected = false;
  // Mirrors exactly what this participant's phone would be showing after
  // teams are formed — team number, colour swatch, and teammate roster.
  const view = { id, name, teamNumber: null, teamColour: null, teammates: [] };

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

  socket.on('teams_formed', ({ teams, participants }) => captureTeam(teams, participants));

  socket.on('connect', () => {
    if (!isConnected) { stats.connected++; isConnected = true; }
    socket.emit('join', { id, name });
  });

  socket.on('state_sync', (state) => {
    questionsCache = state.questions;
    if (state.teams && state.teams.length) captureTeam(state.teams, state.participants);
    if (state.session.state === 'quiz_open' && !hasAnswered) {
      hasAnswered = true;
      answerAllQuestions();
    }
  });

  socket.on('joined', (p) => { stats.joined++; if (p && p.name) view.name = p.name; });
  socket.on('join_error', () => { stats.joinErrors++; });
  socket.on('answer_confirmed', () => { stats.answersConfirmed++; });

  socket.on('session_update', (session) => {
    if (session.state === 'quiz_open' && questionsCache && !hasAnswered) {
      hasAnswered = true;
      answerAllQuestions();
    }
  });

  function answerAllQuestions() {
    const total = questionsCache.length;
    let i = 0;
    function next() {
      if (i >= total) return;
      const q = questionsCache[i];
      const optionIndex = Math.floor(Math.random() * q.options.length);
      socket.emit('submit_answer', { participantId: id, questionIndex: i, optionIndex });
      stats.answersSent++;
      i++;
      setTimeout(next, 300 + Math.random() * 1200);
    }
    next();
  }

  socket.on('disconnect', () => { isConnected = false; });
  socket.on('connect_error', (err) => {
    stats.connectErrors++;
    stats.errorMessages.push(err.message);
  });

  return { socket, isConnectedNow: () => isConnected, view };
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function run() {
  console.log(`\nLoad test: ${CLIENT_COUNT} fake participants -> ${SERVER_URL}`);
  console.log(`Ramp: spread over ${RAMP_SECONDS}s  |  Reconnect allowed: ${ALLOW_RECONNECT}\n`);

  mark('start');
  const clients = [];
  const delayPerClient = (RAMP_SECONDS * 1000) / CLIENT_COUNT;
  for (let i = 0; i < CLIENT_COUNT; i++) {
    clients.push(makeParticipant(i));
    if (delayPerClient > 5) await wait(delayPerClient);
  }
  console.log(`All ${CLIENT_COUNT} clients dispatched over ${elapsedSince('start')}.`);

  console.log('Waiting 8s for connections + joins to settle...');
  await wait(8000);
  console.log(`Connected: ${stats.connected}/${CLIENT_COUNT}  |  Joined: ${stats.joined}  |  Join errors: ${stats.joinErrors}  |  Connect errors: ${stats.connectErrors}`);
  console.log(`(${elapsedSince('start')} elapsed so far)\n`);

  console.log('Starting the quiz (acting as facilitator)...');
  mark('quizStart');
  const facilitator = io(SERVER_URL);
  await new Promise((resolve) => facilitator.on('connect', resolve));
  facilitator.emit('facilitator_start_quiz');

  console.log('Waiting ~45s for staggered answers + confirmations to fully land...');
  await wait(45000);
  console.log(`Answers sent: ${stats.answersSent}  |  Confirmed: ${stats.answersConfirmed}`);
  console.log(`(quiz phase took ${elapsedSince('quizStart')})\n`);

  console.log('Making teams...');
  mark('makeTeams');
  facilitator.emit('facilitator_make_teams');
  await wait(3000);
  console.log(`(team formation took ${elapsedSince('makeTeams')})\n`);

  console.log('Fetching final team state from the server (/state) ...');
  try {
    const res = await fetch(`${SERVER_URL}/state`);
    const data = await res.json();
    const teams = data.teams || [];
    const participants = data.participants || {};
    const totalParticipants = Object.keys(participants).length;
    const assigned = Object.values(participants).filter((p) => p.teamId).length;
    const unassigned = totalParticipants - assigned;

    console.log(`\n--- TEAM FORMATION CHECK ---`);
    console.log(`Teams created: ${teams.length} (expect 10)`);
    console.log(`Participants: ${totalParticipants}  |  Assigned to a team: ${assigned}  |  Unassigned: ${unassigned}`);
    console.log('Team sizes:');
    let outOfRange = 0;
    teams.forEach((t) => {
      const size = t.memberIds.length;
      const flag = (size < 9 || size > 11) ? '  <-- outside expected 9-11 range' : '';
      if (flag) outOfRange++;
      console.log(`  Team ${t.number}: ${size}${flag}`);
    });
    if (unassigned > 0) console.log(`\n⚠ ${unassigned} participant(s) joined but never landed on a team — likely joined after the split ran.`);
    if (outOfRange > 0) console.log(`⚠ ${outOfRange} team(s) fell outside the expected 9-11 size range — check the split algorithm.`);
    if (unassigned === 0 && outOfRange === 0) console.log('✓ Every participant has a team, and all team sizes are within range.');
  } catch (err) {
    console.log(`Could not fetch /state to verify team formation: ${err.message}`);
  }

  // ---------- WHAT EACH PARTICIPANT'S PHONE IS SHOWING ----------
  console.log('\n--- PARTICIPANT SCREENS (as each phone sees it) ---');
  const withTeam = clients.filter((c) => c.view.teamNumber !== null);
  const withoutTeam = clients.filter((c) => c.view.teamNumber === null);
  console.log(`${withTeam.length}/${clients.length} phones received a team assignment.`);
  if (withoutTeam.length) {
    console.log(`⚠ ${withoutTeam.length} phone(s) never received one: ${withoutTeam.slice(0, 8).map((c) => c.view.name).join(', ')}${withoutTeam.length > 8 ? '…' : ''}`);
  }

  // Show a few real screens verbatim — one from each of the first 3 teams.
  const samples = [];
  for (let n = 1; n <= 3; n++) {
    const s = withTeam.find((c) => c.view.teamNumber === n);
    if (s) samples.push(s);
  }
  samples.forEach((c) => {
    const v = c.view;
    console.log(`\n  [${v.name}'s phone]`);
    console.log(`    Team ${v.teamNumber}   colour ${v.teamColour}`);
    console.log(`    Your ${v.teammates.length} teammates:`);
    v.teammates.forEach((t) => console.log(`      - ${t}`));
  });

  // Consistency checks across every phone, not just the samples.
  const issues = [];
  const colourByTeam = {};
  const namesByTeam = {};
  withTeam.forEach((c) => {
    const v = c.view;
    if (colourByTeam[v.teamNumber] && colourByTeam[v.teamNumber] !== v.teamColour) {
      issues.push(`Team ${v.teamNumber} shows two different colours across phones (${colourByTeam[v.teamNumber]} vs ${v.teamColour})`);
    }
    colourByTeam[v.teamNumber] = v.teamColour;
    (namesByTeam[v.teamNumber] = namesByTeam[v.teamNumber] || []).push(v.name);
  });

  withTeam.forEach((c) => {
    const v = c.view;
    const expected = (namesByTeam[v.teamNumber] || []).filter((n) => n !== v.name);
    if (v.teammates.length !== expected.length) {
      issues.push(`${v.name} sees ${v.teammates.length} teammates but Team ${v.teamNumber} has ${expected.length} others`);
    }
    // Reciprocity: anyone I list should also list me.
    v.teammates.forEach((mateName) => {
      const mate = withTeam.find((x) => x.view.name === mateName);
      if (mate && !mate.view.teammates.includes(v.name)) {
        issues.push(`${v.name} lists ${mateName}, but ${mateName} does not list ${v.name} back`);
      }
    });
  });

  console.log('');
  if (issues.length === 0) {
    console.log('✓ Every phone shows the right team number, a colour consistent with its teammates, and a complete mutual roster.');
  } else {
    console.log('⚠ Participant screen issues found:');
    [...new Set(issues)].slice(0, 12).forEach((m) => console.log('  -', m));
  }

  if (RUN_JIGSAW) {
    console.log('\n--- JIGSAW ---');
    mark('jigsawStart');
    facilitator.emit('facilitator_start_jigsaw');
    await wait(1500); // let the server generate pieces + codes

    const jigsawStats = { placeErrors: [] };
    facilitator.on('jigsaw_place_error', ({ message }) => jigsawStats.placeErrors.push(message));

    function fetchTeamState(teamNumber) {
      return new Promise((resolve) => {
        function handler(data) {
          if (data.teamNumber === teamNumber) {
            facilitator.off('jigsaw_team_state', handler);
            resolve(data);
          }
        }
        facilitator.on('jigsaw_team_state', handler);
        facilitator.emit('jigsaw_get_team_state', { teamNumber });
      });
    }

    // Same offsets the backend uses — owner, holder, decoder are always
    // three different teams by construction.
    const holderOf = (t) => ((t - 1 + 3) % 10) + 1;
    const decoderOf = (t) => ((t - 1 + 7) % 10) + 1;

    console.log('Fetching board/holding/legend for all 10 teams...');
    const teamStates = {};
    for (let t = 1; t <= 10; t++) teamStates[t] = await fetchTeamState(t);

    console.log('\n--- DEPENDENCY MAP (who holds/decodes for whom) ---');
    for (let t = 1; t <= 10; t++) {
      const holdsForOwners = [...new Set(teamStates[t].holding.map((h) => h.ownerTeamNumber))];
      const decodesForOwners = [...new Set(teamStates[t].legend.map((l) => l.ownerTeamNumber))];
      const holdsStr = holdsForOwners.length ? `Team ${holdsForOwners.join(', Team ')}` : 'none (that team\'s pieces are rocket, no code needed)';
      const decodesStr = decodesForOwners.length ? `Team ${decodesForOwners.join(', Team ')}` : 'none (that team\'s pieces are rocket, no slot needed)';
      console.log(`Team ${t}  ->  holds codes for: ${holdsStr}  |  decodes slots for: ${decodesStr}`);
    }
    console.log('(Every row should show two different teams, and no team should ever hold or decode for itself.)\n');

    console.log('Solving the 17 non-rocket pieces (walking owner -> holder -> decoder for each)...');
    const rocketRows = [];
    for (let t = 1; t <= 10; t++) {
      const board = teamStates[t].board;
      board.forEach((row) => { if (!row.placed && row.isRocket) rocketRows.push({ teamNumber: t, slot: row.slot }); });

      const holderState = teamStates[holderOf(t)];
      const decoderState = teamStates[decoderOf(t)];
      const myCodes = holderState.holding.filter((h) => h.ownerTeamNumber === t && !h.placed);
      const mySlots = decoderState.legend.filter((l) => l.ownerTeamNumber === t && !l.placed);
      myCodes.forEach((codeEntry) => {
        const slotEntry = mySlots.find((s) => s.icon === codeEntry.icon);
        if (slotEntry) facilitator.emit('jigsaw_place_piece', { teamNumber: t, code: codeEntry.code, slotNumber: slotEntry.slot });
      });
    }

    console.log('Waiting for placements + act 2 unlock to register...');
    await wait(3000);

    if (rocketRows.length > 0) {
      console.log(`Placing ${rocketRows.length} rocket piece(s) now that act 2 should be unlocked...`);
      rocketRows.forEach(({ teamNumber, slot }) => facilitator.emit('jigsaw_place_rocket', { teamNumber, slotNumber: slot }));
    }

    console.log('Polling /state until the board actually reports 20/20 (instead of trusting a fixed wait)...');
    let placedCount = 0, finalSessionState = '';
    for (let attempt = 0; attempt < 15; attempt++) {
      await wait(1000);
      try {
        const res = await fetch(`${SERVER_URL}/state`);
        const data = await res.json();
        const pieces = (data.jigsaw && data.jigsaw.pieces) || [];
        placedCount = pieces.filter((p) => p.placed).length;
        finalSessionState = data.session.state;
        if (placedCount === 20 && finalSessionState === 'complete') break;
      } catch (err) { /* keep retrying */ }
    }

    console.log(`(jigsaw solve took ${elapsedSince('jigsawStart')})`);

    try {
      const res = await fetch(`${SERVER_URL}/state`);
      const data = await res.json();
      const pieces = (data.jigsaw && data.jigsaw.pieces) || [];
      placedCount = pieces.filter((p) => p.placed).length;

      console.log(`\n--- JIGSAW CHECK ---`);
      console.log(`Pieces placed: ${placedCount}/20`);
      console.log(`Session state: ${data.session.state} (expect 'complete')`);
      console.log(`Placement errors seen: ${jigsawStats.placeErrors.length}`);
      if (jigsawStats.placeErrors.length) {
        console.log('Sample:');
        [...new Set(jigsawStats.placeErrors)].slice(0, 5).forEach((m) => console.log(' -', m));
      }
      if (placedCount === 20 && data.session.state === 'complete') {
        console.log('✓ All 20 pieces placed, board complete.');
      } else {
        console.log('⚠ Board did not fully complete after 15s of polling:');
        pieces.filter((p) => !p.placed).forEach((p) => console.log(`  Slot ${p.slot} (Team ${p.ownerTeamNumber}) still unplaced`));
      }

      // Rocket pieces render differently (no icon/valueText, a spine part
      // instead) — verify the data the frontend needs for that is actually
      // present, since this is exactly the kind of field a future change
      // could silently drop without the placement count ever catching it.
      const expectedRocket = { 3: 'nose', 8: 'body', 13: 'flame' };
      const rocketIssues = [];
      Object.entries(expectedRocket).forEach(([slotStr, part]) => {
        const slot = Number(slotStr);
        const piece = pieces.find((p) => p.slot === slot);
        if (!piece) { rocketIssues.push(`Slot ${slot} missing from /state entirely`); return; }
        if (!piece.isRocket) rocketIssues.push(`Slot ${slot} not flagged isRocket`);
        if (piece.rocketPart !== part) rocketIssues.push(`Slot ${slot} rocketPart is "${piece.rocketPart}", expected "${part}"`);
      });
      if (rocketIssues.length === 0) {
        console.log('✓ Rocket slots (3, 8, 13) all carry correct isRocket/rocketPart data.');
      } else {
        console.log('⚠ Rocket rendering data looks wrong — this is what caused slots 3/8/13 to render blank before:');
        rocketIssues.forEach((m) => console.log('  -', m));
      }

      console.log('\n--- FINAL OWNERSHIP (who ended up placing what) ---');
      for (let t = 1; t <= 10; t++) {
        const owned = pieces.filter((p) => p.ownerTeamNumber === t).sort((a, b) => a.slot - b.slot);
        const desc = owned.map((p) => {
          if (!p.placed) return `slot ${p.slot} (unplaced)`;
          return p.isRocket ? `slot ${p.slot} (rocket: ${p.rocketPart})` : `slot ${p.slot} (${p.icon})`;
        }).join('  |  ');
        console.log(`Team ${t}  ->  ${desc}`);
      }
    } catch (err) {
      console.log(`Could not fetch /state to verify jigsaw completion: ${err.message}`);
    }
  }

  const stillConnected = clients.filter((c) => c.isConnectedNow()).length;

  console.log('--- SUMMARY ---');
  console.log(`Connected (ever):        ${stats.connected}/${CLIENT_COUNT}`);
  console.log(`Still connected (final): ${stillConnected}/${CLIENT_COUNT}`);
  console.log(`Joined:                  ${stats.joined}`);
  console.log(`Join errors:             ${stats.joinErrors}`);
  console.log(`Connect errors (total, incl. retries): ${stats.connectErrors}`);
  console.log(`Answers sent:            ${stats.answersSent} (expected up to ${stats.joined * 6})`);
  console.log(`Answers confirmed:       ${stats.answersConfirmed}`);
  if (stats.errorMessages.length) {
    console.log(`\nSample error messages:`);
    [...new Set(stats.errorMessages)].slice(0, 5).forEach((m) => console.log(' -', m));
  }
  console.log(`\nTotal test duration: ${elapsedSince('start')}`);
  console.log('\nGo check the projector and facilitator tabs now before the script disconnects everyone.');
  console.log('Press Ctrl+C when you\'re done looking, or wait 15s for auto-cleanup.\n');

  await wait(15000);
  clients.forEach((c) => c.socket.disconnect());
  facilitator.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Load test crashed:', err);
  process.exit(1);
});