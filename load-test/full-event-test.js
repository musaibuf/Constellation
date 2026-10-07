// ============================================================
// FULL EVENT TEST: Digital Team Formation + Accountability Puzzle
// ============================================================
// Plays the whole event like the real day, step by step, and logs everything:
//   PART 1  200 people sign up (plus edge cases: no gender, bad names, duplicates, refresh)
//   PART 2  the quiz (plus edge cases: early answers, double answers, people who never finish)
//   PART 3  team formation (sizes, gender balance, mixing, every phone in sync, lost-phone recovery)
//   PART 4  puzzle starts (captains, partners, first answerers)
//   PART 5  puzzle edge cases (wrong person, refresh, late joiner, deleted captain, people dropping offline)
//   PART 6  all 80 pieces unlocked ONE BY ONE: who answered which scenario, which digit,
//           the code, the partner team, and a sync check of every phone, the projector
//           and the facilitator after each piece
//   PART 7  final checks: pairings, scenario repeats, rotation, behaviour stats match exactly
//
// The full log is also saved to full-event-test-log.txt in the folder you run it from.
// Tip: open /projector on a laptop while it runs and watch the pieces unlock.
//
// WARNING: this RESETS the server first. Never run it during the live event.
// Afterwards press "Reset entire session" on the facilitator screen.
//
// Env options:
//   SERVER_URL    backend URL (required for Render)
//   FEMALE_COUNT  how many of the 200 are female (default 14, try 40 or 0 too)
//   STEP_MS       pause between pieces in ms (default 300, raise it to watch the projector)

const { io } = require('socket.io-client');
const fs = require('fs');

const SERVER_URL = (process.env.SERVER_URL || 'http://localhost:3001').replace(/\/$/, '');
const PEOPLE = 200;
const TEAM_COUNT = 20;
const FEMALE_COUNT = Math.min(PEOPLE, Number(process.env.FEMALE_COUNT || 14));
const STEP_MS = Number(process.env.STEP_MS || 300);
const RUN = Math.random().toString(36).slice(2, 6);
const BEHAVIORS = ['Own It', 'Show Up', 'Ask for Help', 'Lift Others', 'Reflect & Learn'];

// Which behaviour each option of each scenario shows (copied from backend scenarios.js).
// Used only to check the server's stats add up exactly.
const SCENARIO_BEHAVIORS = {"S01":["Show Up","Reflect & Learn","Lift Others"],"S02":["Show Up","Ask for Help","Own It"],"S03":["Own It","Ask for Help","Reflect & Learn"],"S04":["Lift Others","Reflect & Learn","Show Up"],"S05":["Own It","Reflect & Learn","Ask for Help"],"S06":["Own It","Ask for Help","Lift Others"],"S07":["Own It","Ask for Help","Show Up"],"S08":["Show Up","Lift Others","Reflect & Learn"],"S09":["Show Up","Ask for Help","Lift Others"],"S10":["Own It","Reflect & Learn","Lift Others"],"S11":["Lift Others","Show Up","Reflect & Learn"],"S12":["Lift Others","Own It","Ask for Help"],"S13":["Lift Others","Ask for Help","Reflect & Learn"],"S14":["Own It","Reflect & Learn","Show Up"],"S15":["Lift Others","Ask for Help","Own It"],"S16":["Own It","Show Up","Lift Others"],"S17":["Own It","Ask for Help","Show Up"],"S18":["Show Up","Lift Others","Ask for Help"],"S19":["Own It","Reflect & Learn","Lift Others"],"S20":["Own It","Ask for Help","Show Up"],"S21":["Own It","Show Up","Reflect & Learn"],"S22":["Show Up","Reflect & Learn","Ask for Help"],"S23":["Ask for Help","Reflect & Learn","Lift Others"],"S24":["Own It","Reflect & Learn","Show Up"],"S25":["Ask for Help","Lift Others","Reflect & Learn"]};

// ---------------- logging ----------------
const LOG_FILE = 'full-event-test-log.txt';
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'w' });
function log(...a) { const line = a.join(' '); console.log(line); logStream.write(line + '\n'); }
function section(title) { log('\n' + '='.repeat(78)); log('  ' + title); log('='.repeat(78)); }
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  return !!ok;
}
// Same as check, but only prints when something is wrong (keeps the per-piece log readable).
function quiet(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  if (!ok) log(`  FAIL  ${name}${detail ? '  (' + detail + ')' : ''}`);
  return !!ok;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => a + Math.floor(Math.random() * (b - a));
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const lpad = (s, n) => String(s).padStart(n);
async function waitFor(fn, ms = 8000, every = 60) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const v = fn(); if (v) return v; } catch (e) { /* keep waiting */ }
    await sleep(every);
  }
  return null;
}
async function getState() { const r = await fetch(SERVER_URL + '/state'); return r.json(); }
function connect() { return io(SERVER_URL, { transports: ['websocket'], forceNew: true, reconnection: true, reconnectionDelay: 500 }); }

