#!/usr/bin/env node
/* ============================================================
   TEAM FORMATION LOAD TEST
   ------------------------------------------------------------
   Simulates a full session against the backend (index.js):
   facilitator + projector + N phones join, answer the quiz,
   drop and reconnect, teams are made (twice), lost-phone
   recovery, manual move, remove, late joiner, reset.
   Every event is logged with a timestamp, and the balance of
   the 4 teams (gender, company, experience) is checked.

   Setup (once, in any folder with this file):
     npm i socket.io-client

   Run:
     node load-test.js                                   (localhost:3001, 23 phones)
     node load-test.js https://your-backend.onrender.com

   Flags:
     --bots N     number of phones (default 23)
     --quiet      console shows INFO and above only (the log file always has everything)
     --keep       skip the final reset, so you can look at the projector/facilitator after
     --log FILE   log file name (default teamform-loadtest-<time>.log)

   Do NOT run this against the live server during the event:
   it resets the session at the start and at the end.
   ============================================================ */
const { io } = require('socket.io-client');
const fs = require('fs');

// ---------- args ----------
const args = process.argv.slice(2);
const URL = (args.find((a) => /^https?:\/\//.test(a)) || 'http://localhost:3001').replace(/\/$/, '');
const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const BOTS = Math.max(8, parseInt(flag('bots', '23'), 10) || 23);
const QUIET = args.includes('--quiet');
const KEEP = args.includes('--keep');
const RUN = Date.now().toString(36);
const LOG_FILE = flag('log', `teamform-loadtest-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);

// ---------- logging ----------
const T0 = Date.now();
const out = fs.createWriteStream(LOG_FILE);
function log(level, msg) {
  const line = `[${((Date.now() - T0) / 1000).toFixed(3).padStart(8)}s] ${level.padEnd(5)} ${msg}`;
  out.write(line + '\n');
  if (!(QUIET && level === 'DEBUG')) console.log(line);
}
const debug = (m) => log('DEBUG', m);
const info = (m) => log('INFO', m);
const warnL = (m) => log('WARN', m);
function phase(title) { const bar = '='.repeat(64); log('PHASE', ''); log('PHASE', bar); log('PHASE', title); log('PHASE', bar); }

const results = { pass: 0, fail: 0, warn: 0, failures: [], warnings: [] };
function check(cond, msg, { warnOnly = false } = {}) {
  if (cond) { results.pass++; log('PASS', msg); return true; }
  if (warnOnly) { results.warn++; results.warnings.push(msg); log('WARN', msg); return false; }
  results.fail++; results.failures.push(msg); log('FAIL', msg); return false;
}

const lat = { connect: [], join: [], answer: [], sync: [], teamsBroadcast: [], makeTeams: [], reconnect: [] };
function stats(arr) {
  if (!arr.length) return 'n/a';
  const s = arr.slice().sort((a, b) => a - b);
  const p = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return `n=${s.length} min=${s[0]}ms p50=${p(0.5)}ms p95=${p(0.95)}ms max=${s[s.length - 1]}ms`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rand(a.length)];

// Resolves with the first matching event, or null on timeout.
function waitFor(socket, event, pred = () => true, timeout = 8000) {
  return new Promise((resolve) => {
    const handler = (data) => { if (pred(data)) { clearTimeout(timer); socket.off(event, handler); resolve(data); } };
    const timer = setTimeout(() => { socket.off(event, handler); resolve(null); }, timeout);
    socket.on(event, handler);
  });
}
async function getState() { const r = await fetch(URL + '/state'); return r.json(); }

// ---------- test data ----------
const FIRST = ['Ayesha', 'Bilal', 'Sana', 'Usman', 'Hira', 'Fahad', 'Zainab', 'Omar', 'Maryam', 'Hamza', 'Noor', 'Ali', 'Kiran', 'Saad', 'Amna', 'Talha', 'Rabia', 'Danish', 'Mehwish', 'Asad', 'Iqra', 'Haris', 'Sara', 'Ahmed'];
const LAST = ['Khan', 'Ahmed', 'Mirza', 'Tariq', 'Siddiqui', 'Ali', 'Raza', 'Farooq', 'Shah', 'Qureshi', 'Fatima', 'Hassan', 'Javed', 'Malik', 'Iqbal', 'Butt'];
// Company index weights: some companies send many people, like the real list.
const COMPANY_POOL = [0, 0, 1, 1, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 6, 7, 7, 7, 8];

let QUESTIONS = null; // read from the server
const bots = [];
let roomCountEvents = 0;

function makeBot(i) {
  const gender = Math.random() < 0.35 ? 'woman' : 'man';
  const name = `${pick(FIRST)} ${pick(LAST)}`.slice(0, 17) + ` ${i}`;
  // 6% answer nothing, 6% answer only half, the rest answer everything.
  const r = Math.random();
  const answerPlan = r < 0.06 ? 'none' : r < 0.12 ? 'partial' : 'all';
  return {
    i, id: `lt_${RUN}_${i}`, name, gender, answerPlan,
    picks: null, socket: null, finalName: null, teamId: null, confirmed: new Set(),
  };
}

function attachPhoneLogging(bot) {
  const s = bot.socket;
  const tag = `phone#${String(bot.i).padStart(3, '0')}`;
  s.on('state_sync', (st) => debug(`${tag} <- state_sync  state=${st.session && st.session.state} people=${Object.keys(st.participants || {}).length} myAnswers=${(st.answers || []).length} teams=${(st.teams || []).length}`));
  s.on('joined', (p) => debug(`${tag} <- joined      id=${p.id} name="${p.name}" gender=${p.gender}`));
  s.on('join_error', (e) => debug(`${tag} <- join_error  "${e.message}"`));
  s.on('answer_confirmed', (a) => debug(`${tag} <- answer_confirmed q${a.questionIndex}=opt${a.optionIndex}`));
  s.on('session_update', (ss) => debug(`${tag} <- session_update state=${ss.state}`));
  s.on('teams_formed', ({ teams, participants }) => {
    const me = participants[bot.id];
    const t = me && teams.find((x) => x.id === me.teamId);
    debug(`${tag} <- teams_formed ${t ? `${t.name} (${t.memberIds.length} people)` : 'no team for me'}`);
  });
  s.on('reset', () => debug(`${tag} <- reset`));
  s.on('room_count', () => { roomCountEvents++; });
  s.on('disconnect', (reason) => debug(`${tag} -- disconnected (${reason})`));
}

function connectPhone(bot) {
  return new Promise((resolve) => {
    const start = Date.now();
    const s = io(URL, { query: { role: 'phone' }, forceNew: true, reconnection: false, timeout: 20000 });
    s.once('connect', () => {
      lat.connect.push(Date.now() - start);
      bot.socket = s;
      attachPhoneLogging(bot);
      debug(`phone#${String(bot.i).padStart(3, '0')} connected sid=${s.id} in ${Date.now() - start}ms`);
      s.emit('identify', { id: bot.id });
      resolve(true);
    });
    s.once('connect_error', (e) => { log('ERROR', `phone#${bot.i} connect_error: ${e.message}`); resolve(false); });
  });
}

// ============================================================
// MAIN
// ============================================================
(async () => {
  info(`Team Formation load test  run=${RUN}`);
  info(`server=${URL}  phones=${BOTS}  log=${LOG_FILE}`);

  // ---------- 1. health ----------
  phase('1. Health check');
  try {
    const h0 = Date.now();
    const r = await fetch(URL + '/health');
    const body = await r.text();
    check(r.ok && body.trim() === 'ok', `GET /health -> ${r.status} "${body.trim()}" in ${Date.now() - h0}ms`);
    const st = await getState();
    QUESTIONS = st.questions;
    check(Array.isArray(QUESTIONS) && QUESTIONS.length === 4, `GET /state returns ${QUESTIONS && QUESTIONS.length} questions (expect 4)`);
    QUESTIONS.forEach((q, i) => debug(`Q${i + 1}: ${q.text} [${q.options.length} options: ${q.options.join(' | ')}]`));
  } catch (e) {
    log('ERROR', `Server not reachable at ${URL}: ${e.message}`);
    log('ERROR', 'If this is Render, open the URL in a browser first to wake it up, then run again.');
    out.end(); process.exit(1);
  }
  const COMPANY_OTHER = QUESTIONS[1].options.indexOf('Not mentioned here');

  // ---------- 2. screens ----------
  phase('2. Facilitator and projector connect, session reset');
  const fac = io(URL, { query: { role: 'facilitator' }, forceNew: true });
  const proj = io(URL, { query: { role: 'projector' }, forceNew: true });
  await Promise.all([waitFor(fac, 'connect', () => true, 15000), waitFor(proj, 'connect', () => true, 15000)]);
  check(fac.connected && proj.connected, `facilitator sid=${fac.id}, projector sid=${proj.id} connected`);
  fac.emit('hello', { role: 'facilitator' });
  proj.emit('hello', { role: 'projector' });

  const projCounts = { answer_received: 0, participants_update: 0, submitted_update: 0, teams_formed: 0, session_update: 0 };
  let lastSubmitted = null;
  Object.keys(projCounts).forEach((ev) => proj.on(ev, () => { projCounts[ev]++; }));
  proj.on('submitted_update', (d) => { lastSubmitted = d; debug(`projector <- submitted_update ${d.submitted}/${d.total}`); });
  proj.on('session_update', (s) => debug(`projector <- session_update state=${s.state}`));
  proj.on('teams_formed', ({ teams }) => debug(`projector <- teams_formed sizes=[${teams.map((t) => t.memberIds.length).join(', ')}]`));
  fac.on('teams_formed', ({ teams }) => debug(`facilitator <- teams_formed sizes=[${teams.map((t) => t.memberIds.length).join(', ')}]`));
  fac.on('participants_update', (p) => debug(`facilitator <- participants_update people=${Object.keys(p).length}`));

  const resetSeen = waitFor(proj, 'reset', () => true, 5000);
  fac.emit('facilitator_reset');
  check(!!(await resetSeen), 'facilitator_reset broadcast received by projector');
  let st = await getState();
  check(st.session.state === 'idle' && Object.keys(st.participants).length === 0, `state after reset: ${st.session.state}, ${Object.keys(st.participants).length} people`);

  // ---------- 3. join ----------
  phase(`3. ${BOTS} phones connect and join`);
  for (let i = 0; i < BOTS; i++) bots.push(makeBot(i));
  // bot 1 copies bot 0's name and gender: server must rename to "<name> (2)".
  bots[1].name = bots[0].name; bots[1].gender = bots[0].gender;
  bots.forEach((b) => {
    const company = COMPANY_POOL[rand(COMPANY_POOL.length)];
    b.picks = [rand(5), company, rand(QUESTIONS[2].options.length), rand(QUESTIONS[3].options.length)];
  });

  const BATCH = 25;
  for (let k = 0; k < bots.length; k += BATCH) {
    const ok = await Promise.all(bots.slice(k, k + BATCH).map(connectPhone));
    info(`connected phones ${k}-${Math.min(k + BATCH, bots.length) - 1}: ${ok.filter(Boolean).length}/${ok.length}`);
  }
  check(bots.every((b) => b.socket && b.socket.connected), `all ${BOTS} phones connected (${stats(lat.connect)})`);

  // Validation: bad name, missing gender.
  const v = bots[2];
  let p = waitFor(v.socket, 'join_error', () => true, 4000);
  v.socket.emit('join', { id: v.id, name: '   ', gender: 'man' });
  let e = await p;
  check(e && e.message === 'Invalid name', `blank name rejected: "${e && e.message}"`);
  p = waitFor(v.socket, 'join_error', () => true, 4000);
  v.socket.emit('join', { id: v.id, name: 'x'.repeat(21), gender: 'man' });
  e = await p;
  check(e && e.message === 'Invalid name', `21-character name rejected: "${e && e.message}"`);
  p = waitFor(v.socket, 'join_error', () => true, 4000);
  v.socket.emit('join', { id: v.id, name: 'No Gender', gender: 'male' });
  e = await p;
  check(e && e.message === 'Please select your gender.', `old gender value "male" rejected: "${e && e.message}"`);

  // Real joins, staggered over ~2s like people scanning a QR.
  await Promise.all(bots.map(async (b) => {
    await sleep(rand(2000));
    const start = Date.now();
    const got = waitFor(b.socket, 'joined', () => true, 10000);
    b.socket.emit('join', { id: b.id, name: b.name, gender: b.gender });
    debug(`phone#${String(b.i).padStart(3, '0')} -> join name="${b.name}" gender=${b.gender}`);
    const j = await got;
    if (j) { lat.join.push(Date.now() - start); b.finalName = j.name; }
    else log('ERROR', `phone#${b.i} never got "joined"`);
  }));
  check(lat.join.length === BOTS, `${lat.join.length}/${BOTS} phones joined (${stats(lat.join)})`);
  const dupNames = [bots[0].finalName, bots[1].finalName].sort();
  check(dupNames[0] === bots[0].name && dupNames[1] === `${bots[0].name} (2)`, `duplicate name renamed: "${dupNames[0]}" and "${dupNames[1]}"`);

  // Joining again with the same id must not create a second person.
  p = waitFor(bots[3].socket, 'joined', () => true, 4000);
  bots[3].socket.emit('join', { id: bots[3].id, name: bots[3].name, gender: bots[3].gender });
  const again = await p;
  await sleep(300);
  st = await getState();
  check(again && again.id === bots[3].id && Object.keys(st.participants).length === BOTS, `re-join with same id is idempotent (people=${Object.keys(st.participants).length})`);
  const women = bots.filter((b) => b.gender === 'woman').length;
  info(`room: ${BOTS} people, ${women} women, ${BOTS - women} men. room_count events so far: ${roomCountEvents}`);

  // ---------- 4. answers before the quiz ----------
  phase('4. Answers sent before the quiz opens are ignored');
  p = waitFor(bots[4].socket, 'answer_confirmed', () => true, 1200);
  bots[4].socket.emit('submit_answer', { participantId: bots[4].id, questionIndex: 0, optionIndex: 0 });
  check(!(await p), 'early answer ignored (no answer_confirmed)');
  st = await getState();
  check(st.answers.length === 0, `server holds ${st.answers.length} answers before quiz (expect 0)`);

  // ---------- 5. quiz ----------
  phase('5. Facilitator starts the quiz, phones answer at their own pace');
  const quizSeen = Promise.all(bots.map((b) => waitFor(b.socket, 'session_update', (s) => s.state === 'quiz_open', 8000)));
  fac.emit('facilitator_start_quiz');
  const seen = (await quizSeen).filter(Boolean).length;
  check(seen === BOTS, `${seen}/${BOTS} phones got session_update quiz_open`);

  // Invalid answers.
  const inv = bots[5];
  p = waitFor(inv.socket, 'answer_confirmed', () => true, 1200);
  inv.socket.emit('submit_answer', { participantId: inv.id, questionIndex: 1, optionIndex: 99 });
  check(!(await p), 'out-of-range option rejected');
  p = waitFor(inv.socket, 'answer_confirmed', () => true, 1200);
  inv.socket.emit('submit_answer', { participantId: inv.id, questionIndex: 7, optionIndex: 0 });
  check(!(await p), 'out-of-range question rejected');
  p = waitFor(inv.socket, 'answer_confirmed', () => true, 1200);
  inv.socket.emit('submit_answer', { participantId: 'nobody', questionIndex: 0, optionIndex: 0 });
  check(!(await p), 'answer for unknown participant rejected');

  // 10% of the answering phones drop out after Q2 and come back.
  const dropSet = new Set(bots.filter((b) => b.answerPlan === 'all').slice(6, 6 + Math.max(2, Math.floor(BOTS * 0.1))).map((b) => b.i));
  let expectedAnswers = 0;

  async function answer(b, q) {
    const start = Date.now();
    const got = waitFor(b.socket, 'answer_confirmed', (a) => a.questionIndex === q, 8000);
    b.socket.emit('submit_answer', { participantId: b.id, questionIndex: q, optionIndex: b.picks[q] });
    debug(`phone#${String(b.i).padStart(3, '0')} -> answer q${q}=opt${b.picks[q]} (${QUESTIONS[q].options[b.picks[q]]})`);
    const c = await got;
    if (c) { lat.answer.push(Date.now() - start); b.confirmed.add(q); }
    else log('ERROR', `phone#${b.i} q${q} not confirmed`);
  }

  await Promise.all(bots.map(async (b) => {
    if (b.answerPlan === 'none') { debug(`phone#${String(b.i).padStart(3, '0')} answers nothing (simulated)`); return; }
    const qs = b.answerPlan === 'partial' ? [0, 1] : [0, 1, 2, 3];
    for (const q of qs) {
      await sleep(400 + rand(1600)); // reading time
      await answer(b, q);
      expectedAnswers++;
      if (q === 1 && dropSet.has(b.i)) {
        // Phone locks / leaves the browser, then comes back with a new socket.
        b.socket.disconnect();
        await sleep(500 + rand(1000));
        const t = Date.now();
        await connectPhone(b);
        const sync = await waitFor(b.socket, 'state_sync', () => true, 6000);
        lat.reconnect.push(Date.now() - t);
        const mine = sync ? sync.answers : [];
        const onlyMine = mine.every((a) => a.participantId === b.id);
        check(sync && mine.length === 2 && onlyMine,
          `phone#${b.i} reconnected, state_sync restored its ${mine.length} answers (expect 2), no one else's answers leaked: ${onlyMine}`);
      }
    }
    // Duplicate answer for Q1 must be ignored.
    if (b.i === 6) {
      const dup = waitFor(b.socket, 'answer_confirmed', () => true, 1200);
      b.socket.emit('submit_answer', { participantId: b.id, questionIndex: 0, optionIndex: (b.picks[0] + 1) % 5 });
      check(!(await dup), 'duplicate answer to the same question ignored');
    }
  }));
  await sleep(800);
  st = await getState();
  const complete = bots.filter((b) => b.answerPlan === 'all').length;
  check(st.answers.length === expectedAnswers, `server holds ${st.answers.length} answers (expect ${expectedAnswers}) (${stats(lat.answer)})`);
  check(projCounts.answer_received === expectedAnswers, `projector saw ${projCounts.answer_received} answer_received events (expect ${expectedAnswers})`);
  check(lastSubmitted && lastSubmitted.submitted === complete, `submitted counter ${lastSubmitted && lastSubmitted.submitted}/${lastSubmitted && lastSubmitted.total} (expect ${complete}/${BOTS})`);
  info(`answer plans: all=${complete}, partial=${bots.filter((b) => b.answerPlan === 'partial').length}, none=${bots.filter((b) => b.answerPlan === 'none').length}; reconnects ${stats(lat.reconnect)}`);

  // ---------- 6. make teams ----------
  async function makeTeamsAndVerify(label) {
    const start = Date.now();
    const phoneGot = bots.map((b) => {
      const t = Date.now();
      return waitFor(b.socket, 'teams_formed', () => true, 15000).then((d) => { if (d) lat.teamsBroadcast.push(Date.now() - t); return d; });
    });
    const facGot = waitFor(fac, 'teams_formed', () => true, 15000);
    fac.emit('facilitator_make_teams');
    const fd = await facGot;
    const ms = Date.now() - start;
    lat.makeTeams.push(ms);
    check(!!fd, `${label}: split computed and broadcast in ${ms}ms`);
    const got = await Promise.all(phoneGot);
    check(got.filter(Boolean).length === BOTS, `${label}: ${got.filter(Boolean).length}/${BOTS} phones received teams_formed`);

    st = await getState();
    const teams = st.teams;
    check(teams.length === 4, `${label}: ${teams.length} teams (expect 4)`);
    const all = teams.flatMap((t) => t.memberIds);
    check(all.length === BOTS && new Set(all).size === BOTS, `${label}: every person in exactly one team (${new Set(all).size} unique / ${all.length} slots)`);
    const sizes = teams.map((t) => t.memberIds.length);
    check(Math.max(...sizes) - Math.min(...sizes) <= 1, `${label}: team sizes [${sizes.join(', ')}] differ by at most 1`);
    check(Object.values(st.participants).every((pp) => teams.find((t) => t.id === pp.teamId && t.memberIds.includes(pp.id))), `${label}: every participant.teamId matches its team list`);

    // Each phone's view agrees with the server.
    let agree = 0;
    bots.forEach((b, k) => {
      const d = got[k]; if (!d) return;
      const me = d.participants[b.id];
      if (me && me.teamId === st.participants[b.id].teamId) agree++;
      b.teamId = st.participants[b.id].teamId;
    });
    check(agree === BOTS, `${label}: ${agree}/${BOTS} phones show the same team as the server`);

    // Balance report.
    const amap = {};
    st.answers.forEach((a) => { (amap[a.participantId] = amap[a.participantId] || {})[a.questionIndex] = a.optionIndex; });
    const spread = (fn) => {
      const values = {};
      teams.forEach((t, ti) => t.memberIds.forEach((id) => { const vv = fn(id); if (vv === null || vv === undefined) return; (values[vv] = values[vv] || [0, 0, 0, 0])[ti]++; }));
      return values;
    };
    const gender = spread((id) => st.participants[id].gender);
    const company = spread((id) => { const c = amap[id] && amap[id][1]; return c === undefined || c === COMPANY_OTHER ? null : c; });
    const exp = spread((id) => amap[id] && amap[id][0]);

    log('TABLE', `${label}: team breakdown`);
    teams.forEach((t, ti) => {
      const m = t.memberIds;
      const w = m.filter((id) => st.participants[id].gender === 'woman').length;
      const exps = m.map((id) => amap[id] && amap[id][0]).filter((x) => x !== undefined);
      const mean = exps.length ? (exps.reduce((a, b) => a + b, 0) / exps.length).toFixed(2) : '-';
      log('TABLE', `  ${t.name.padEnd(7)} size ${String(m.length).padStart(3)} | women ${String(w).padStart(2)} men ${String(m.length - w).padStart(2)} | companies ${new Set(m.map((id) => amap[id] && amap[id][1]).filter((x) => x !== undefined)).size} | exp mean ${mean}`);
      m.forEach((id) => {
        const a = amap[id] || {};
        const val = (q) => (a[q] === undefined ? '(no answer)' : QUESTIONS[q].options[a[q]]);
        debug(`      ${st.participants[id].name.padEnd(22)} ${st.participants[id].gender.padEnd(6)} ${val(1).padEnd(30)} ${val(0).padEnd(18)} ${val(2).padEnd(24)} ${val(3)}`);
      });
    });

    function judge(name, table, labelOf) {
      Object.entries(table).forEach(([k, counts]) => {
        const gap = Math.max(...counts) - Math.min(...counts);
        const msg = `${label}: ${name} "${labelOf(k)}" per team [${counts.join(', ')}] gap ${gap}`;
        if (gap <= 1) check(true, msg);
        else check(gap <= 2, msg + ' (gap 2 is acceptable when other factors compete)', { warnOnly: gap === 2 });
      });
    }
    judge('gender', gender, (k) => k);
    judge('company', company, (k) => QUESTIONS[1].options[k]);
    judge('experience', exp, (k) => QUESTIONS[0].options[k]);
    return st;
  }

  phase('6. Make teams (first split)');
  const first = await makeTeamsAndVerify('split 1');
  const firstTeams = Object.fromEntries(Object.values(first.participants).map((pp) => [pp.id, first.teams.find((t) => t.id === pp.teamId).memberIds.slice().sort().join(',')]));

  phase('7. Make teams again (reshuffle)');
  const second = await makeTeamsAndVerify('split 2');
  const changed = Object.values(second.participants).filter((pp) => second.teams.find((t) => t.id === pp.teamId).memberIds.slice().sort().join(',') !== firstTeams[pp.id]).length;
  info(`split 2: ${changed}/${BOTS} people ended up with a different set of teammates`);

  // ---------- 8. answers after teams ----------
  phase('8. Late answers after teams are formed are ignored');
  const lateB = bots.find((b) => b.answerPlan === 'none');
  if (lateB) {
    p = waitFor(lateB.socket, 'answer_confirmed', () => true, 1200);
    lateB.socket.emit('submit_answer', { participantId: lateB.id, questionIndex: 0, optionIndex: 0 });
    check(!(await p), `phone#${lateB.i} answer after teams_formed ignored`);
  }

  // ---------- 9. lost phone recovery ----------
  phase('9. Lost phone: same person rejoins with a new id');
  const lost = bots[10];
  const lostTeam = second.participants[lost.id].teamId;
  lost.socket.disconnect();
  await sleep(600);
  const fresh = io(URL, { query: { role: 'phone' }, forceNew: true, reconnection: false });
  await waitFor(fresh, 'connect', () => true, 10000);
  const newId = `lt_${RUN}_lost`;
  fresh.emit('identify', { id: newId });
  p = waitFor(fresh, 'joined', () => true, 5000);
  fresh.emit('join', { id: newId, name: lost.finalName, gender: lost.gender });
  let j = await p;
  check(j && j.id === lost.id && j.teamId === lostTeam, `"${lost.finalName}" recovered original id=${j && j.id} team=${j && j.teamId} (expect ${lost.id} / ${lostTeam})`);
  lost.socket = fresh;
  st = await getState();
  check(Object.keys(st.participants).length === BOTS, `no duplicate person created (people=${Object.keys(st.participants).length})`);

  // Two people with the same base name, both online: must NOT merge.
  phase('10. Same name, both online: new person is created, not merged');
  const tw = io(URL, { query: { role: 'phone' }, forceNew: true, reconnection: false });
  await waitFor(tw, 'connect', () => true, 10000);
  const twId = `lt_${RUN}_twin`;
  tw.emit('identify', { id: twId });
  p = waitFor(tw, 'joined', () => true, 5000);
  tw.emit('join', { id: twId, name: bots[0].name, gender: bots[0].gender });
  j = await p;
  check(j && j.id === twId && j.id !== bots[0].id && j.id !== bots[1].id, `third "${bots[0].name}" became new person "${j && j.name}" with no team (teamId=${j && j.teamId})`);

  // ---------- 11. facilitator tools ----------
  phase('11. Facilitator: move and remove');
  const mover = bots[12];
  const fromTeam = st.participants[mover.id].teamId;
  const toTeam = st.teams.find((t) => t.id !== fromTeam).id;
  p = waitFor(mover.socket, 'teams_formed', () => true, 5000);
  fac.emit('facilitator_move_participant', { participantId: mover.id, teamId: toTeam });
  const mv = await p;
  st = await getState();
  check(mv && st.participants[mover.id].teamId === toTeam && st.teams.find((t) => t.id === toTeam).memberIds.includes(mover.id) && !st.teams.find((t) => t.id === fromTeam).memberIds.includes(mover.id),
    `moved "${mover.finalName}" ${fromTeam} -> ${toTeam}, phone notified`);

  p = waitFor(fac, 'participants_update', (pp) => !pp[twId], 5000);
  fac.emit('facilitator_delete_participant', { participantId: twId });
  const del = await p;
  st = await getState();
  check(del && !st.participants[twId] && !st.teams.some((t) => t.memberIds.includes(twId)) && !st.answers.some((a) => a.participantId === twId), 'removed the extra person from room, teams and answers');
  tw.disconnect();

  // ---------- 12. late joiner ----------
  phase('12. Late joiner after teams are formed');
  const late = io(URL, { query: { role: 'phone' }, forceNew: true, reconnection: false });
  await waitFor(late, 'connect', () => true, 10000);
  const lateId = `lt_${RUN}_late`;
  late.emit('identify', { id: lateId });
  p = waitFor(late, 'joined', () => true, 5000);
  late.emit('join', { id: lateId, name: 'Late Comer', gender: 'woman' });
  j = await p;
  check(j && j.id === lateId && j.teamId === null, `late joiner added with no team (use Manual override or Make teams again to place them)`);
  fac.emit('facilitator_delete_participant', { participantId: lateId });
  late.disconnect();

  // ---------- 13. full refresh ----------
  phase('13. Every phone refreshes at once (request_sync)');
  const syncs = await Promise.all(bots.map((b) => {
    const t = Date.now();
    const w = waitFor(b.socket, 'state_sync', () => true, 10000).then((d) => { if (d) lat.sync.push(Date.now() - t); return d; });
    b.socket.emit('request_sync');
    return w;
  }));
  const okSync = syncs.filter((d, k) => d && d.session.state === 'teams_formed' && d.answers.every((a) => a.participantId === bots[k].id)).length;
  check(okSync === BOTS, `${okSync}/${BOTS} phones got state_sync with teams and only their own answers (${stats(lat.sync)})`);

  // ---------- 14. reset ----------
  if (!KEEP) {
    phase('14. Reset');
    const resets = Promise.all(bots.map((b) => waitFor(b.socket, 'reset', () => true, 8000)));
    fac.emit('facilitator_reset');
    const rs = (await resets).filter(Boolean).length;
    check(rs === BOTS, `${rs}/${BOTS} phones got reset`);
    st = await getState();
    check(st.session.state === 'idle' && !Object.keys(st.participants).length && !st.answers.length && !st.teams.length, 'server is empty and idle after reset');
  } else {
    info('--keep: skipping reset, the session is left as is');
  }

  // ---------- summary ----------
  phase('SUMMARY');
  info(`server            ${URL}`);
  info(`phones            ${BOTS}`);
  info(`connect           ${stats(lat.connect)}`);
  info(`join              ${stats(lat.join)}`);
  info(`answer confirm    ${stats(lat.answer)}`);
  info(`reconnect + sync  ${stats(lat.reconnect)}`);
  info(`make teams        ${stats(lat.makeTeams)}`);
  info(`teams to phones   ${stats(lat.teamsBroadcast)}`);
  info(`full refresh      ${stats(lat.sync)}`);
  info(`projector events  ${JSON.stringify(projCounts)}`);
  info(`room_count events ${roomCountEvents}`);
  info(`checks            ${results.pass} passed, ${results.warn} warnings, ${results.fail} failed`);
  results.warnings.forEach((m) => log('WARN', `  - ${m}`));
  results.failures.forEach((m) => log('FAIL', `  - ${m}`));
  info(results.fail === 0 ? 'RESULT: ALL GOOD' : 'RESULT: FAILURES ABOVE');
  info(`full log written to ${LOG_FILE}`);

  bots.forEach((b) => b.socket && b.socket.disconnect());
  fac.disconnect(); proj.disconnect();
  out.end(() => process.exit(results.fail === 0 ? 0 : 1));
})().catch((err) => {
  log('ERROR', `crashed: ${err.stack || err}`);
  out.end(() => process.exit(2));
});