// ---------------- names ----------------
const F_NAMES = ['Ayesha', 'Fatima', 'Sana', 'Hira', 'Maryam', 'Zainab', 'Amna', 'Mahnoor', 'Iqra', 'Noor', 'Aiman', 'Rabia', 'Hina', 'Anum', 'Mehwish', 'Sadia'];
const M_NAMES = ['Ahmed', 'Bilal', 'Hamza', 'Usman', 'Fahad', 'Saad', 'Zain', 'Omar', 'Hassan', 'Asad', 'Danish', 'Faisal', 'Imran', 'Kamran', 'Junaid', 'Shahzaib', 'Taha', 'Waleed', 'Yasir', 'Arsalan', 'Haris', 'Talha', 'Rehan', 'Shoaib', 'Adeel', 'Moiz', 'Rizwan', 'Salman', 'Owais', 'Farhan'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function makeNames() {
  const used = new Set(['Ali K']);
  const out = [];
  let f = 0, m = 0;
  for (let i = 0; i < PEOPLE; i++) {
    const female = i < FEMALE_COUNT;
    let name;
    do {
      name = female
        ? `${F_NAMES[f % F_NAMES.length]} ${LETTERS[Math.floor(f / F_NAMES.length) % 26]}`
        : `${M_NAMES[m % M_NAMES.length]} ${LETTERS[Math.floor(m / M_NAMES.length) % 26]}`;
      if (female) f++; else m++;
    } while (used.has(name));
    used.add(name);
    out.push({ name, gender: female ? 'female' : 'male' });
  }
  return out;
}

// ---------------- bots (one per phone) ----------------
const bots = [];
function makeBot(i, name, gender) {
  const b = { i, id: `t${RUN}_${i}`, name, gender, finalName: null, me: null, errors: [], joinErrors: [], joined: null, teamFromEvent: undefined, deleted: false };
  b.sock = connect();
  b.sock.on('connect', () => { if (b.joined) b.sock.emit('identify', { id: b.id }); });
  b.sock.on('joined', (p) => { b.joined = p; b.finalName = p.name; });
  b.sock.on('join_error', (e) => b.joinErrors.push({ msg: e.message, at: Date.now() }));
  b.sock.on('puzzle_me', (m) => { if (m) b.me = m; });
  b.sock.on('puzzle_error', (e) => b.errors.push({ msg: e.message, at: Date.now() }));
  b.sock.on('teams_formed', ({ teams, participants }) => {
    const p = participants[b.id];
    const t = p && teams.find(x => x.id === p.teamId);
    b.teamFromEvent = t ? t.number : null;
  });
  return b;
}
const live = () => bots.filter(b => !b.deleted);
function teamBots(n) { return live().filter(b => b.sock.connected && b.me && b.me.inPlay && b.me.teamNumber === n); }
async function waitError(b, re, since, ms = 6000) {
  return waitFor(() => b.errors.find(e => e.at >= since && re.test(e.msg)), ms);
}

// ---------------- facilitator + projector screens ----------------
let fac, proj, facState = null, board = null, projCount = 0, facSubmitted = null;

async function main() {
  log(`FULL EVENT TEST  run ${RUN}`);
  log(`Server:  ${SERVER_URL}`);
  log(`People:  ${PEOPLE} (${FEMALE_COUNT} female, ${PEOPLE - FEMALE_COUNT} male), ${TEAM_COUNT} teams`);
  log(`Log file: ${LOG_FILE}`);

  const health = await fetch(SERVER_URL + '/health').then(r => r.text()).catch(() => null);
  if (health !== 'ok') { log('Server is not reachable at /health. Check SERVER_URL (Render may take ~60s to wake up).'); process.exit(1); }

  fac = connect(); proj = connect();
  await Promise.all([new Promise(r => fac.on('connect', r)), new Promise(r => proj.on('connect', r))]);
  fac.on('connect', () => fac.emit('hello', { role: 'facilitator' }));
  proj.on('connect', () => proj.emit('hello', { role: 'projector' }));
  fac.emit('hello', { role: 'facilitator' }); proj.emit('hello', { role: 'projector' });
  fac.on('puzzle_facilitator', (s) => { if (s) facState = s; });
  proj.on('puzzle_board', (s) => { if (s) board = s; });
  proj.on('puzzle_started', (s) => { if (s) board = s; });
  proj.on('participants_update', (p) => { projCount = Object.keys(p).length; });
  fac.on('submitted_update', ({ submitted }) => { facSubmitted = submitted; });
  fac.emit('facilitator_reset');
  await sleep(800);
  const s0 = await getState();
  check('Server reset to an empty room', Object.keys(s0.participants).length === 0 && s0.session.state === 'idle');

  // ======================================================================
  section('PART 1  SIGN UP (200 people)');
  // ======================================================================
  const names = makeNames();
  const DUP_A = PEOPLE - 2, DUP_B = PEOPLE - 1; // two different people, same name
  names[DUP_A] = { name: 'Ali K', gender: names[DUP_A].gender };
  names[DUP_B] = { name: 'Ali K', gender: names[DUP_B].gender };
  const trimmedName = names[6].name;
  names[6] = { name: '  ' + trimmedName + '  ', gender: names[6].gender };
  for (let i = 0; i < PEOPLE; i += 25) {
    for (let j = i; j < Math.min(PEOPLE, i + 25); j++) bots.push(makeBot(j, names[j].name, names[j].gender));
    await sleep(250);
  }
  const allConnected = await waitFor(() => bots.every(b => b.sock.connected), 30000);
  check(`${PEOPLE} phones connected`, allConnected, `${bots.filter(b => b.sock.connected).length}/${PEOPLE}`);

  log('\n  Edge cases at sign up:');
  let t = Date.now();
  bots[0].sock.emit('join', { id: bots[0].id, name: bots[0].name });
  check(`"${bots[0].name}" joins WITHOUT choosing a gender -> rejected`, await waitFor(() => bots[0].joinErrors.find(e => e.at >= t && /gender/i.test(e.msg)), 6000), 'server says: Please select your gender.');
  t = Date.now();
  bots[1].sock.emit('join', { id: bots[1].id, name: bots[1].name, gender: 'other' });
  check(`"${bots[1].name}" sends an invalid gender value -> rejected`, await waitFor(() => bots[1].joinErrors.find(e => e.at >= t && /gender/i.test(e.msg)), 6000));
  t = Date.now();
  bots[2].sock.emit('join', { id: bots[2].id, name: '    ', gender: bots[2].gender });
  check('Blank name -> rejected', await waitFor(() => bots[2].joinErrors.find(e => e.at >= t && /invalid name/i.test(e.msg)), 6000));
  t = Date.now();
  bots[3].sock.emit('join', { id: bots[3].id, name: 'Muhammad Abdullah Khan', gender: bots[3].gender });
  check('Name longer than 20 characters -> rejected', await waitFor(() => bots[3].joinErrors.find(e => e.at >= t && /invalid name/i.test(e.msg)), 6000));
  await sleep(300);
  let st = await getState();
  check('None of the rejected attempts were added to the room', [0, 1, 2, 3].every(i => !st.participants[bots[i].id]), `${Object.keys(st.participants).length} in room`);

  for (const i of [0, 1, 2, 3]) bots[i].sock.emit('join', { id: bots[i].id, name: bots[i].name, gender: bots[i].gender });
  check('Those 4 people retry correctly and get in', await waitFor(() => [0, 1, 2, 3].every(i => bots[i].joined), 6000));

  const dA = bots[DUP_A], dB = bots[DUP_B];
  dA.sock.emit('join', { id: dA.id, name: 'Ali K', gender: dA.gender });
  await waitFor(() => dA.joined, 6000);
  dB.sock.emit('join', { id: dB.id, name: 'Ali K', gender: dB.gender });
  await waitFor(() => dB.joined, 6000);
  check('Two different people both called "Ali K" are kept apart', dA.finalName === 'Ali K' && dB.finalName === 'Ali K (2)', `"${dA.finalName}" and "${dB.finalName}"`);

  bots[6].sock.emit('join', { id: bots[6].id, name: bots[6].name, gender: bots[6].gender });
  await waitFor(() => bots[6].joined, 6000);
  check('Extra spaces around a name are trimmed', bots[6].finalName === trimmedName, `"${bots[6].name}" saved as "${bots[6].finalName}"`);

  bots[7].sock.emit('join', { id: bots[7].id, name: bots[7].name, gender: bots[7].gender });
  await waitFor(() => bots[7].joined, 6000);
  const before7 = Object.keys((await getState()).participants).length;
  bots[7].sock.disconnect(); await sleep(300); bots[7].sock.connect();
  await waitFor(() => bots[7].sock.connected, 6000);
  bots[7].joined = null;
  bots[7].sock.emit('join', { id: bots[7].id, name: bots[7].name, gender: bots[7].gender });
  await waitFor(() => bots[7].joined, 6000);
  const after7 = Object.keys((await getState()).participants).length;
  check(`"${bots[7].name}" refreshes and joins again -> same person, no duplicate`, before7 === after7 && bots[7].joined.id === bots[7].id, `room count ${before7} -> ${after7}`);

  log('\n  Everyone else joining...');
  for (let i = 4; i < PEOPLE; i += 20) {
    for (let j = i; j < Math.min(PEOPLE, i + 20); j++) if (!bots[j].joined) bots[j].sock.emit('join', { id: bots[j].id, name: bots[j].name, gender: bots[j].gender });
    await sleep(120);
  }
  await waitFor(() => bots.every(b => b.joined), 20000);
  st = await getState();
  const inRoom = Object.values(st.participants);
  check(`All ${PEOPLE} people are in the room`, inRoom.length === PEOPLE, `${inRoom.length}`);
  check('Gender recorded for every person', inRoom.every(p => p.gender === 'male' || p.gender === 'female'));
  check(`Female count on the server = ${FEMALE_COUNT}`, inRoom.filter(p => p.gender === 'female').length === FEMALE_COUNT);
  check('Projector join counter shows the same number', await waitFor(() => projCount === PEOPLE, 5000), `projector shows ${projCount}`);

  // ======================================================================
  section('PART 2  QUIZ');
  // ======================================================================
  const Q = st.questions;
  log(`  ${Q.length} questions:`);
  Q.forEach((q, i) => log(`    Q${i + 1}. ${q.text}  [${q.options.join(' | ')}]`));

  log('\n  Edge cases in the quiz:');
  bots[8].sock.emit('submit_answer', { participantId: bots[8].id, questionIndex: 0, optionIndex: 0 });
  await sleep(600);
  st = await getState();
  check(`"${bots[8].finalName}" answers BEFORE the quiz opens -> ignored`, !st.answers.some(a => a.participantId === bots[8].id));

  fac.emit('facilitator_start_quiz');
  await sleep(700);
  check('Quiz opens', (await getState()).session.state === 'quiz_open');

  const PARTIAL = [11, 12, 13], NONE = [14, 15];
  const myAnswers = {};
  for (let i = 0; i < PEOPLE; i += 20) {
    for (let j = i; j < Math.min(PEOPLE, i + 20); j++) {
      const b = bots[j];
      if (NONE.includes(j)) continue;
      const count = PARTIAL.includes(j) ? 3 : Q.length;
      myAnswers[b.id] = [];
      for (let q = 0; q < count; q++) {
        const opt = rand(0, Q[q].options.length);
        myAnswers[b.id][q] = opt;
        b.sock.emit('submit_answer', { participantId: b.id, questionIndex: q, optionIndex: opt });
      }
    }
    await sleep(150);
  }
  // double answer: second one must be ignored
  const firstOpt = myAnswers[bots[9].id][0];
  bots[9].sock.emit('submit_answer', { participantId: bots[9].id, questionIndex: 0, optionIndex: (firstOpt + 1) % Q[0].options.length });
  bots[10].sock.emit('submit_answer', { participantId: bots[10].id, questionIndex: 99, optionIndex: 0 });
  bots[10].sock.emit('submit_answer', { participantId: 'nobody_' + RUN, questionIndex: 0, optionIndex: 0 });

  const expectedAnswers = (PEOPLE - PARTIAL.length - NONE.length) * Q.length + PARTIAL.length * 3;
  const expectedSubmitted = PEOPLE - PARTIAL.length - NONE.length;
  let tries = 0;
  do { await sleep(700); st = await getState(); tries++; } while (st.answers.length < expectedAnswers && tries < 30);
  check(`"${bots[9].finalName}" answers Q1 twice -> only the first answer counts`, st.answers.filter(a => a.participantId === bots[9].id && a.questionIndex === 0).length === 1 && st.answers.find(a => a.participantId === bots[9].id && a.questionIndex === 0).optionIndex === firstOpt);
  check('Answer to a question that does not exist -> ignored', !st.answers.some(a => a.questionIndex === 99));
  check('Answer from an unknown person -> ignored', !st.answers.some(a => a.participantId === 'nobody_' + RUN));
  check(`Total answers stored = ${expectedAnswers}`, st.answers.length === expectedAnswers, `${st.answers.length}`);
  check(`${expectedSubmitted} finished, 3 stopped halfway, 2 answered nothing`, await waitFor(() => facSubmitted === expectedSubmitted, 6000), `facilitator shows ${facSubmitted} submitted`);

  // ======================================================================
  section('PART 3  TEAM FORMATION');
  // ======================================================================
  fac.emit('facilitator_make_teams');
  check('Every phone receives its team', await waitFor(() => bots.every(b => b.teamFromEvent !== undefined), 15000));
  st = await getState();
  const teams = st.teams;
  const P = st.participants;
  const teamOf = {};
  teams.forEach(tm => tm.memberIds.forEach(id => { (teamOf[id] = teamOf[id] || []).push(tm.number); }));

  log('\n  Teams as formed:');
  log(`  ${pad('Team', 6)}${pad('Size', 6)}${pad('F', 4)}${pad('M', 4)}${pad('Mix', 6)}Members`);
  const variety = {};
  teams.forEach(tm => {
    const mem = tm.memberIds.map(id => P[id]);
    const f = mem.filter(p => p.gender === 'female').length;
    let sum = 0;
    Q.forEach((q, qi) => {
      const vals = tm.memberIds.map(id => (myAnswers[id] || [])[qi]).filter(v => v !== undefined);
      const distinct = new Set(vals).size;
      sum += vals.length ? distinct / Math.min(vals.length, q.options.length) : 1;
    });
    variety[tm.number] = Math.round((sum / Q.length) * 100);
    log(`  ${pad(tm.number, 6)}${pad(mem.length, 6)}${pad(f, 4)}${pad(mem.length - f, 4)}${pad(variety[tm.number] + '%', 6)}${mem.map(p => p.name + (p.gender === 'female' ? ' (F)' : '')).join(', ')}`);
  });
  log('  Mix = how varied the answers inside a team are (100% = nobody in the team gave the same answer to any question).');

  log('\n  Checks:');
  const sizes = teams.map(x => x.memberIds.length);
  check(`${TEAM_COUNT} teams created`, teams.length === TEAM_COUNT);
  check('Every person is in exactly one team', Object.keys(P).every(id => (teamOf[id] || []).length === 1), `${Object.keys(P).length} people`);
  check('Team sizes are even (differ by at most 1)', Math.max(...sizes) - Math.min(...sizes) <= 1, `smallest ${Math.min(...sizes)}, largest ${Math.max(...sizes)}`);
  check('People who stopped halfway or answered nothing still got a team', [...PARTIAL, ...NONE].every(i => (teamOf[bots[i].id] || []).length === 1));
  const fPer = teams.map(x => x.memberIds.filter(id => P[id].gender === 'female').length);
  const teamsWithF = fPer.filter(n => n > 0).length;
  if (FEMALE_COUNT >= TEAM_COUNT) {
    check('Every team has at least 1 woman', fPer.every(n => n >= 1), `women per team: ${fPer.join(' ')}`);
  } else {
    check(`Only ${FEMALE_COUNT} women: ${FEMALE_COUNT} teams get exactly 1, the rest get 0`, teamsWithF === FEMALE_COUNT && fPer.every(n => n <= 1), `women per team: ${fPer.join(' ')}`);
  }
  check('No team gets a 2nd woman while another team has none', Math.max(...fPer) - Math.min(...fPer) <= 1);
  check('Teams are mixed (no team where everyone gave the same answer to a question)', teams.every(tm => Q.every((q, qi) => {
    const vals = tm.memberIds.map(id => (myAnswers[id] || [])[qi]).filter(v => v !== undefined);
    return vals.length < 3 || new Set(vals).size > 1;
  })), `average mix ${Math.round(Object.values(variety).reduce((a, b) => a + b, 0) / teams.length)}%`);
  const phoneMismatch = bots.filter(b => {
    const serverTeam = teams.find(x => x.id === P[b.id].teamId);
    return b.teamFromEvent !== (serverTeam ? serverTeam.number : null);
  });
  check('Every phone shows the same team the server has', phoneMismatch.length === 0, `${PEOPLE - phoneMismatch.length}/${PEOPLE} phones match`);

  log('\n  Edge cases after teams:');
  const lost = bots[20];
  lost.sock.disconnect();
  await sleep(600);
  const temp = connect();
  await new Promise(r => temp.on('connect', r));
  const recovered = new Promise(r => temp.on('joined', r));
  temp.emit('join', { id: 'newphone_' + RUN, name: lost.finalName });
  const rec = await Promise.race([recovered, sleep(6000).then(() => null)]);
  check(`"${lost.finalName}" loses their phone storage, re-enters only their name (no gender) -> gets their own team back`, rec && rec.id === lost.id, rec ? `recovered as Team ${(teams.find(x => x.id === rec.teamId) || {}).number}` : 'not recovered');
  temp.close();
  await sleep(400);
  lost.sock.connect();
  await waitFor(() => lost.sock.connected, 6000);

  const twin = connect();
  await new Promise(r => twin.on('connect', r));
  let twinErr = null; twin.on('join_error', (e) => { twinErr = e.message; });
  let twinJoined = null; twin.on('joined', (p) => { twinJoined = p; });
  twin.emit('join', { id: 'twin_' + RUN, name: bots[21].finalName });
  await waitFor(() => twinErr || twinJoined, 6000);
  check(`Someone types "${bots[21].finalName}" while that person is online, no gender -> not merged, asked for gender`, !twinJoined && /gender/i.test(twinErr || ''), twinErr || 'joined (wrong)');
  twin.close();

  const late = makeBot(PEOPLE, 'Late Joiner L', 'male');
  bots.push(late);
  await waitFor(() => late.sock.connected, 6000);
  late.sock.emit('join', { id: late.id, name: late.name, gender: 'male' });
  await waitFor(() => late.joined, 6000);
  st = await getState();
  check('Someone joins AFTER teams are made -> in the room but on no team yet', !!st.participants[late.id] && !st.participants[late.id].teamId);

  // ======================================================================
  section('PART 4  PUZZLE STARTS');
  // ======================================================================
  fac.emit('facilitator_start_puzzle');
  const startedOk = await waitFor(() => live().filter(b => b !== late).every(b => b.me && b.me.inPlay), 20000);
  check('Every team member\'s phone switched to the puzzle', startedOk, `${live().filter(b => b.me && b.me.inPlay).length}/${PEOPLE}`);
  late.sock.emit('puzzle_get_me', { participantId: late.id });
  await waitFor(() => late.me, 5000);
  check('Late joiner (no team yet) gets no puzzle role until the facilitator places them', late.me && late.me.inPlay === false);
  await waitFor(() => board && facState, 6000);
  check('Projector board starts at 0 of 80 unlocked', board && board.unlocked === 0 && board.total === 80, board ? `${board.unlocked}/${board.total}` : 'no board');

  log('\n  Captains and round 1:');
  log(`  ${pad('Team', 6)}${pad('Captain', 18)}${pad('Sends to', 10)}Round 1 answerers`);
  let captainProblems = 0, answererProblems = 0;
  for (let n = 1; n <= TEAM_COUNT; n++) {
    const tb = teamBots(n);
    const caps = tb.filter(b => b.me.isCaptain);
    const names = new Set(tb.map(b => b.me.captainName));
    if (caps.length !== 1 || names.size !== 1) captainProblems++;
    const out = tb[0] && tb[0].me.outgoing;
    if (!out) { answererProblems++; continue; }
    const ansNames = out.answerers.map(a => a.name);
    const ansBots = out.answerers.map(a => tb.find(b => b.finalName === a.name));
    if (ansBots.some(x => !x) || new Set(ansNames).size !== 4 || ansBots.some(x => x && x.me.isCaptain)) answererProblems++;
    log(`  ${pad(n, 6)}${pad(caps[0] ? caps[0].finalName : '-', 18)}${pad('Team ' + out.toTeam, 10)}${ansNames.join(', ')}`);
  }
  check('Each team has exactly 1 captain, and the whole team agrees who it is', captainProblems === 0);
  check('Round 1: 4 different answerers per team, all from that team, captain not answering', answererProblems === 0);

  // ======================================================================
  section('PART 5  PUZZLE EDGE CASES');
  // ======================================================================
  const outOf = (n) => { const b = teamBots(n)[0]; return b && b.me.outgoing; };
  const capOf = (n) => teamBots(n).find(b => b.me.isCaptain);
  const fTeam = (n) => facState && facState.teams.find(x => x.number === n);

  // P1 non-captain tries to enter a code
  const nonCap = teamBots(1).find(b => !b.me.isCaptain);
  t = Date.now();
  nonCap.sock.emit('puzzle_submit_code', { code: '1111' });
  check(`Non-captain "${nonCap.finalName}" (Team 1) tries to enter a code -> blocked`, await waitError(nonCap, /only your team captain/i, t));

  // P2 someone answers a question that belongs to a teammate
  const o2 = outOf(2);
  const owner = teamBots(2).find(b => b.me.tasks.some(x => x.position === 1));
  const intruder = teamBots(2).find(b => !b.me.tasks.some(x => x.position === 1));
  intruder.sock.emit('puzzle_answer', { deliveryId: o2.id, position: 1, optionIndex: 0 });
  await sleep(1200);
  check(`"${intruder.finalName}" tries to answer digit 1, which belongs to "${owner.finalName}" -> ignored`, fTeam(2).outgoing.answerers[0].done === false);

  // P3 invalid option
  owner.sock.emit('puzzle_answer', { deliveryId: o2.id, position: 1, optionIndex: 7 });
  await sleep(1200);
  check('Answer with an option that does not exist (7) -> ignored', fTeam(2).outgoing.answerers[0].done === false);

  // P4 refresh: captain and an answerer
  const cap3 = capOf(3);
  const ans3 = teamBots(3).find(b => b.me.tasks.length > 0);
  const ans3Task = ans3.me.tasks[0];
  cap3.me = null; ans3.me = null;
  cap3.sock.disconnect(); ans3.sock.disconnect();
  await sleep(500);
  cap3.sock.connect(); ans3.sock.connect();
  const back = await waitFor(() => cap3.me && ans3.me, 8000);
  check(`Captain "${cap3.finalName}" refreshes -> still captain`, back && cap3.me.isCaptain);
  check(`Answerer "${ans3.finalName}" refreshes -> same question still waiting (digit ${ans3Task.position}, ${ans3Task.scenario.id})`, back && ans3.me.tasks.some(x => x.deliveryId === ans3Task.deliveryId && x.position === ans3Task.position && x.scenario.id === ans3Task.scenario.id));

  // P5 late joiner moved into a team mid-puzzle
  const teamFour = teams.find(x => x.number === 4);
  fac.emit('facilitator_move_participant', { participantId: late.id, teamId: teamFour.id });
  check('Late joiner moved into Team 4 mid-puzzle -> phone switches to Team 4 puzzle', await waitFor(() => late.me && late.me.inPlay && late.me.teamNumber === 4, 8000));

  // P6 facilitator removes a captain
  const cap5 = capOf(5);
  fac.emit('facilitator_delete_participant', { participantId: cap5.id });
  cap5.deleted = true;
  const newCap5 = await waitFor(() => { const c = capOf(5); return c && c !== cap5 ? c : null; }, 8000);
  check(`Captain "${cap5.finalName}" (Team 5) is removed by the facilitator -> new captain right away`, newCap5, newCap5 ? `now ${newCap5.finalName}` : '');

  // P7 + P8 people dropping offline
  log('\n  Dropping a captain (Team 6) and an answerer (Team 7) offline. Waiting for automatic handover (20 to 35s)...');
  const cap6 = capOf(6);
  const ans7 = teamBots(7).find(b => b.me.tasks.some(x => x.position === 2 && x.answered === null));
  cap6.sock.disconnect(); ans7.sock.disconnect();
  const tDrop = Date.now();
  let t6 = 0, t7 = 0;
  const [h6, h7] = await Promise.all([
    waitFor(() => { const ft = fTeam(6); if (ft && ft.captainId !== cap6.id) { t6 = Date.now(); return ft; } return null; }, 50000, 250),
    waitFor(() => { const ft = fTeam(7); if (ft && ft.outgoing && ft.outgoing.answerers[1].name !== ans7.finalName) { t7 = Date.now(); return ft; } return null; }, 50000, 250),
  ]);
  check(`Captain "${cap6.finalName}" offline -> captain role handed to "${h6 ? h6.captainName : '-'}"`, !!h6, h6 ? `after ~${Math.round((t6 - tDrop) / 1000)}s offline` : 'no handover');
  const newAns7 = h7 ? h7.outgoing.answerers[1].name : null;
  check(`Answerer "${ans7.finalName}" offline -> digit 2 handed to "${newAns7 || '-'}"`, !!h7, h7 ? `after ~${Math.round((t7 - tDrop) / 1000)}s offline` : 'no handover');
  const ans7Bot = live().find(b => b.finalName === newAns7);
  check('New answerer\'s phone now shows the question', await waitFor(() => ans7Bot && ans7Bot.me && ans7Bot.me.tasks.some(x => x.position === 2), 6000));
  cap6.sock.connect(); ans7.sock.connect();
  await waitFor(() => cap6.me && cap6.sock.connected && ans7.sock.connected, 8000);
  await sleep(800);
  check(`"${cap6.finalName}" comes back -> rejoins Team 6 as a normal member`, cap6.me && cap6.me.teamNumber === 6 && !cap6.me.isCaptain);

  // ======================================================================
  section('PART 6  UNLOCKING ALL 80 PIECES, ONE BY ONE');
  // ======================================================================
  log('  For each piece: the sending team\'s 4 answerers, their scenario, choice and digit,');
  log('  the code, the receiving captain, the behaviours explained back, and a sync check.');
  const pairs = [];
  const scenariosByTeam = {};
  const answeredBy = {};
  const tally = { chosen: {}, explained: {}, matched: {}, notExplained: 0, answersGiven: 0, explainedTotal: 0, matchTotal: 0 };
  BEHAVIORS.forEach(b => { tally.chosen[b] = 0; tally.explained[b] = 0; tally.matched[b] = 0; });
  let seq = 0;
  const FACILITATOR_UNLOCK_AT = 40;

  for (let r = 1; r <= 4; r++) {
    for (let A = 1; A <= TEAM_COUNT; A++) {
      seq++;
      const t0 = Date.now();
      const tag = `[${lpad(seq, 2)}/80]`;
      const out = await waitFor(() => { const o = outOf(A); return o && o.round === r ? o : null; }, 10000);
      if (!quiet(`${tag} Team ${A} round ${r} is open`, out)) continue;
      const B = out.toTeam, did = out.id;
      log(`\n${tag} ROUND ${r}   Team ${A}  ->  Team ${B}   (Team ${B} captain: ${out.toCaptainName})`);
      pairs.push({ A, B, r });

      // the 4 answerers each answer their scenario
      const slots = await waitFor(() => {
        const res = [];
        for (let p = 1; p <= 4; p++) {
          const b = teamBots(A).find(x => x.me.tasks.some(k => k.deliveryId === did && k.position === p));
          if (!b) return null;
          res.push(b);
        }
        return res;
      }, 8000);
      if (!quiet(`${tag} all 4 answerers have their question on their phone`, slots)) continue;
      const digits = [];
      const chosenB = [];
      for (let p = 1; p <= 4; p++) {
        const b = slots[p - 1];
        const task = b.me.tasks.find(k => k.deliveryId === did && k.position === p);
        const opt = rand(0, 3);
        b.sock.emit('puzzle_answer', { deliveryId: did, position: p, optionIndex: opt });
        if (seq === 1 && p === 1) b.sock.emit('puzzle_answer', { deliveryId: did, position: p, optionIndex: (opt + 1) % 3 }); // double tap
        const got = await waitFor(() => { const k = b.me.tasks.find(x => x.deliveryId === did && x.position === p); return k && k.answered !== null ? k : null; }, 8000);
        const beh = SCENARIO_BEHAVIORS[task.scenario.id][opt];
        chosenB.push(beh);
        digits.push(opt + 1);
        (scenariosByTeam[A] = scenariosByTeam[A] || []).push(task.scenario.id);
        (answeredBy[A] = answeredBy[A] || new Set()).add(b.id);
        const ok = got && got.digit === opt + 1;
        log(`    digit ${p}  ${pad(b.finalName, 14)} ${task.scenario.id} ${pad(task.scenario.category, 30)} "${task.scenario.text.slice(0, 52)}..."`);
        log(`             chose ${opt + 1} "${task.scenario.options[opt].title}" [${beh}]  -> phone shows digit ${got ? got.digit : '?'}  ${ok ? 'OK' : 'WRONG'}`);
        if (!ok) check(`${tag} digit ${p} recorded correctly`, false);
        if (seq === 1 && p === 1) check(`${tag} edge: double tap on an answer keeps the first choice`, got && got.digit === opt + 1);
      }
      const expectedCode = digits.join('');

      // the sending team all sees the same code
      const sendersOk = await waitFor(() => { const tb = teamBots(A); return tb.length && tb.every(b => b.me.outgoing && b.me.outgoing.id === did && b.me.outgoing.code === expectedCode) ? tb.length : null; }, 8000);
      log(`    code ${expectedCode.split('').join('-')}  shown on ${sendersOk || 0}/${teamBots(A).length} Team ${A} phones ${sendersOk ? 'OK' : 'MISMATCH'}`);
      if (!sendersOk) check(`${tag} code ${expectedCode} on every Team ${A} phone`, false);
      const receiversOk = await waitFor(() => { const tb = teamBots(B); return tb.length && tb.every(b => { const d = b.me.incoming.find(x => x.id === did); return d && d.status === 'ready'; }) ? tb.length : null; }, 8000);
      log(`    Team ${B}: ${receiversOk || 0}/${teamBots(B).length} phones show "Team ${A} on the way" ${receiversOk ? 'OK' : 'MISMATCH'}`);
      if (!receiversOk) check(`${tag} Team ${B} phones see the code coming`, false);

      const prevBoard = board ? board.unlocked : 0;
      const prevRecv = fTeam(B).received, prevSent = fTeam(A).sent;
      let explained = null;

      if (seq === FACILITATOR_UNLOCK_AT) {
        log(`    edge: Team ${B} is "stuck", the facilitator unlocks this piece from the console`);
        fac.emit('facilitator_puzzle_unlock', { deliveryId: did });
      } else {
        const cap = await waitFor(() => capOf(B), 8000);
        if (!quiet(`${tag} Team ${B} has a captain online`, cap)) continue;
        if (seq === 1) {
          log('    edge: captain types 3 wrong codes in a row');
          const wrong = ['1111', '2222', '3333'].filter(c => c !== expectedCode).concat(['1212']).slice(0, 3);
          for (const w of wrong) {
            const tw = Date.now();
            cap.sock.emit('puzzle_submit_code', { code: w });
            await waitError(cap, /doesn't match|three wrong/i, tw);
          }
          check(`${tag} edge: 3 wrong codes -> code entry paused 20s`, await waitFor(() => cap.me.lockedUntil > 0, 5000));
          const tl = Date.now();
          cap.sock.emit('puzzle_submit_code', { code: expectedCode });
          check(`${tag} edge: even the right code is refused during the pause`, await waitError(cap, /too many wrong/i, tl));
          log('    waiting out the 20s pause...');
          await sleep(20500);
        }
        let verified = null;
        for (let attempt = 0; attempt < 6 && !verified; attempt++) {
          cap.sock.emit('puzzle_submit_code', { code: expectedCode });
          verified = await waitFor(() => { const d = cap.me.incoming.find(x => x.id === did); return d && d.status === 'verified'; }, 4000);
        }
        log(`    captain ${cap.finalName} enters ${expectedCode} -> ${verified ? 'accepted' : 'NOT accepted'}`);
        if (!quiet(`${tag} code accepted`, verified)) { fac.emit('facilitator_puzzle_unlock', { deliveryId: did }); await sleep(800); continue; }

        if (seq === 1) {
          const other = teamBots(B).find(b => !b.me.isCaptain);
          const tc = Date.now();
          other.sock.emit('puzzle_confirm', { deliveryId: did, explained: BEHAVIORS.slice(0, 4) });
          check(`${tag} edge: non-captain "${other.finalName}" tries to confirm behaviours -> blocked`, await waitError(other, /only your team captain/i, tc));
        }
        // mostly heard correctly, sometimes misunderstood, sometimes not explained
        explained = chosenB.map(c => { const x = Math.random(); return x < 0.7 ? c : x < 0.9 ? BEHAVIORS[rand(0, 5)] : 'none'; });
        cap.sock.emit('puzzle_confirm', { deliveryId: did, explained });
        log(`    behaviours explained back: ${explained.map((e, j) => e === 'none' ? 'not explained' : e === chosenB[j] ? `${e} (match)` : `${e} (chose ${chosenB[j]})`).join(' | ')}`);
      }

      // tally for the final stats check
      chosenB.forEach((c, j) => {
        tally.chosen[c]++; tally.answersGiven++;
        if (!explained) return;
        const e = explained[j];
        if (e === 'none') { tally.notExplained++; return; }
        tally.explained[e]++; tally.explainedTotal++;
        if (e === c) { tally.matched[c]++; tally.matchTotal++; }
      });

      // everything in sync after the unlock
      const boardOk = await waitFor(() => board && board.unlocked === prevBoard + 1 && board.pieces.find(p => p.slot === B).quarters.filter(Boolean).length === prevRecv + 1, 8000);
      const recvOk = await waitFor(() => { const tb = teamBots(B); return tb.every(b => b.me.received === prevRecv + 1 && b.me.piece.quarters.filter(Boolean).length === prevRecv + 1) ? tb.length : null; }, 8000);
      const sentOk = await waitFor(() => { const tb = teamBots(A); return tb.every(b => b.me.sent === prevSent + 1) ? tb.length : null; }, 8000);
      const facOk = await waitFor(() => fTeam(B).received === prevRecv + 1 && fTeam(A).sent === prevSent + 1, 8000);
      const feedOk = board && board.feed[0] && board.feed[0].from === A && board.feed[0].to === B;
      let nextInfo = 'all 4 codes delivered';
      if (r < 4) {
        const nxt = await waitFor(() => { const o = outOf(A); return o && o.round === r + 1 ? o : null; }, 8000);
        nextInfo = nxt ? `next: Team ${A} round ${r + 1} -> Team ${nxt.toTeam}` : 'NEXT ROUND DID NOT OPEN';
        if (!nxt) check(`${tag} Team ${A} round ${r + 1} opens`, false);
      }
      const allOk = boardOk && recvOk && sentOk && facOk && feedOk;
      log(`    UNLOCKED  Team ${B} piece ${prevRecv + 1}/4, board ${board ? board.unlocked : '?'}/80, Team ${A} sent ${prevSent + 1}/4, ${nextInfo}`);
      log(`    sync: projector ${boardOk ? 'OK' : 'X'} | Team ${B} phones ${recvOk || 0}/${teamBots(B).length} | Team ${A} phones ${sentOk || 0}/${teamBots(A).length} | facilitator ${facOk ? 'OK' : 'X'} | feed ${feedOk ? 'OK' : 'X'}   (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      check(`${tag} Team ${A} -> Team ${B} delivered and everything in sync`, allOk);
      if (STEP_MS) await sleep(STEP_MS);
    }
  }

  // ======================================================================
  section('PART 7  FINAL CHECKS');
  // ======================================================================
  check('Board complete: 80 of 80 unlocked', await waitFor(() => board && board.state === 'complete' && board.unlocked === 80, 10000), board ? `${board.unlocked}/80, ${board.state}` : '');
  check('Every phone shows the puzzle as complete', await waitFor(() => live().filter(b => b.sock.connected && b.me && b.me.inPlay).every(b => b.me.state === 'complete'), 10000));

  log('\n  Who sent to whom:');
  const sendsTo = {}, recvFrom = {};
  pairs.forEach(({ A, B }) => { (sendsTo[A] = sendsTo[A] || []).push(B); (recvFrom[B] = recvFrom[B] || []).push(A); });
  for (let n = 1; n <= TEAM_COUNT; n++) log(`  Team ${lpad(n, 2)}  sent to ${pad((sendsTo[n] || []).join(', '), 16)} received from ${(recvFrom[n] || []).join(', ')}`);
  const key = (a, b) => `${a}>${b}`;
  const pairSet = new Map();
  pairs.forEach(({ A, B }) => pairSet.set(key(A, B), (pairSet.get(key(A, B)) || 0) + 1));
  check('No team was ever paired with itself', pairs.every(p => p.A !== p.B));
  check('No pair repeated', [...pairSet.values()].every(v => v === 1));
  check('No straight swaps (A sends to B and B sends to A)', pairs.every(({ A, B }) => !pairSet.has(key(B, A))));
  check('Each team sent to 4 different teams and received from 4 different teams', Object.keys(sendsTo).length === TEAM_COUNT && Object.values(sendsTo).every(v => new Set(v).size === 4) && Object.values(recvFrom).every(v => new Set(v).size === 4));
  const sequential = pairs.filter(({ A, B }) => B === (A % TEAM_COUNT) + 1).length;
  check('Pairings are shuffled, not Team N to Team N+1', sequential <= 10, `${sequential} of 80 happen to be N to N+1`);

  log('\n  Scenarios and who answered, per team:');
  let repeatTeams = 0;
  for (let n = 1; n <= TEAM_COUNT; n++) {
    const sc = scenariosByTeam[n] || [];
    const dupes = sc.length - new Set(sc).size;
    if (dupes) repeatTeams++;
    log(`  Team ${lpad(n, 2)}  ${sc.length} scenarios, ${dupes ? dupes + ' repeated' : 'no repeats'}, answered by ${(answeredBy[n] || new Set()).size} different people  [${sc.join(' ')}]`);
  }
  check('No team saw the same scenario twice', repeatTeams === 0);
  check('Answering was rotated (each team had at least 8 different answerers)', Object.values(answeredBy).every(s => s.size >= 8));

  fac.emit('facilitator_puzzle_results', { show: true });
  await waitFor(() => board && board.showResults && board.stats, 6000);
  const s = board && board.stats;
  log('\n  Behaviour stats  (test count vs server count)');
  log(`  ${pad('Behaviour', 18)}${pad('Chosen', 16)}${pad('Heard back', 16)}Explained as`);
  BEHAVIORS.forEach(b => log(`  ${pad(b, 18)}${pad(`${tally.chosen[b]} vs ${s ? s.chosen[b] : '?'}`, 16)}${pad(`${tally.matched[b]} vs ${s ? s.matched[b] : '?'}`, 16)}${tally.explained[b]} vs ${s ? s.explained[b] : '?'}`));
  log(`  Not explained: ${tally.notExplained} vs ${s ? s.notExplained : '?'}`);
  log('  Key: Chosen = answers showing that behaviour. Heard back = receiving captain tapped the same behaviour. Explained as = times the captain tapped it at all.');
  check('Server stats match exactly what was played', s && s.answersGiven === tally.answersGiven && s.matchTotal === tally.matchTotal && s.notExplained === tally.notExplained && BEHAVIORS.every(b => s.chosen[b] === tally.chosen[b] && s.matched[b] === tally.matched[b] && s.explained[b] === tally.explained[b]), s ? `${s.answersGiven} answers` : 'no stats');
  check('Results are showing on the projector', board && board.showResults);

  // ======================================================================
  section('SUMMARY');
  // ======================================================================
  const failed = results.filter(x => !x.ok);
  log(`  ${results.length - failed.length} of ${results.length} checks passed`);
  if (failed.length) { log('  Failed:'); failed.forEach(f => log(`   - ${f.name}${f.detail ? ' (' + f.detail + ')' : ''}`)); }
  else log('  Everything is in sync. No issues found.');
  log(`\n  Full log saved to ${LOG_FILE}`);
  log('  The server still holds this test session. Press "Reset entire session" on the facilitator screen before the event.');

  bots.forEach(b => b.sock.close()); fac.close(); proj.close();
  logStream.end(() => process.exit(failed.length ? 1 : 0));
}

main().catch(e => { log('TEST CRASHED: ' + (e && e.stack || e)); logStream.end(() => process.exit(1)); });