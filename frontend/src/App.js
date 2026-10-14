import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import * as d3 from 'd3';
import { QRCodeSVG } from 'qrcode.react';

/* ============================================================
   SOCKET
   ============================================================ */
const SERVER_URL = 'https://constellation-backend-4d88.onrender.com';
// Phones identify as 'phone' so the server sends them a slim snapshot and
// a join counter instead of the full guest list on every join.
const SOCKET_ROLE = window.location.pathname.startsWith('/projector') ? 'projector'
  : window.location.pathname.startsWith('/facilitator') ? 'facilitator' : 'phone';
const socket = io(SERVER_URL, {
  query: { role: SOCKET_ROLE },
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 3000, // come back fast after a phone wakes up
});

/* ============================================================
   THEME
   ============================================================ */
const THEME_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap');

  :root {
    --carnelian: #c1440e;
    --carnelian-bright: #e8571a;
    --gold: #e8b923;
    --charcoal: #0b0c10;
    --charcoal-3: #1d1f2a;
    --ink: #f5f0e8;
    --ink-dim: rgba(245,240,232,0.6);
    --ink-faint: rgba(245,240,232,0.35);
  }
  * { box-sizing: border-box; }
  body { margin: 0; }

  .lc-root {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    background: radial-gradient(ellipse at top, #1a1410 0%, var(--charcoal) 55%);
    color: var(--ink); min-height: 100vh; min-height: 100dvh; width: 100%;
    position: relative; overflow-x: hidden;
  }
  .lc-glow {
    position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background:
      radial-gradient(circle at 15% 10%, rgba(193,68,14,0.18), transparent 45%),
      radial-gradient(circle at 85% 85%, rgba(232,185,35,0.10), transparent 40%);
  }
  .lc-content { position: relative; z-index: 1; }

  @keyframes lc-pulse { 0%,100% { transform: scale(1); opacity:1; } 50% { transform: scale(1.4); opacity:0.5; } }
  @keyframes lc-fadein { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform:translateY(0); } }
  @keyframes lc-glow-green { 0%,100% { box-shadow: 0 0 0 2px rgba(46,204,113,.85), 0 0 18px rgba(46,204,113,.55); } 50% { box-shadow: 0 0 0 3px rgba(46,204,113,1), 0 0 34px rgba(46,204,113,.85); } }
  .lc-card-done { animation: lc-glow-green 2.4s ease-in-out infinite; }
  @keyframes lc-pop { 0% { transform: scale(0.7); opacity:0; } 60% { transform: scale(1.06); } 100% { transform: scale(1); opacity:1; } }
  @keyframes lc-rise { from { opacity:0; transform: translateY(14px); } to { opacity:1; transform:translateY(0); } }
  @keyframes lc-breathe { 0%,100% { transform: scale(1); box-shadow: 0 0 40px currentColor; } 50% { transform: scale(1.05); box-shadow: 0 0 70px currentColor; } }
  @keyframes lc-spin { to { transform: rotate(360deg); } }
  @keyframes lc-zoomin { from { opacity:0; transform: scale(0.85); } to { opacity:1; transform: scale(1); } }
  @keyframes lc-glowpop { 0% { box-shadow: 0 0 0 rgba(232,185,35,0); } 40% { box-shadow: 0 0 60px rgba(232,185,35,.8); } 100% { box-shadow: 0 0 20px rgba(232,185,35,.3); } }

  .lc-fadein { animation: lc-fadein 0.5s ease-out both; }
  .lc-pop { animation: lc-pop 0.55s cubic-bezier(.2,.9,.3,1.2) both; }
  .lc-rise { animation: lc-rise 0.5s ease-out both; }

  .lc-logo { height: 56px; filter: drop-shadow(0 0 20px rgba(193,68,14,0.35)); }
  .lc-h1 { font-family:'Poppins',sans-serif; font-weight:800; font-size:clamp(28px,6vw,48px); margin:0; letter-spacing:-0.02em; }
  .lc-h2 { font-family:'Poppins',sans-serif; font-weight:700; font-size:clamp(20px,4.5vw,30px); margin:0 0 20px; line-height:1.3; }
  .lc-sub { font-size:clamp(14px,3vw,17px); color:var(--ink-dim); margin:0; }
  .lc-faint { font-size:13px; color:var(--ink-faint); margin:12px 0 0; }

  .lc-card {
    background: linear-gradient(160deg, rgba(29,31,42,0.92), rgba(20,21,29,0.92));
    border: 1px solid rgba(255,255,255,0.07); border-radius: 20px;
    backdrop-filter: blur(14px); box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  }

  .lc-input {
    width:100%; padding:16px 18px; font-size:17px; border-radius:14px;
    border:1.5px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04);
    color:var(--ink); text-align:center; outline:none;
    transition:border-color .2s, box-shadow .2s;
  }
  .lc-input:focus { border-color:var(--carnelian-bright); box-shadow:0 0 0 4px rgba(193,68,14,0.15); }

  .lc-btn {
    padding:15px 22px; font-size:16px; font-weight:600; border-radius:14px; border:none;
    cursor:pointer; transition:transform .15s, box-shadow .15s, opacity .15s; font-family:'Inter',sans-serif;
  }
  .lc-btn:active { transform:scale(0.97); }
  .lc-btn:disabled { opacity:0.3; cursor:not-allowed; }
  .lc-btn-primary { background:linear-gradient(135deg,var(--carnelian-bright),var(--carnelian)); color:#fff; box-shadow:0 6px 20px rgba(193,68,14,0.35); }
  .lc-btn-primary:hover:not(:disabled) { box-shadow:0 10px 30px rgba(193,68,14,0.55); }
  .lc-btn-outline { background:rgba(255,255,255,0.03); color:var(--ink); border:1.5px solid rgba(255,255,255,0.15); }
  .lc-btn-outline:hover:not(:disabled) { border-color:rgba(255,255,255,0.4); }
  .lc-btn-danger { background:linear-gradient(135deg,#a83232,#7a1f1f); color:#fff; box-shadow:0 6px 20px rgba(168,50,50,0.3); }
  .lc-btn-gold { background:linear-gradient(135deg,#f0c94a,var(--gold)); color:#1a1410; box-shadow:0 6px 20px rgba(232,185,35,.35); }

  .lc-option {
    position:relative; width:100%; padding:20px 18px; font-size:17px; font-weight:500;
    border-radius:16px; border:1.5px solid rgba(255,255,255,0.1);
    background:rgba(255,255,255,0.03); color:var(--ink); cursor:pointer;
    transition:all .2s; text-align:left; overflow:hidden;
  }
  .lc-option:hover:not(:disabled) { border-color:var(--carnelian-bright); background:rgba(193,68,14,0.08); transform:translateX(3px); }
  .lc-option.lc-selected { background:linear-gradient(135deg,var(--carnelian-bright),var(--carnelian)); border-color:var(--carnelian-bright); color:#fff; box-shadow:0 8px 26px rgba(193,68,14,0.45); }
  .lc-option.lc-dimmed { opacity:0.25; }

  .lc-pulse-dot { width:14px; height:14px; border-radius:50%; background:var(--carnelian-bright); animation:lc-pulse 1.3s infinite ease-in-out; box-shadow:0 0 20px rgba(232,87,26,0.6); }
  .lc-team-swatch { width:88px; height:88px; border-radius:50%; animation: lc-breathe 3s ease-in-out infinite; }
  .lc-teammate { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:13px 18px; font-size:16px; font-weight:500; animation: lc-rise .45s ease-out both; }

  .lc-stat-card { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:18px 22px; min-width:150px; flex:1 1 150px; }
  .lc-stat-label { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--ink-faint); }
  .lc-stat-value { font-family:'Poppins',sans-serif; font-size:28px; font-weight:700; margin-top:4px; }

  .lc-select { padding:14px 16px; border-radius:12px; border:1.5px solid rgba(255,255,255,0.12); background:var(--charcoal-3); color:var(--ink); font-size:14px; flex:1 1 160px; }

  .lc-badge {
    display:inline-flex; align-items:center; gap:6px; padding:6px 14px; border-radius:999px;
    font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.05em;
    background:rgba(193,68,14,0.15); color:var(--carnelian-bright); border:1px solid rgba(193,68,14,0.3);
  }

  .lc-dots { display:flex; gap:7px; justify-content:center; }
  .lc-dot { width:8px; height:8px; border-radius:50%; background:rgba(255,255,255,0.15); transition:all .3s; }
  .lc-dot.done { background:var(--carnelian); }
  .lc-dot.active { background:var(--gold); width:22px; border-radius:999px; box-shadow:0 0 12px rgba(232,185,35,.6); }

  .lc-conn {
    position:fixed; top:12px; right:12px; z-index:50; display:flex; align-items:center; gap:7px;
    padding:6px 12px; border-radius:999px; font-size:11px; font-weight:600;
    background:rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.1); backdrop-filter:blur(8px); letter-spacing:.04em;
  }
  .lc-conn-dot { width:7px; height:7px; border-radius:50%; }

  .lc-bar-track { height:8px; border-radius:999px; background:rgba(255,255,255,0.07); overflow:hidden; }
  .lc-bar-fill { height:100%; border-radius:999px; background:linear-gradient(90deg,var(--carnelian),var(--gold)); transition:width .6s cubic-bezier(.2,.8,.3,1); }

  .lc-tabs { display:flex; gap:6px; background:rgba(255,255,255,.04); padding:5px; border-radius:14px; }
  .lc-tab { flex:1; padding:11px; border-radius:10px; border:none; background:transparent; color:var(--ink-dim); font-size:14px; font-weight:600; cursor:pointer; transition:all .2s; }
  .lc-tab.active { background:linear-gradient(135deg,var(--carnelian-bright),var(--carnelian)); color:#fff; }

  .lc-quarter-open { animation: lc-quarter-in .9s ease-out both; }
  @keyframes lc-quarter-in { 0% { opacity:0; filter:brightness(2.2); transform:scale(.88); } 60% { opacity:1; filter:brightness(1.4); } 100% { opacity:1; filter:none; transform:none; } }

  .lc-modal-backdrop {
    position:fixed; inset:0; z-index:200; display:flex; align-items:center; justify-content:center;
    padding:20px; background:rgba(5,6,9,.72); backdrop-filter:blur(6px);
    animation: lc-fadein .18s ease-out both;
  }
  .lc-modal {
    width:100%; max-width:420px; padding:28px;
    background: linear-gradient(160deg, rgba(31,33,45,.98), rgba(20,21,29,.98));
    border:1px solid rgba(255,255,255,.09); border-radius:20px;
    box-shadow:0 24px 70px rgba(0,0,0,.6);
    animation: lc-pop .28s cubic-bezier(.2,.9,.3,1.2) both;
  }
  .lc-modal-title { font-family:'Poppins',sans-serif; font-weight:700; font-size:19px; margin:0 0 10px; }
  .lc-modal-msg { font-size:14.5px; color:var(--ink-dim); line-height:1.55; margin:0 0 24px; }
  .lc-modal-actions { display:flex; gap:10px; }
  .lc-modal-actions > * { flex:1; }

  @media (max-width:640px) {
    .lc-stats-row { flex-direction:column; }
    .lc-btn-row { flex-direction:column; }
    .lc-btn-row > * { width:100%; }
    .lc-select { width:100%; flex:1 1 100%; }
  }
`;

function useInjectTheme() {
  useEffect(() => {
    if (document.getElementById('lc-theme-style')) return;
    const style = document.createElement('style');
    style.id = 'lc-theme-style';
    style.textContent = THEME_CSS;
    document.head.appendChild(style);
  }, []);
}

function useConnection() {
  const [connected, setConnected] = useState(socket.connected);
  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    setConnected(socket.connected); // the socket may have connected before this effect ran
    socket.on('connect', on); socket.on('disconnect', off);
    return () => { socket.off('connect', on); socket.off('disconnect', off); };
  }, []);
  return connected;
}

function ConnectionPill() {
  const connected = useConnection();
  return (
    <div className="lc-conn">
      <span className="lc-conn-dot" style={{ background: connected ? '#3ddc84' : '#ff6b6b', boxShadow: `0 0 8px ${connected ? '#3ddc84' : '#ff6b6b'}` }} />
      <span style={{ color: connected ? 'rgba(245,240,232,.7)' : '#ff9a9a' }}>{connected ? 'LIVE' : 'RECONNECTING'}</span>
    </div>
  );
}

/* Styled confirmation dialog, replaces window.confirm, which renders as a
   raw browser alert with the Render URL in it and looks broken on a screen
   the facilitator may be sharing. */
function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;
  return (
    <div className="lc-modal-backdrop" onClick={onCancel}>
      <div className="lc-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="lc-modal-title">{title}</h3>
        <p className="lc-modal-msg">{message}</p>
        <div className="lc-modal-actions">
          <button className="lc-btn lc-btn-outline" onClick={onCancel}>Cancel</button>
          <button className={`lc-btn ${danger ? 'lc-btn-danger' : 'lc-btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   PARTICIPANT VIEW (phone)
   ============================================================ */
// The participant id is what keeps someone "the same person" across a
// refresh, a locked phone, or switching apps. It is stored in three places
// so losing one (private mode, in-app browsers that wipe localStorage,
// storage blocked) doesn't turn them into a stranger: localStorage, a
// long-lived cookie, and the page URL hash (which survives a refresh even
// where storage doesn't).
const PID_KEY = 'constellation_participant_id';

function readStoredParticipantId() {
  try { const v = localStorage.getItem(PID_KEY); if (v) return v; } catch (e) { /* storage blocked */ }
  try {
    const m = document.cookie.match(new RegExp('(?:^|; )' + PID_KEY + '=([^;]+)'));
    if (m) return decodeURIComponent(m[1]);
  } catch (e) { /* ignore */ }
  const h = window.location.hash.match(/[#&]p=([^&]+)/);
  if (h) return decodeURIComponent(h[1]);
  return null;
}

function persistParticipantId(id) {
  try { localStorage.setItem(PID_KEY, id); } catch (e) { /* storage blocked */ }
  try { document.cookie = `${PID_KEY}=${encodeURIComponent(id)}; max-age=${60 * 60 * 24 * 30}; path=/; SameSite=Lax`; } catch (e) { /* ignore */ }
  try {
    if (window.location.pathname === '/' || window.location.pathname === '') {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#p=${encodeURIComponent(id)}`);
    }
  } catch (e) { /* ignore */ }
}

function getOrCreateParticipantId() {
  let id = readStoredParticipantId();
  if (!id) id = 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  persistParticipantId(id); // re-write everywhere so all three stay in sync
  return id;
}

function ParticipantView() {
  const [participantId] = useState(getOrCreateParticipantId);
  const [screen, setScreen] = useState('join'); // join | waiting | quiz | submitted | reveal
  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joinedCount, setJoinedCount] = useState(0);
  const [questions, setQuestions] = useState([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [answeredSet, setAnsweredSet] = useState(new Set());
  const [locked, setLocked] = useState(false);
  const [pending, setPending] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [team, setTeam] = useState(null);
  const [teammates, setTeammates] = useState([]);
  const [myName, setMyName] = useState('');
  const [activity, setActivity] = useState('constellation');

  const restoreFromState = useCallback((state) => {
    const me = state.participants[participantId];
    setJoinedCount(Object.keys(state.participants).length);
    setActivity(state.session.activity || 'constellation');
    if (state.questions) setQuestions(state.questions);
    if (!me) { setScreen('join'); return; }
    setMyName(me.name);

    if (state.session.state === 'teams_formed' || state.session.activity === 'puzzle' || state.session.activity === 'ownit') {
      const myTeam = state.teams.find((t) => t.id === me.teamId);
      if (myTeam) {
        setTeam(myTeam);
        setTeammates(myTeam.memberIds.filter((id) => id !== participantId)
          .map((id) => state.participants[id]?.name).filter(Boolean));
        setScreen('reveal');
        return;
      }
    }

    if (state.session.state === 'quiz_open') {
      const mine = state.answers.filter((a) => a.participantId === participantId);
      const doneSet = new Set(mine.map((a) => a.questionIndex));
      setAnsweredSet(doneSet);
      const total = state.questions.length;
      if (doneSet.size >= total) { setScreen('submitted'); return; }
      const firstOpen = Array.from({ length: total }).findIndex((_, i) => !doneSet.has(i));
      setQuizIndex(firstOpen === -1 ? 0 : firstOpen);
      setSelectedOption(null); setLocked(false);
      setScreen('quiz');
      return;
    }
    setScreen('waiting');
  }, [participantId]);

  // Tell the server who this phone is on every (re)connect, and pull a fresh
  // snapshot whenever the tab comes back to the foreground, mobile browsers
  // freeze or drop the connection while you're in another app.
  useEffect(() => {
    const identify = () => socket.emit('identify', { id: participantId });
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!socket.connected) socket.connect();
      else { identify(); socket.emit('request_sync'); }
    };
    socket.on('connect', identify);
    if (socket.connected) identify();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => {
      socket.off('connect', identify);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, [participantId]);

  useEffect(() => {
    socket.on('state_sync', restoreFromState);
    socket.on('joined', (p) => {
      // Server matched this name to an existing person (lost-storage
      // recovery), adopt that identity and reload straight into it.
      if (p && p.id && p.id !== participantId) {
        persistParticipantId(p.id);
        window.location.reload();
        return;
      }
      setMyName(p.name); setScreen('waiting');
    });
    socket.on('answer_confirmed', () => setPending(false));
    socket.on('join_error', ({ message }) => setJoinError(message));
    socket.on('room_count', ({ count }) => setJoinedCount(count));
    socket.on('teams_formed', ({ teams, participants }) => {
      const me = participants[participantId];
      if (!me) return;
      const myTeam = teams.find((t) => t.id === me.teamId);
      if (myTeam) {
        setTeam(myTeam);
        setTeammates(myTeam.memberIds.filter((id) => id !== participantId).map((id) => participants[id]?.name).filter(Boolean));
        setScreen('reveal');
      }
    });
    socket.on('session_update', (session) => {
      setActivity(session.activity || 'constellation');
      if (session.state === 'quiz_open') {
        setScreen((s) => (s === 'waiting' ? 'quiz' : s));
      }
    });
    socket.on('puzzle_started', () => setActivity('puzzle'));
    socket.on('ownit_started', () => setActivity('ownit'));
    socket.on('reset', () => {
      setScreen('join'); setQuestions([]); setQuizIndex(0); setAnsweredSet(new Set());
      setSelectedOption(null); setLocked(false); setTeam(null); setTeammates([]); setActivity('constellation');
    });
    return () => {
      socket.off('state_sync', restoreFromState);
      socket.off('joined'); socket.off('join_error'); socket.off('room_count');
      socket.off('teams_formed'); socket.off('reset');
      socket.off('answer_confirmed'); socket.off('session_update'); socket.off('puzzle_started'); socket.off('ownit_started');
    };
  }, [participantId, restoreFromState]);

  function handleJoin(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 20) { setJoinError('Enter 1-20 characters.'); return; }
    if (!gender) { setJoinError('Please select your gender.'); return; }
    setJoinError('');
    socket.emit('join', { id: participantId, name: trimmed, gender });
  }

  function handleAnswer(optionIndex) {
    if (locked) return;
    setSelectedOption(optionIndex); setLocked(true); setPending(true);
    socket.emit('submit_answer', { participantId, questionIndex: quizIndex, optionIndex });

    const confirmTimeout = setTimeout(() => {
      setAnsweredSet((prev) => {
        const next = new Set(prev); next.add(quizIndex);
        if (next.size >= questions.length) { setScreen('submitted'); }
        else {
          const nextOpen = Array.from({ length: questions.length }).findIndex((_, i) => !next.has(i));
          setQuizIndex(nextOpen === -1 ? 0 : nextOpen);
          setSelectedOption(null); setLocked(false);
        }
        return next;
      });
      setPending(false);
    }, 550); // brief pause so the "locked in" state is visible before advancing
    return () => clearTimeout(confirmTimeout);
  }

  // Once a team is known and the room has moved to the puzzle, hand off entirely.
  if (team && activity === 'puzzle') {
    return <PuzzleParticipant team={team} teammates={teammates} participantId={participantId} />;
  }
  if (team && activity === 'ownit') {
    return <OwnItParticipant team={team} participantId={participantId} />;
  }

  const question = questions[quizIndex];

  return (
    <div className="lc-root">
      <div className="lc-glow" />
      <ConnectionPill />
      <div className="lc-content" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 20px 48px', maxWidth: 480, margin: '0 auto' }}>
        <img src="/logo.png" alt="Carnelian" className="lc-logo" style={{ marginBottom: 24 }} />

        {screen === 'join' && (
          <form onSubmit={handleJoin} className="lc-fadein" style={{ width: '100%', textAlign: 'center' }}>
            <span className="lc-badge" style={{ marginBottom: 18, display: 'inline-flex' }}>✦ Team Formation</span>
            <h1 className="lc-h1" style={{ marginBottom: 10 }}>Join the room</h1>
            <p className="lc-sub" style={{ marginBottom: 26 }}>Please write your name</p>
            <input className="lc-input" value={name} maxLength={20} placeholder="Your name"
              onChange={(e) => setName(e.target.value)} autoFocus autoComplete="off" />
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              {[['male', 'Male'], ['female', 'Female']].map(([val, label]) => (
                <button key={val} type="button" onClick={() => setGender(val)}
                  className={`lc-option ${gender === val ? 'lc-selected' : ''}`}
                  style={{ textAlign: 'center', padding: '16px 12px' }}>
                  {label}
                </button>
              ))}
            </div>
            {joinError && <p style={{ color: '#ff6b6b', fontSize: 14, marginTop: 10 }}>{joinError}</p>}
            <button className="lc-btn lc-btn-primary" type="submit" style={{ width: '100%', marginTop: 18 }}>Join now</button>
            {joinedCount > 0 && <p className="lc-faint">{joinedCount} already in the room</p>}
          </form>
        )}

        {screen === 'waiting' && (
          <div className="lc-pop" style={{ textAlign: 'center', marginTop: 50, width: '100%' }}>
            <div className="lc-pulse-dot" style={{ margin: '0 auto 24px' }} />
            <h1 className="lc-h1">You're in</h1>
            {myName && <p className="lc-sub" style={{ marginTop: 8, color: 'var(--gold)' }}>{myName}</p>}
            <div className="lc-card" style={{ padding: '22px 24px', marginTop: 28 }}>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 44, fontWeight: 800 }}>{joinedCount}</div>
              <div className="lc-stat-label">people have joined</div>
            </div>
            <p className="lc-faint">Look up at the screen. Waiting for the facilitator to start.</p>
          </div>
        )}

        {screen === 'quiz' && question && (
          <div className="lc-fadein" style={{ width: '100%' }}>
            <div className="lc-dots" style={{ marginBottom: 22 }}>
              {questions.map((_, i) => (
                <span key={i} className={`lc-dot ${answeredSet.has(i) ? 'done' : ''} ${i === quizIndex ? 'active' : ''}`} />
              ))}
            </div>
            <h2 className="lc-h2">{question.text}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {question.options.map((opt, i) => (
                <button key={i} disabled={locked} onClick={() => handleAnswer(i)} style={{ animationDelay: `${i * 60}ms` }}
                  className={`lc-option lc-rise ${selectedOption === i ? 'lc-selected' : ''} ${locked && selectedOption !== i ? 'lc-dimmed' : ''}`}>
                  {opt}
                </button>
              ))}
            </div>
            {locked && (
              <div className="lc-fadein" style={{ textAlign: 'center', marginTop: 22 }}>
                <span className="lc-badge">{pending ? 'Sending…' : '✓ Locked in'}</span>
              </div>
            )}
          </div>
        )}

        {screen === 'submitted' && (
          <div className="lc-pop" style={{ textAlign: 'center', marginTop: 50, width: '100%' }}>
            <div className="lc-pulse-dot" style={{ margin: '0 auto 24px', background: 'var(--gold)', boxShadow: '0 0 20px rgba(232,185,35,.6)' }} />
            <h1 className="lc-h1">All done</h1>
            <p className="lc-sub" style={{ marginTop: 10 }}>You've answered all {questions.length} questions.</p>
            <p className="lc-faint">Look up at the screen. Waiting for everyone else to finish.</p>
          </div>
        )}

        {screen === 'reveal' && team && (
          <div style={{ textAlign: 'center', width: '100%' }}>
            <p className="lc-faint lc-fadein" style={{ marginTop: 0 }}>Your team is</p>
            <h1 className="lc-h1 lc-pop" style={{ color: team.colour, margin: '8px 0 26px' }}>Team {team.number}</h1>
            <div className="lc-team-swatch lc-pop" style={{ background: `radial-gradient(circle at 35% 30%, #fff2, ${team.colour})`, color: team.colour, margin: '0 auto 30px' }} />
            <p className="lc-sub" style={{ marginBottom: 14 }}>
              {teammates.length > 0 ? `Your ${teammates.length} teammates` : 'Your teammates'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {teammates.length > 0 ? (
                teammates.map((n, i) => <div key={i} className="lc-teammate" style={{ animationDelay: `${i * 55}ms` }}>{n}</div>)
              ) : (
                <div className="lc-teammate" style={{ opacity: 0.6, fontStyle: 'italic' }}>No one else on your team yet</div>
              )}
            </div>
            <p className="lc-faint">Keep this screen. It's how you find your group.</p>
            <div className="lc-fadein" style={{ marginTop: 28 }}>
              <span className="lc-badge">Waiting for the next activity</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   CODE UP: SHARED PIECES
   ============================================================ */
const PUZZLE_IMAGE = '/kfc-puzzle.png';
const BOARD_COLS = 5;
const BOARD_ROWS = 4;

const BEHAVIOR_META = {
  'Own It': { colour: '#e8571a', icon: 'own' },
  'Show Up': { colour: '#e8b923', icon: 'show' },
  'Ask for Help': { colour: '#00A3FF', icon: 'ask' },
  'Lift Others': { colour: '#4CD64C', icon: 'lift' },
  'Reflect & Learn': { colour: '#B14CFF', icon: 'reflect' },
};
const BEHAVIOR_LIST = Object.keys(BEHAVIOR_META);

const ICON_PATHS = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  send: <path d="M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.8c1.9.7 3.1 2.4 3.5 5.2" /></>,
  captain: <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z" />,
  key: <><circle cx="7.5" cy="15.5" r="4.5" /><path d="M10.7 12.3L21 2M17 6l3 3M14 9l2 2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></>,
  chevron: <path d="M6 9l6 6 6-6" />,
  flag: <path d="M5 21V4h12l-2 4 2 4H5" />,
  puzzle: <path d="M10 3h4v2.5a1.5 1.5 0 003 0V3h4v7h-2.5a1.5 1.5 0 000 3H21v8h-7v-2.5a1.5 1.5 0 00-3 0V21H3v-8h2.5a1.5 1.5 0 000-3H3V3h7z" />,
  own: <><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></>,
  show: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  ask: <><path d="M21 12a8.5 8.5 0 01-12.3 7.6L3.5 21l1.4-5A8.5 8.5 0 1121 12z" /><path d="M9.7 9.6a2.4 2.4 0 114 1.8c-.9.6-1.7 1.1-1.7 2.1M12 16.3v.01" /></>,
  lift: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  heart: <path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.9 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.3 0 5.6 3.1 4.4 6.6-1.7 4.8-9.2 9.4-9.2 9.4z" />,
  shield: <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />,
  link: <><path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1-1" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 20h16" /></>,
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z" />,
  bulb: <path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z" />,
  reflect: <><path d="M3.5 12a8.5 8.5 0 0114.6-5.9L20.5 8.5" /><path d="M20.5 3.5v5h-5" /><path d="M20.5 12a8.5 8.5 0 01-14.6 5.9L3.5 15.5" /><path d="M3.5 20.5v-5h5" /></>,
};

function Icon({ name, size = 18, stroke = 1.8, style }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, ...style }}>
      {ICON_PATHS[name] || null}
    </svg>
  );
}

function BehaviorIcon({ behavior, size = 18, stroke = 1.8 }) {
  const meta = BEHAVIOR_META[behavior];
  if (!meta) return null;
  return <span style={{ color: meta.colour, display: 'inline-flex' }}><Icon name={meta.icon} size={size} stroke={stroke} /></span>;
}

// Reads the real image size once, so the board and every crop keep the
// artwork's true proportions whatever size kfc-puzzle.png is.
let puzzleImageRatio = null;
function usePuzzleImageRatio() {
  const [ratio, setRatio] = useState(puzzleImageRatio || 1.5);
  useEffect(() => {
    if (puzzleImageRatio) return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) {
        puzzleImageRatio = img.naturalWidth / img.naturalHeight;
        setRatio(puzzleImageRatio);
      }
    };
    img.src = PUZZLE_IMAGE;
  }, []);
  return ratio;
}

function useNow(active, interval = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [active, interval]);
  return now;
}

// One quarter of a piece = one cell of a 10 x 8 grid over the whole image.
function quarterCell(slot, q) {
  const idx = slot - 1;
  const col = idx % BOARD_COLS, row = Math.floor(idx / BOARD_COLS);
  return { c: col * 2 + (q % 2), r: row * 2 + Math.floor(q / 2) };
}
function cropStyle(c, r) {
  return {
    backgroundImage: `url('${PUZZLE_IMAGE}')`,
    backgroundSize: `${BOARD_COLS * 200}% ${BOARD_ROWS * 200}%`,
    backgroundPosition: `${(c / (BOARD_COLS * 2 - 1)) * 100}% ${(r / (BOARD_ROWS * 2 - 1)) * 100}%`,
    backgroundRepeat: 'no-repeat',
  };
}

// A team's own piece on the phone: 4 quarters, lit as they unlock.
function PieceView({ slot, quarters = [], width = 220, colour }) {
  const ratio = usePuzzleImageRatio();
  const pieceAspect = (ratio * BOARD_ROWS) / BOARD_COLS; // width / height of one piece
  const height = width / pieceAspect;
  const gap = 3;
  const qw = (width - gap) / 2, qh = (height - gap) / 2;
  return (
    <div style={{ position: 'relative', width, height, margin: '0 auto' }}>
      {[0, 1, 2, 3].map((q) => {
        const { c, r } = quarterCell(slot, q);
        const open = !!quarters[q];
        return (
          <div key={q} className={open ? 'lc-quarter-open' : ''} style={{
            position: 'absolute', left: (q % 2) * (qw + gap), top: Math.floor(q / 2) * (qh + gap), width: qw, height: qh,
            borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${open ? (colour || '#e8b923') + '99' : 'rgba(255,255,255,.08)'}`,
            ...(open ? cropStyle(c, r) : { background: 'rgba(255,255,255,.035)', color: 'rgba(245,240,232,.28)' }),
          }}>
            {!open && <Icon name="lock" size={20} />}
          </div>
        );
      })}
    </div>
  );
}

function SectionTitle({ icon, children, colour }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: colour || 'var(--gold)' }}>
      <Icon name={icon} size={16} />
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>{children}</span>
    </div>
  );
}

function TeamTag({ number, colour }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, color: colour || 'var(--ink)' }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: colour || '#888', boxShadow: `0 0 8px ${colour || '#888'}` }} />
      Team {number}
    </span>
  );
}

function CodeDigits({ code, size = 46 }) {
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
      {String(code || '').split('').map((d, i) => (
        <div key={i} style={{
          width: size, height: size * 1.2, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: size * 0.62, color: '#1a1410',
          background: 'linear-gradient(160deg,#f6d77a,var(--gold))', boxShadow: '0 6px 20px rgba(232,185,35,.3)',
        }}>{d}</div>
      ))}
    </div>
  );
}

/* ============================================================
   CODE UP: PARTICIPANT (phone)
   ============================================================ */
function PuzzleParticipant({ team, teammates = [], participantId }) {
  const [me, setMe] = useState(null);
  const [error, setError] = useState(null);
  const [picked, setPicked] = useState({});   // "deliveryId:position" -> option index before lock-in
  const [sent, setSent] = useState({});       // "deliveryId:position" -> true once emitted
  const [code, setCode] = useState('');
  const [flash, setFlash] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const errTimer = useRef(null);

  const requestMe = useCallback(() => {
    socket.emit('puzzle_get_me', { participantId });
  }, [participantId]);

  useEffect(() => {
    requestMe();
    const onMe = (s) => { if (s) setMe(s); };
    const onErr = ({ message }) => {
      setError(message);
      clearTimeout(errTimer.current);
      errTimer.current = setTimeout(() => setError(null), 4500);
    };
    // Re-fetch after any reconnect or return to the tab, so a locked phone or
    // app switch always comes back to exactly where this person left off.
    const onVisible = () => { if (document.visibilityState === 'visible') requestMe(); };
    socket.on('puzzle_me', onMe);
    socket.on('puzzle_error', onErr);
    socket.on('connect', requestMe);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      socket.off('puzzle_me', onMe);
      socket.off('puzzle_error', onErr);
      socket.off('connect', requestMe);
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(errTimer.current);
    };
  }, [requestMe]);

  // When a code is accepted the piece unlocks straight away: clear the box
  // and show a short confirmation.
  const received = me ? me.received : 0;
  const prevReceived = useRef(null);
  useEffect(() => {
    if (prevReceived.current !== null && received > prevReceived.current) {
      setCode('');
      setFlash('Code accepted. Another part of your piece is unlocked.');
      const id = setTimeout(() => setFlash(null), 4500);
      prevReceived.current = received;
      return () => clearTimeout(id);
    }
    prevReceived.current = received;
  }, [received]);

  const lockedUntil = me ? me.lockedUntil : 0;
  const now = useNow(!!lockedUntil && lockedUntil > Date.now(), 500);
  const lockLeft = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;

  function lockIn(task) {
    const key = `${task.deliveryId}:${task.position}`;
    const opt = picked[key];
    if (opt === undefined || sent[key]) return;
    setSent((s) => ({ ...s, [key]: true }));
    socket.emit('puzzle_answer', { participantId, deliveryId: task.deliveryId, position: task.position, optionIndex: opt });
    setTimeout(() => setSent((s) => { const n = { ...s }; delete n[key]; return n; }), 4000); // allow a retry if it never landed
  }

  function submitCode(e) {
    e.preventDefault();
    if (code.length !== 4) { setError('Codes are 4 digits, each 1, 2 or 3.'); return; }
    socket.emit('puzzle_submit_code', { participantId, code });
  }

  const colour = team.colour;
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, paddingRight: 84 }}>
      <img src="/logo.png" alt="" style={{ height: 32 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="lc-badge" style={{ background: `${colour}22`, color: colour, borderColor: `${colour}55` }}>Team {team.number}</span>
        {me && me.isCaptain && (
          <span className="lc-badge" style={{ background: 'rgba(232,185,35,.15)', color: 'var(--gold)', borderColor: 'rgba(232,185,35,.3)' }}>
            <Icon name="captain" size={13} /> Captain
          </span>
        )}
      </div>
    </div>
  );

  const shell = (children) => (
    <div className="lc-root">
      <div className="lc-glow" />
      <ConnectionPill />
      <div className="lc-content" style={{ minHeight: '100dvh', padding: '26px 16px 56px', maxWidth: 480, margin: '0 auto' }}>
        {header}
        {children}
      </div>
    </div>
  );

  if (!me) {
    return shell(
      <div style={{ textAlign: 'center', marginTop: 60 }}>
        <div className="lc-pulse-dot" style={{ margin: '0 auto 20px' }} />
        <p className="lc-sub">Loading your puzzle...</p>
      </div>
    );
  }

  if (!me.inPlay) {
    return shell(
      <div className="lc-card" style={{ padding: 22, textAlign: 'center' }}>
        <p style={{ margin: 0 }}>You're not on a team in this round. Please find the facilitator.</p>
      </div>
    );
  }

  const complete = me.state === 'complete';
  const openTasks = (me.tasks || []).filter((t) => t.answered === null);
  const doneTasks = (me.tasks || []).filter((t) => t.answered !== null);
  const out = me.outgoing;

  return shell(
    <>
      <h1 className="lc-h1" style={{ fontSize: 24, marginBottom: 6 }}>Code Up</h1>
      <p className="lc-faint" style={{ marginTop: 0, marginBottom: 18 }}>
        Answer for other teams, unlock your piece with their codes.
      </p>

      {error && (
        <div className="lc-card lc-fadein" style={{ padding: '13px 16px', marginBottom: 14, border: '1px solid #a83232', display: 'flex', gap: 10, alignItems: 'center', color: '#ff9a9a' }}>
          <Icon name="alert" size={18} /><span>{error}</span>
        </div>
      )}

      {/* Our piece */}
      <div className="lc-card" style={{ padding: 18, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <PieceView slot={me.piece.slot} quarters={me.piece.quarters} width={132} colour={colour} />
          <div style={{ flex: 1 }}>
            <div className="lc-stat-label">Our piece</div>
            <div className="lc-stat-value" style={{ fontSize: 26 }}>{me.received}<span style={{ color: 'var(--ink-faint)', fontSize: 17 }}>/{me.rounds} unlocked</span></div>
            <div className="lc-stat-label" style={{ marginTop: 10 }}>Codes we delivered</div>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18 }}>{me.sent}<span style={{ color: 'var(--ink-faint)', fontSize: 14 }}>/{me.rounds}</span></div>
          </div>
        </div>
      </div>

      {complete && (
        <div className="lc-card lc-pop" style={{ padding: 22, marginBottom: 14, textAlign: 'center', border: '1px solid rgba(232,185,35,.4)' }}>
          <div style={{ color: 'var(--gold)', display: 'flex', justifyContent: 'center', marginBottom: 8 }}><Icon name="flag" size={28} /></div>
          <h2 className="lc-h2" style={{ margin: '0 0 6px' }}>The picture is complete</h2>
          <p className="lc-sub">Look up at the screen.</p>
        </div>
      )}

      {/* My scenario(s) */}
      {!complete && openTasks.map((t) => {
        const key = `${t.deliveryId}:${t.position}`;
        const choice = picked[key];
        return (
          <div key={key} className="lc-card lc-fadein" style={{ padding: 18, marginBottom: 14, border: '1px solid rgba(232,87,26,.45)' }}>
            <SectionTitle icon="key" colour="var(--carnelian-bright)">Your turn: digit {t.position} of 4</SectionTitle>
            <p className="lc-faint" style={{ marginTop: 0, marginBottom: 8 }}>For <TeamTag number={t.toTeam} colour={(me.outgoing && me.outgoing.toColour) || undefined} /> &middot; {t.scenario.category}</p>
            <p style={{ fontSize: 16.5, lineHeight: 1.5, margin: '0 0 16px', fontWeight: 500 }}>{t.scenario.text}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {t.scenario.options.map((o, i) => (
                <button key={i} onClick={() => setPicked((p) => ({ ...p, [key]: i }))}
                  className={`lc-option ${choice === i ? 'lc-selected' : ''}`} style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 15,
                    background: choice === i ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.07)',
                  }}>{i + 1}</span>
                  <span>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 15.5 }}>{o.title}</span>
                    <span style={{ display: 'block', fontSize: 13.5, opacity: 0.8, marginTop: 4, lineHeight: 1.45 }}>{o.detail}</span>
                  </span>
                </button>
              ))}
            </div>
            <button className="lc-btn lc-btn-primary" style={{ width: '100%', marginTop: 14 }} disabled={choice === undefined || !!sent[key]} onClick={() => lockIn(t)}>
              {sent[key] ? 'Locking in...' : 'Lock in my answer'}
            </button>
            <p className="lc-faint" style={{ marginBottom: 0 }}>No wrong answers. Pick what you would really do.</p>
          </div>
        );
      })}

      {!complete && doneTasks.map((t) => {
        const o = t.scenario.options[t.answered];
        return (
          <div key={`${t.deliveryId}:${t.position}`} className="lc-card" style={{ padding: 16, marginBottom: 14, display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{
              width: 46, height: 54, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 28, color: '#1a1410', background: 'linear-gradient(160deg,#f6d77a,var(--gold))',
            }}>{t.digit}</div>
            <div>
              <div className="lc-stat-label">Your digit {t.position} of 4</div>
              <div style={{ fontWeight: 600, marginTop: 3 }}>{o ? o.title : ''}</div>
              <div className="lc-faint" style={{ marginTop: 4 }}>Locked in. The code appears once all 4 answers are in.</div>
            </div>
          </div>
        );
      })}

      {/* Our delivery */}
      {!complete && (
        <div className="lc-card" style={{ padding: 18, marginBottom: 14 }}>
          <SectionTitle icon="send">Our delivery</SectionTitle>
          {!out ? (
            <p style={{ margin: 0, color: 'var(--ink-dim)' }}>
              {me.sent >= me.rounds ? 'All 4 codes delivered. Help your captain unlock your piece.' : 'Waiting for the next round...'}
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                <span className="lc-faint" style={{ margin: 0 }}>Round {out.round} of {me.rounds}</span>
                <Icon name="arrow" size={14} style={{ opacity: 0.5 }} />
                <TeamTag number={out.toTeam} colour={out.toColour} />
                {out.toCaptainName && <span className="lc-faint" style={{ margin: 0 }}>captain {out.toCaptainName}</span>}
              </div>
              {out.status === 'answering' && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {out.answerers.map((a) => (
                      <div key={a.position} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: 'rgba(255,255,255,.035)' }}>
                        <span style={{ width: 22, fontWeight: 700, opacity: 0.55 }}>{a.position}</span>
                        <span style={{ flex: 1, fontWeight: a.isMe ? 700 : 500 }}>{a.name || 'Waiting for someone'}{a.isMe ? ' (you)' : ''}</span>
                        {a.done
                          ? <span style={{ color: '#3ddc84' }}><Icon name="check" size={18} stroke={2.4} /></span>
                          : <span style={{ color: 'var(--ink-faint)' }}><Icon name="clock" size={16} /></span>}
                      </div>
                    ))}
                  </div>
                  <p className="lc-faint" style={{ marginBottom: 0 }}>{out.answeredCount}/4 answered. The code appears here once all 4 are in.</p>
                </>
              )}
              {out.status === 'ready' && (
                <div className="lc-pop" style={{ textAlign: 'center' }}>
                  <CodeDigits code={out.code} />
                  <p style={{ margin: '16px 0 6px', fontWeight: 600 }}>Deliver this code to Team {out.toTeam}{out.toCaptainName ? `. Give it to their captain, ${out.toCaptainName}` : ''}.</p>
                  <p className="lc-faint" style={{ marginTop: 0, marginBottom: 0 }}>Their captain types it in to unlock part of their picture.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Receiving: captain enters codes */}
      {!complete && (
        <div className="lc-card" style={{ padding: 18, marginBottom: 14 }}>
          <SectionTitle icon="key">Codes coming to us</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {me.incoming.map((d) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: 'rgba(255,255,255,.035)', opacity: d.status === 'unlocked' ? 0.55 : 1 }}>
                <TeamTag number={d.fromTeam} colour={d.fromColour} />
                <span style={{ marginLeft: 'auto', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, color: d.status === 'unlocked' ? '#3ddc84' : d.status === 'ready' ? 'var(--gold)' : 'var(--ink-faint)' }}>
                  {d.status === 'unlocked' && <><Icon name="check" size={15} stroke={2.4} /> Unlocked</>}
                  {d.status === 'ready' && <><Icon name="send" size={14} /> On the way</>}
                  {d.status === 'waiting' && <><Icon name="clock" size={14} /> Answering</>}
                </span>
              </div>
            ))}
          </div>

          {!me.isCaptain && (
            <p style={{ margin: 0, color: 'var(--ink-dim)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Icon name="captain" size={16} style={{ marginTop: 2, color: 'var(--gold)' }} />
              <span>{me.captainName || 'Your captain'} enters codes for your team.{me.captainOnline ? '' : ' If they stay offline, the role moves to someone else automatically.'} When a team arrives with a code, bring them to {me.captainName || 'your captain'}.</span>
            </p>
          )}

          {flash && (
            <div className="lc-fadein" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderRadius: 12, marginBottom: 12, background: 'rgba(61,220,132,.12)', border: '1px solid rgba(61,220,132,.4)', color: '#3ddc84', fontWeight: 600 }}>
              <Icon name="check" size={18} stroke={2.4} /><span>{flash}</span>
            </div>
          )}

          {me.isCaptain && (
            lockLeft > 0 ? (
              <div style={{ textAlign: 'center', padding: '10px 0', color: '#ff9a9a' }}>
                <Icon name="lock" size={22} />
                <p style={{ margin: '8px 0 0' }}>Too many wrong codes. Try again in {lockLeft}s.</p>
              </div>
            ) : (
              <form onSubmit={submitCode}>
                <input className="lc-input" value={code} inputMode="numeric" placeholder="Enter the 4 digit code"
                  onChange={(e) => setCode(e.target.value.replace(/[^1-3]/g, '').slice(0, 4))}
                  style={code ? { fontSize: 28, letterSpacing: 14, fontFamily: "'Poppins',sans-serif", fontWeight: 700 } : { fontSize: 17 }} />
                <button className="lc-btn lc-btn-primary" type="submit" style={{ width: '100%', marginTop: 10 }} disabled={code.length !== 4}>Unlock</button>
                <p className="lc-faint" style={{ marginBottom: 0 }}>Each digit is 1, 2 or 3. The code unlocks your piece straight away.</p>
              </form>
            )
          )}

        </div>
      )}

      {/* Behaviour key */}
      <div className="lc-card" style={{ padding: '14px 18px', marginBottom: 14 }}>
        <button onClick={() => setShowKey((s) => !s)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: 'var(--ink)', cursor: 'pointer', padding: 0, fontSize: 14, fontWeight: 600 }}>
          <Icon name="puzzle" size={16} style={{ color: 'var(--gold)' }} /> The 5 behaviours
          <Icon name="chevron" size={16} style={{ marginLeft: 'auto', transform: showKey ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
        </button>
        {showKey && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            {BEHAVIOR_LIST.map((b) => (
              <div key={b} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <BehaviorIcon behavior={b} size={18} />
                <div>
                  <div style={{ fontWeight: 700, color: BEHAVIOR_META[b].colour }}>{b}</div>
                  <div style={{ fontSize: 13.5, color: 'var(--ink-dim)', lineHeight: 1.45 }}>{(me.definitions || {})[b]}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Team */}
      <div className="lc-card" style={{ padding: '14px 18px' }}>
        <button onClick={() => setShowTeam((s) => !s)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: 'var(--ink)', cursor: 'pointer', padding: 0, fontSize: 14, fontWeight: 600 }}>
          <Icon name="users" size={16} style={{ color: 'var(--gold)' }} /> My team
          <Icon name="chevron" size={16} style={{ marginLeft: 'auto', transform: showTeam ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
        </button>
        {showTeam && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
            {teammates.length > 0
              ? teammates.map((n, i) => <div key={i} className="lc-teammate" style={{ animationDelay: `${i * 40}ms` }}>{n}{n === me.captainName ? '  (captain)' : ''}</div>)
              : <div className="lc-teammate" style={{ opacity: 0.6, fontStyle: 'italic' }}>No one else on your team</div>}
          </div>
        )}
      </div>
    </>
  );
}

/* ============================================================
   CODE UP: PROJECTOR
   ============================================================ */
function BehaviorBars({ stats, large }) {
  if (!stats) return null;
  const total = stats.answersGiven || 0;
  const max = Math.max(1, ...BEHAVIOR_LIST.map((b) => stats.chosen[b] || 0));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: large ? 18 : 10 }}>
      {BEHAVIOR_LIST.map((b) => {
        const n = stats.chosen[b] || 0;
        const pct = total ? Math.round((n / total) * 100) : 0;
        const meta = BEHAVIOR_META[b];
        return (
          <div key={b} style={{ display: 'flex', alignItems: 'center', gap: large ? 18 : 10 }}>
            <BehaviorIcon behavior={b} size={large ? 30 : 18} />
            <div style={{ width: large ? 210 : 120, fontWeight: 700, fontSize: large ? 22 : 13, color: meta.colour }}>{b}</div>
            <div style={{ flex: 1, height: large ? 22 : 9, borderRadius: 999, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}>
              <div style={{ width: `${(n / max) * 100}%`, height: '100%', borderRadius: 999, background: meta.colour, transition: 'width .8s cubic-bezier(.2,.8,.3,1)' }} />
            </div>
            <div style={{ width: large ? 90 : 46, textAlign: 'right', fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: large ? 28 : 13 }}>{pct}%</div>
            {large && (
              <div style={{ width: 130, textAlign: 'right', fontSize: 15, color: 'rgba(245,240,232,.55)', whiteSpace: 'nowrap' }}>
                {n} chosen
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PuzzleBoard({ board, maxW, maxH }) {
  const ratio = usePuzzleImageRatio();
  const width = Math.max(200, Math.min(maxW, maxH * ratio));
  const height = width / ratio;
  const gap = 2;
  const qCols = BOARD_COLS * 2, qRows = BOARD_ROWS * 2;
  const cw = width / qCols, ch = height / qRows;
  const pieces = board ? board.pieces : [];
  return (
    <div style={{ position: 'relative', width, height }}>
      {pieces.map((p) => [0, 1, 2, 3].map((q) => {
        const { c, r } = quarterCell(p.slot, q);
        const open = !!p.quarters[q];
        return (
          <div key={`${p.slot}-${q}`} className={open ? 'lc-quarter-open' : ''} style={{
            position: 'absolute', left: c * cw + gap / 2, top: r * ch + gap / 2, width: cw - gap, height: ch - gap,
            borderRadius: 3,
            ...(open ? cropStyle(c, r) : { background: 'rgba(255,255,255,.035)' }),
          }} />
        );
      }))}
      {/* piece outlines and team numbers on pieces still locked */}
      {pieces.map((p) => {
        const idx = p.slot - 1;
        const col = idx % BOARD_COLS, row = Math.floor(idx / BOARD_COLS);
        const done = p.quarters.every(Boolean);
        const count = p.quarters.filter(Boolean).length;
        return (
          <div key={`o${p.slot}`} style={{
            position: 'absolute', left: col * cw * 2, top: row * ch * 2, width: cw * 2, height: ch * 2,
            border: `1.5px solid ${done ? 'transparent' : (p.colour || 'rgba(255,255,255,.2)') + '88'}`, borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', transition: 'border-color .8s',
          }}>
            {!done && p.teamNumber && (
              <span style={{
                padding: '4px 10px', borderRadius: 999, background: 'rgba(7,8,11,.78)', border: `1px solid ${p.colour}66`,
                color: p.colour, fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: Math.max(11, Math.min(17, cw / 5.5)),
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                Team {p.teamNumber}<span style={{ color: 'rgba(245,240,232,.5)', fontWeight: 600 }}>{count}/4</span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PuzzleProjector({ board }) {
  const [qrOpen, setQrOpen] = useState(false);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const sideW = Math.min(330, Math.max(250, size.w * 0.21));
  const pad = 26;
  const complete = board && board.state === 'complete';
  const showResults = board && board.showResults && board.stats;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: 'radial-gradient(ellipse at top, #1a1410 0%, #07080b 60%)', color: '#f5f0e8', fontFamily: "'Inter',sans-serif" }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: TOP_BAR_HEIGHT, zIndex: 15,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px',
        background: '#0d0e12', borderBottom: '2px solid #e8571a',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <img src="/logo.png" alt="Carnelian" style={{ height: 38 }} />
          <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16 }}>Code Up</span>
        </div>
        <div style={{ flex: 1, textAlign: 'center', fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 15 }}>
          {complete ? (
            <span style={{ color: '#e8b923' }}>Complete</span>
          ) : (
            <>
              <span style={{ color: '#e8571a' }}>{board ? board.unlocked : 0}</span>
              <span style={{ color: 'rgba(245,240,232,.55)', marginLeft: 6 }}>of {board ? board.total : 80} pieces unlocked</span>
            </>
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 18 }}>
          <span style={{ fontSize: 11.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(245,240,232,.4)' }}>Convey Meaning. Create Significance.</span>
          <QrButton open={qrOpen} onClick={() => setQrOpen((o) => !o)} />
        </div>
      </div>
      <QrPanel open={qrOpen} onClose={() => setQrOpen(false)} joinUrl={JOIN_URL} />

      <div style={{ position: 'absolute', top: TOP_BAR_HEIGHT + pad, left: pad, right: sideW + pad * 2, bottom: pad, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PuzzleBoard board={board} maxW={size.w - sideW - pad * 3} maxH={size.h - TOP_BAR_HEIGHT - pad * 2} />
      </div>

      <div style={{ position: 'absolute', top: TOP_BAR_HEIGHT + pad, right: pad, bottom: pad, width: sideW, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ padding: 18, borderRadius: 16, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }}>
          <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(232,185,35,.85)', fontWeight: 700, marginBottom: 12 }}>How it works</div>
          {[
            ['key', '4 of you answer a scenario. Your choices make a 4 digit code.'],
            ['send', 'Deliver the code to your partner team\'s captain.'],
            ['puzzle', 'Their captain enters it and a piece of their picture unlocks.'],
          ].map(([ic, t]) => (
            <div key={ic} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10, fontSize: 13.5, lineHeight: 1.45, color: 'rgba(245,240,232,.78)' }}>
              <span style={{ color: '#e8571a', marginTop: 1 }}><Icon name={ic} size={16} /></span>{t}
            </div>
          ))}
        </div>

        <div style={{ padding: 18, borderRadius: 16, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(232,185,35,.85)', fontWeight: 700, marginBottom: 12 }}>Latest</div>
          {(!board || board.feed.length === 0) && <div style={{ fontSize: 13.5, color: 'rgba(245,240,232,.45)' }}>Waiting for the first code...</div>}
          {board && board.feed.map((f, i) => (
            <div key={f.at + '-' + i} className="lc-rise" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.05)', fontSize: 13.5, opacity: 1 - i * 0.09 }}>
              <span style={{ color: '#3ddc84' }}><Icon name="check" size={15} stroke={2.4} /></span>
              <span>{f.text}</span>
            </div>
          ))}
        </div>

        <div style={{ padding: 18, borderRadius: 16, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }}>
          <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(232,185,35,.85)', fontWeight: 700, marginBottom: 12 }}>The 5 behaviours</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {BEHAVIOR_LIST.map((b) => (
              <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600 }}>
                <BehaviorIcon behavior={b} size={17} /><span>{b}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showResults && (
        <div className="lc-fadein" style={{
          position: 'absolute', inset: 0, top: TOP_BAR_HEIGHT, zIndex: 20, background: 'rgba(7,8,11,.94)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '30px 6vw',
        }}>
          <div style={{ fontSize: 13, letterSpacing: '.3em', textTransform: 'uppercase', color: 'rgba(232,185,35,.85)', fontWeight: 600, marginBottom: 10 }}>How the room chose</div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 'clamp(30px,4vw,54px)', marginBottom: 34, textAlign: 'center' }}>
            {board.stats.answersGiven} decisions across the room
          </div>
          <div style={{ width: 'min(1100px, 100%)' }}>
            <BehaviorBars stats={board.stats} large />
          </div>
          <div style={{ marginTop: 34, display: 'flex', gap: 28, flexWrap: 'wrap', justifyContent: 'center', fontSize: 15, color: 'rgba(245,240,232,.6)' }}>
            <span><b style={{ color: '#f5f0e8' }}>%</b> share of all answers that showed this behaviour</span>
            <span><b style={{ color: '#f5f0e8' }}>chosen</b> number of answers that showed it</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   CODE UP: FACILITATOR
   ============================================================ */
const DELIVERY_STATUS_LABEL = { answering: 'Answering', ready: 'Code on the way' };

function minutesSince(ts, now) {
  if (!ts) return '';
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function PuzzleFacilitatorPanel({ pz, board, onConfirm }) {
  const now = useNow(true, 1000);
  const [busy, setBusy] = useState(false);
  if (!pz) return <div className="lc-card" style={{ padding: 24 }}><p className="lc-faint" style={{ margin: 0 }}>Loading puzzle...</p></div>;
  const stats = pz.stats;
  const inFlight = pz.teams.filter((t) => t.outgoing).length;
  const complete = pz.state === 'complete';

  function unlock(deliveryId, from, to) {
    onConfirm({
      title: `Unlock for Team ${to}?`,
      message: `This opens the piece Team ${from} is bringing to Team ${to} without a code. Use it only when a pair is genuinely stuck.`,
      confirmLabel: 'Unlock piece',
      onConfirm: () => socket.emit('facilitator_puzzle_unlock', { deliveryId }),
    });
  }

  return (
    <>
      <div className="lc-stats-row" style={{ display: 'flex', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
        <div className="lc-stat-card"><div className="lc-stat-label">Unlocked</div><div className="lc-stat-value">{board ? board.unlocked : 0}<span style={{ color: 'var(--ink-faint)', fontSize: 20 }}>/{board ? board.total : 80}</span></div>
          <div className="lc-bar-track" style={{ marginTop: 10 }}><div className="lc-bar-fill" style={{ width: `${board ? (board.unlocked / board.total) * 100 : 0}%` }} /></div></div>
        <div className="lc-stat-card"><div className="lc-stat-label">Deliveries in progress</div><div className="lc-stat-value">{complete ? 0 : inFlight}</div></div>
        <div className="lc-stat-card"><div className="lc-stat-label">Answers given</div><div className="lc-stat-value">{stats.answersGiven}</div></div>
        <div className="lc-stat-card"><div className="lc-stat-label">Codes delivered</div><div className="lc-stat-value">{pz.teams.reduce((n, t) => n + t.sent, 0)}<span style={{ color: 'var(--ink-faint)', fontSize: 20 }}>/{pz.teams.length * 4}</span></div></div>
      </div>

      <div className="lc-card" style={{ padding: 22, marginBottom: 18 }}>
        <div className="lc-btn-row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className={`lc-btn ${pz.showResults ? 'lc-btn-outline' : 'lc-btn-gold'}`} style={{ flex: '1 1 200px' }}
            onClick={() => socket.emit('facilitator_puzzle_results', { show: !pz.showResults })}>
            {pz.showResults ? 'Hide results on projector' : 'Show results on projector'}
          </button>
          {!complete && (
            <button className="lc-btn lc-btn-primary" style={{ flex: '1 1 200px' }} onClick={() => onConfirm({
              title: 'End and reveal the picture?',
              message: 'Every locked piece opens on the projector right away and phones show the game as complete.',
              confirmLabel: 'End and reveal',
              onConfirm: () => socket.emit('facilitator_puzzle_reveal'),
            })}>End and reveal picture</button>
          )}
          {complete && (
            <button className="lc-btn lc-btn-gold" style={{ flex: '1 1 220px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} disabled={busy}
              onClick={async () => { setBusy(true); try { await downloadBehaviourPdf(pz); } finally { setBusy(false); } }}>
              <Icon name="download" size={18} /> {busy ? 'Preparing PDF...' : 'Download behaviour stats'}
            </button>
          )}
          <button className="lc-btn lc-btn-outline" style={{ flex: '1 1 160px' }} onClick={() => onConfirm({
            title: 'Restart the puzzle?',
            message: 'New pairings, new scenarios and new captains. The board goes back to fully locked. Teams stay as they are.',
            confirmLabel: 'Restart puzzle', danger: true,
            onConfirm: () => socket.emit('facilitator_restart_puzzle'),
          })}>Restart puzzle</button>
        </div>
      </div>

      <div className="lc-card" style={{ padding: 22, marginBottom: 18 }}>
        <h3 style={{ fontSize: 14, opacity: .75, margin: '0 0 6px', letterSpacing: '.05em', textTransform: 'uppercase' }}>Behaviour stats (whole room)</h3>
        <p className="lc-faint" style={{ marginTop: 0, marginBottom: 16 }}>
          Key: <b>%</b> share of all answers showing that behaviour. <b>Chosen</b> number of answers that showed it.
        </p>
        <BehaviorBars stats={stats} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8, marginTop: 16 }}>
          {BEHAVIOR_LIST.map((b) => (
            <div key={b} style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,.03)', fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: BEHAVIOR_META[b].colour, marginBottom: 4 }}><BehaviorIcon behavior={b} size={14} />{b}</div>
              <div style={{ color: 'var(--ink-dim)' }}>Chosen {stats.chosen[b]}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="lc-card" style={{ padding: 22, marginBottom: 18 }}>
        <h3 style={{ fontSize: 14, opacity: .75, margin: '0 0 6px', letterSpacing: '.05em', textTransform: 'uppercase' }}>Teams</h3>
        <p className="lc-faint" style={{ marginTop: 0, marginBottom: 16 }}>
          Key: <b>Sent</b> codes this team delivered. <b>Got</b> quarters of their own piece unlocked. <b>Leans</b> the behaviour this team chose most. Green dot online, grey offline. Codes are shown here so you can help a stuck pair. Offline captains and answerers are replaced automatically after about 30 seconds.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 12 }}>
          {pz.teams.map((t) => {
            const o = t.outgoing;
            const slow = o && o.since && now - o.since > 4 * 60 * 1000;
            const top = BEHAVIOR_LIST.slice().sort((a, b) => (t.stats.chosen[b] || 0) - (t.stats.chosen[a] || 0))[0];
            return (
              <div key={t.number} style={{ padding: 14, borderRadius: 14, background: 'rgba(255,255,255,.03)', border: `1px solid ${slow ? 'rgba(255,107,107,.55)' : t.colour + '33'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <TeamTag number={t.number} colour={t.colour} />
                  <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink-dim)' }}>Sent {t.sent}/4 &middot; Got {t.received}/4</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13 }}>
                  <Icon name="captain" size={14} style={{ color: 'var(--gold)' }} />
                  <select className="lc-select" value={t.captainId || ''} style={{ padding: '7px 10px', fontSize: 13, flex: 1 }}
                    onChange={(e) => socket.emit('facilitator_puzzle_set_captain', { teamNumber: t.number, participantId: e.target.value })}>
                    {t.members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.online ? '' : ' (offline)'}</option>)}
                  </select>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.captainOnline ? '#3ddc84' : '#666' }} />
                </div>

                {t.lockedUntil > now && <div style={{ fontSize: 12.5, color: '#ff9a9a', marginBottom: 8 }}>Code entry paused for {Math.ceil((t.lockedUntil - now) / 1000)}s (wrong codes)</div>}

                {o ? (
                  <div style={{ padding: 10, borderRadius: 10, background: 'rgba(255,255,255,.03)', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 6 }}>
                      <span style={{ opacity: .6 }}>R{o.round}</span>
                      <Icon name="arrow" size={13} style={{ opacity: .5 }} />
                      <b>Team {o.toTeam}</b>
                      <span style={{ marginLeft: 'auto', color: slow ? '#ff9a9a' : 'var(--ink-dim)', fontSize: 12 }}>{DELIVERY_STATUS_LABEL[o.status]} &middot; {minutesSince(o.since, now)}</span>
                    </div>
                    {o.status === 'answering' && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {o.answerers.map((a, i) => (
                          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 999, fontSize: 12, background: a.done ? 'rgba(61,220,132,.12)' : 'rgba(255,255,255,.05)', color: a.done ? '#3ddc84' : 'var(--ink-dim)' }}>
                            {a.done ? <Icon name="check" size={11} stroke={2.6} /> : <span style={{ width: 6, height: 6, borderRadius: '50%', background: a.online ? '#3ddc84' : '#666' }} />}
                            {a.name || '-'}
                          </span>
                        ))}
                      </div>
                    )}
                    {o.code && <div style={{ fontSize: 13, marginTop: 4 }}>Code <b style={{ letterSpacing: 3, color: 'var(--gold)' }}>{o.code}</b></div>}
                    <button className="lc-btn lc-btn-outline" style={{ width: '100%', padding: '7px', fontSize: 12.5, marginTop: 8 }} onClick={() => unlock(o.id, t.number, o.toTeam)}>
                      Unlock for Team {o.toTeam}
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginBottom: 8 }}>{t.sent >= 4 ? 'All codes delivered' : 'Waiting'}</div>
                )}

                {t.stats.answersGiven > 0 && (
                  <div style={{ fontSize: 12.5, color: 'var(--ink-dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    Leans <BehaviorIcon behavior={top} size={13} /><b style={{ color: BEHAVIOR_META[top].colour }}>{top}</b>
                    <span style={{ marginLeft: 'auto' }}>{t.stats.answersGiven} answers</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* ============================================================
   DOWNLOADS (PDF built in the browser, no extra packages)
   ============================================================ */
// Each page is drawn on a canvas and embedded as a JPEG in a small PDF.
const PDF_PAGE = { w: 842, h: 595 };          // A4 landscape in points
const PDF_PX = { w: 1754, h: 1240 };          // ~150 dpi canvas per page

function pdfFromCanvases(canvases) {
  const enc = new TextEncoder();
  const chunks = []; const offsets = []; let len = 0;
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); len += b.length; };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  const toBytes = (url) => { const s = atob(url.split(',')[1]); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
  push('%PDF-1.4\n%âãÏÓ\n');
  const n = canvases.length;
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Kids [${canvases.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}] /Count ${n} >>`));
  canvases.forEach((c, i) => {
    const page = 3 + 3 * i, content = page + 1, img = page + 2;
    const jpg = toBytes(c.toDataURL('image/jpeg', 0.92));
    const draw = `q ${PDF_PAGE.w} 0 0 ${PDF_PAGE.h} 0 0 cm /Im0 Do Q`;
    obj(page, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE.w} ${PDF_PAGE.h}] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${content} 0 R >>`));
    obj(content, () => { push(`<< /Length ${draw.length} >>\nstream\n`); push(draw); push('\nendstream'); });
    obj(img, () => { push(`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); push(jpg); push('\nendstream'); });
  });
  const total = 3 + 3 * n, xref = len;
  let table = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let k = 1; k < total; k++) table += `${String(offsets[k]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: 'application/pdf' });
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth ? img : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function readyFonts() {
  try {
    await Promise.all(['400 20px Inter', '600 20px Inter', '600 20px Poppins', '700 20px Poppins', '800 20px Poppins'].map((f) => document.fonts.load(f)));
  } catch (e) { /* system fonts are fine */ }
}

function newPage(bg = '#fdf8f2') {
  const c = document.createElement('canvas');
  c.width = PDF_PX.w; c.height = PDF_PX.h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
  ctx.textBaseline = 'alphabetic';
  return { c, ctx };
}

function wrapText(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  words.forEach((w) => {
    while (ctx.measureText(w).width > maxW && w.length > 1) { // a very long word: break it
      let k = w.length;
      while (k > 1 && ctx.measureText((cur ? cur + ' ' : '') + w.slice(0, k)).width > maxW) k--;
      if (k <= 1 && cur) { lines.push(cur); cur = ''; continue; }
      lines.push((cur ? cur + ' ' : '') + w.slice(0, k)); cur = ''; w = w.slice(k);
    }
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width <= maxW) cur = t; else { if (cur) lines.push(cur); cur = w; }
  });
  if (cur) lines.push(cur);
  return lines;
}

// Draws wrapped text and returns the y below it. Cuts with "..." past maxLines.
function drawText(ctx, text, x, y, maxW, lineH, maxLines = 99) {
  let lines = wrapText(ctx, text, maxW);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1];
    while (last.length && ctx.measureText(last + '...').width > maxW) last = last.slice(0, -1);
    lines[maxLines - 1] = last + '...';
  }
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
  return y + lines.length * lineH;
}

function spacedLabel(ctx, text, x, y, colour, size = 22) {
  ctx.font = `700 ${size}px Poppins, sans-serif`;
  ctx.fillStyle = colour;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
  ctx.fillText(text.toUpperCase(), x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

function fillRound(ctx, x, y, w, h, r, fill, stroke, lineW = 2) {
  pathRoundRect(ctx, x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineW; ctx.stroke(); }
}

async function drawHeaderLogos(ctx, rightX, y, h = 46) {
  const [carnelian, leap] = await Promise.all([loadImage('/logo.png'), loadImage('/leap-logo.png')]);
  let x = rightX;
  if (leap) { const w = (leap.naturalWidth / leap.naturalHeight) * h; x -= w; ctx.drawImage(leap, x, y, w, h); x -= 28; }
  else {
    ctx.font = '800 30px Poppins, sans-serif'; ctx.textAlign = 'right';
    ctx.fillStyle = '#2a1d14'; const leapW = ctx.measureText('LEAP').width;
    ctx.fillStyle = '#e8571a'; ctx.fillText('LEAP', x, y + h * 0.72);
    ctx.fillStyle = '#2a1d14'; ctx.fillText('Take the ', x - leapW, y + h * 0.72);
    ctx.textAlign = 'left';
    x -= ctx.measureText('Take the LEAP').width + 28;
  }
  if (carnelian) { const w = (carnelian.naturalWidth / carnelian.naturalHeight) * h; ctx.drawImage(carnelian, x - w, y, w, h); }
}

const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

// ---------- Code Up: behaviour stats ----------
async function downloadBehaviourPdf(pz) {
  await readyFonts();
  const W = PDF_PX.w, H = PDF_PX.h, M = 90;
  const stats = pz.stats;
  const total = stats.answersGiven || 0;
  const pages = [];

  // Page 1: the whole room
  {
    const { c, ctx } = newPage();
    ctx.fillStyle = '#e8571a'; ctx.fillRect(0, 0, W, 14);
    await drawHeaderLogos(ctx, W - M, 54);
    ctx.fillStyle = '#2a1d14'; ctx.font = '800 58px Poppins, sans-serif';
    ctx.fillText('Code Up: how the room chose', M, 110);
    ctx.fillStyle = '#7a6a5c'; ctx.font = '400 28px Inter, sans-serif';
    ctx.fillText(`${total} decisions across ${pz.teams.length} teams  |  ${today()}`, M, 160);
    const max = Math.max(1, ...BEHAVIOR_LIST.map((b) => stats.chosen[b] || 0));
    const top = 230, rowH = 150, labelW = 380, barX = M + labelW, barW = W - M - barX - 280;
    BEHAVIOR_LIST.forEach((b, i) => {
      const y = top + i * rowH, n = stats.chosen[b] || 0, pct = total ? Math.round((n / total) * 100) : 0;
      const col = BEHAVIOR_META[b].colour;
      fillRound(ctx, M, y + 22, 40, 40, 10, col);
      ctx.fillStyle = '#2a1d14'; ctx.font = '700 36px Poppins, sans-serif'; ctx.fillText(b, M + 60, y + 55);
      fillRound(ctx, barX, y + 16, barW, 52, 26, '#efe3d6');
      if (n) fillRound(ctx, barX, y + 16, Math.max(52, (n / max) * barW), 52, 26, col);
      ctx.fillStyle = '#2a1d14'; ctx.font = '800 40px Poppins, sans-serif'; ctx.fillText(`${pct}%`, barX + barW + 30, y + 56);
      ctx.fillStyle = '#7a6a5c'; ctx.font = '400 26px Inter, sans-serif'; ctx.fillText(`${n} chosen`, barX + barW + 140, y + 55);
      ctx.fillStyle = '#e4d6c8'; ctx.fillRect(M, y + rowH - 26, W - 2 * M, 2);
    });
    const leader = BEHAVIOR_LIST.slice().sort((a, b) => (stats.chosen[b] || 0) - (stats.chosen[a] || 0))[0];
    ctx.fillStyle = '#2a1d14'; ctx.font = '600 30px Inter, sans-serif';
    ctx.fillText(total ? `The room leaned most towards ${leader}.` : 'No answers were given.', M, top + 5 * rowH + 30);
    ctx.fillStyle = '#7a6a5c'; ctx.font = '400 24px Inter, sans-serif';
    drawText(ctx, 'Key: % = share of all answers in the room that showed this behaviour. Chosen = number of answers that showed it. The longest bar is the behaviour chosen most; the others are drawn against it.', M, H - 90, W - 2 * M, 34);
    pages.push(c);
  }

  // Page 2: team by team
  {
    const { c, ctx } = newPage();
    ctx.fillStyle = '#e8571a'; ctx.fillRect(0, 0, W, 14);
    ctx.fillStyle = '#2a1d14'; ctx.font = '800 46px Poppins, sans-serif';
    ctx.fillText('Code Up: team by team', M, 96);
    ctx.fillStyle = '#7a6a5c'; ctx.font = '400 24px Inter, sans-serif';
    ctx.fillText('How many of each team\'s answers showed each behaviour', M, 136);
    const cols = [{ k: 'Team', w: 170 }, { k: 'Answers', w: 150 }, ...BEHAVIOR_LIST.map((b) => ({ k: b, w: 210, b })), { k: 'Leans', w: 0 }];
    const fixed = cols.reduce((s, x) => s + x.w, 0);
    cols[cols.length - 1].w = W - 2 * M - fixed;
    const teamsSorted = pz.teams.slice().sort((a, b) => a.number - b.number);
    const headY = 180, rowH = Math.min(46, Math.floor((H - headY - 170) / (teamsSorted.length + 1)));
    let x = M;
    ctx.font = '700 21px Poppins, sans-serif';
    cols.forEach((col) => {
      ctx.fillStyle = col.b ? BEHAVIOR_META[col.b].colour : '#2a1d14';
      ctx.fillText(col.k, x + 12, headY + rowH * 0.62); x += col.w;
    });
    ctx.fillStyle = '#2a1d14'; ctx.fillRect(M, headY + rowH, W - 2 * M, 2);
    teamsSorted.forEach((t, r) => {
      const y = headY + rowH * (r + 1) + 2;
      if (r % 2) { ctx.fillStyle = '#f5ece2'; ctx.fillRect(M, y, W - 2 * M, rowH); }
      const ts = t.stats || { chosen: {}, answersGiven: 0 };
      const tTotal = ts.answersGiven || 0;
      const lean = tTotal ? BEHAVIOR_LIST.slice().sort((a, b) => (ts.chosen[b] || 0) - (ts.chosen[a] || 0))[0] : '-';
      let cx = M;
      cols.forEach((col) => {
        let txt = '';
        if (col.k === 'Team') {
          ctx.fillStyle = t.colour || '#888'; ctx.beginPath(); ctx.arc(cx + 22, y + rowH / 2, 8, 0, Math.PI * 2); ctx.fill();
          txt = `Team ${t.number}`;
          ctx.fillStyle = '#2a1d14'; ctx.font = '600 22px Inter, sans-serif'; ctx.fillText(txt, cx + 40, y + rowH * 0.66);
        } else if (col.b) {
          const n = ts.chosen[col.b] || 0;
          if (n && tTotal) {
            ctx.globalAlpha = 0.15 + 0.6 * (n / tTotal);
            fillRound(ctx, cx + 6, y + 5, col.w - 24, rowH - 10, 8, BEHAVIOR_META[col.b].colour);
            ctx.globalAlpha = 1;
          }
          ctx.fillStyle = '#2a1d14'; ctx.font = '600 22px Inter, sans-serif';
          ctx.fillText(String(n), cx + 18, y + rowH * 0.66);
        } else {
          ctx.fillStyle = col.k === 'Leans' && lean !== '-' ? BEHAVIOR_META[lean].colour : '#2a1d14';
          ctx.font = `${col.k === 'Leans' ? 700 : 600} 22px Inter, sans-serif`;
          ctx.fillText(col.k === 'Answers' ? String(tTotal) : lean, cx + 12, y + rowH * 0.66);
        }
        cx += col.w;
      });
    });
    ctx.fillStyle = '#7a6a5c'; ctx.font = '400 22px Inter, sans-serif';
    drawText(ctx, 'Key: Answers = scenario answers this team gave for its partner teams. Each behaviour column = how many of those answers showed that behaviour; the darker the cell, the bigger its share of the team\'s answers. Leans = the behaviour the team chose most.', M, H - 100, W - 2 * M, 32);
    pages.push(c);
  }

  saveBlob(pdfFromCanvases(pages), `Code Up - behaviour stats.pdf`);
}

// ---------- Own It: one card per team ----------
async function drawOwnItCard(team, kase, members, number, total) {
  const { c, ctx } = newPage('#fdf8f2');
  const W = PDF_PX.w, H = PDF_PX.h, M = 70;
  const pillar = PILLAR_META[kase && kase.pillar] || { colour: '#888' };
  const ink = '#2a1d14', dim = '#7a6a5c', skin = '#f7e6d3';
  ctx.fillStyle = team.colour || '#e8571a'; ctx.fillRect(0, 0, W, 14);

  // Header
  ctx.fillStyle = team.colour || '#888'; ctx.beginPath(); ctx.arc(M + 18, 96, 18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ink; ctx.font = '800 62px Poppins, sans-serif'; ctx.fillText(`Team ${team.number}`, M + 52, 118);
  await drawHeaderLogos(ctx, W - M, 66);
  if (kase) {
    ctx.font = '700 22px Poppins, sans-serif';
    const pill = kase.pillar.toUpperCase();
    if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
    const pw = ctx.measureText(pill).width + 44;
    fillRound(ctx, M, 152, pw, 44, 22, pillar.colour + '26', pillar.colour, 2);
    ctx.fillStyle = pillar.colour; ctx.fillText(pill, M + 22, 182);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillStyle = dim; ctx.font = '600 30px Poppins, sans-serif'; ctx.fillText(kase.name, M + pw + 22, 185);
  }
  ctx.fillStyle = '#eaddcf'; ctx.fillRect(M, 228, W - 2 * M, 2);

  const missing = (y, x = M) => { ctx.fillStyle = '#b3a596'; ctx.font = 'italic 400 26px Inter, sans-serif'; ctx.fillText('Not submitted', x, y); };

  // Problem
  spacedLabel(ctx, 'The problem', M, 284, '#c1440e');
  ctx.fillStyle = ink; ctx.font = '700 44px Poppins, sans-serif';
  let y = 340;
  if (team.steps.problem) y = drawText(ctx, team.problem, M, y, W - 2 * M, 56, 2); else { missing(y); y += 56; }

  // Solutions
  y += 24;
  spacedLabel(ctx, '3 solutions', M, y, '#c1440e');
  const gap = 26, boxW = (W - 2 * M - 2 * gap) / 3, boxY = y + 22, boxH = 330;
  [0, 1, 2].forEach((i) => {
    const bx = M + i * (boxW + gap);
    const isBest = team.steps.solutions && (team.best || 0) === i;
    fillRound(ctx, bx, boxY, boxW, boxH, 20, isBest ? '#fbeccd' : skin, isBest ? '#e8b923' : '#ead3bc', isBest ? 4 : 2);
    fillRound(ctx, bx + 24, boxY + 24, 46, 46, 12, isBest ? '#e8b923' : '#e8571a');
    ctx.fillStyle = isBest ? '#1a1410' : '#fff'; ctx.font = '800 26px Poppins, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), bx + 47, boxY + 57); ctx.textAlign = 'left';
    if (isBest) spacedLabel(ctx, 'Best solution', bx + 86, boxY + 56, '#a47d06', 19);
    ctx.fillStyle = ink; ctx.font = '400 25px Inter, sans-serif';
    if (team.steps.solutions) drawText(ctx, team.solutions[i], bx + 24, boxY + 112, boxW - 48, 35, 6);
    else missing(boxY + 112, bx + 24);
  });

  // ROI
  const roiY = boxY + boxH + 28, roiH = 196;
  fillRound(ctx, M, roiY, W - 2 * M, roiH, 20, '#fbeccd', '#e8b923', 2);
  spacedLabel(ctx, 'ROI = money in your till + love', M + 28, roiY + 48, '#a47d06', 21);
  ctx.fillStyle = ink; ctx.font = '400 27px Inter, sans-serif';
  if (team.steps.roi) drawText(ctx, team.roi, M + 28, roiY + 96, W - 2 * M - 56, 37, 3); else missing(roiY + 96, M + 28);

  // Members
  const memY = roiY + roiH + 46;
  spacedLabel(ctx, 'Team members', M, memY, dim, 20);
  ctx.fillStyle = ink; ctx.font = '600 27px Inter, sans-serif';
  const names = members.map((m) => (m.captain ? `${m.name} (captain)` : m.name)).join('   |   ') || 'No members';
  drawText(ctx, names, M, memY + 42, W - 2 * M, 36, 2);

  // Footer
  ctx.fillStyle = '#b3a596'; ctx.font = '400 20px Inter, sans-serif';
  ctx.fillText(`Own It  |  KFC Pakistan, Take the LEAP  |  ${today()}`, M, H - 30);
  ctx.textAlign = 'right'; ctx.fillText(`${number} of ${total}`, W - M, H - 30); ctx.textAlign = 'left';
  return c;
}

async function downloadOwnItCardsPdf(oi) {
  await readyFonts();
  const list = oi.teams.slice().sort((a, b) => a.number - b.number);
  const pages = [];
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const kase = oi.cases.find((x) => x.id === t.caseId);
    const cap = oi.captains[t.number] || { members: [] };
    const members = cap.members.map((m) => ({ name: m.name, captain: m.id === cap.captainId }))
      .sort((a, b) => (b.captain - a.captain) || a.name.localeCompare(b.name));
    pages.push(await drawOwnItCard(t, kase, members, i + 1, list.length));
  }
  saveBlob(pdfFromCanvases(pages), 'Own It - team cards.pdf');
}

/* ============================================================
   OWN IT: SHARED
   ============================================================ */
const PILLAR_META = {
  Loved: { colour: '#ff5a5f', icon: 'heart' },
  Trusted: { colour: '#e8b923', icon: 'shield' },
  Connected: { colour: '#4cc3ff', icon: 'link' },
};
const OWNIT_STEPS = [
  { key: 'problem', label: 'Problem' },
  { key: 'solutions', label: 'Solutions' },
  { key: 'roi', label: 'ROI' },
];
const OWNIT_ROI_LABEL = 'How does your solution enhance ROI = money in your till + love?';
const cleanText = (v) => String(v || '').replace(/\s+/g, ' ').trim();

function PillarBadge({ pillar, size = 13, style }) {
  const m = PILLAR_META[pillar] || { colour: '#888', icon: 'flag' };
  return (
    <span className="lc-badge" style={{ background: `${m.colour}1f`, color: m.colour, borderColor: `${m.colour}55`, ...style }}>
      <Icon name={m.icon} size={size} /> {pillar}
    </span>
  );
}

function StepTicks({ steps = {}, size = 13, gap = 12, dim, nowrap, light }) {
  const onCol = light ? '#178a4c' : '#3ddc84';
  const offRing = light ? 'rgba(42,29,20,.28)' : 'rgba(245,240,232,.25)';
  return (
    <div style={{ display: 'flex', gap, flexWrap: nowrap ? 'nowrap' : 'wrap', whiteSpace: 'nowrap' }}>
      {OWNIT_STEPS.map((s) => {
        const on = !!steps[s.key];
        return (
          <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.35), fontSize: size, fontWeight: 600, color: on ? onCol : (dim || 'rgba(245,240,232,.4)') }}>
            <span style={{
              width: size + 5, height: size + 5, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: on ? (light ? 'rgba(23,138,76,.14)' : 'rgba(61,220,132,.16)') : 'transparent', border: `1.5px solid ${on ? onCol : offRing}`,
            }}>{on && <Icon name="check" size={size - 2} stroke={3} />}</span>
            {s.label}
          </span>
        );
      })}
    </div>
  );
}

// Read-only view of what a team has submitted so far.
function OwnItAnswers({ problem, solutions = [], best, roi, steps = {}, waitingText = 'Not submitted yet', parts = ['problem', 'solutions', 'roi'] }) {
  const label = { fontSize: 11.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 6 };
  const waiting = <div style={{ color: 'var(--ink-faint)', fontStyle: 'italic', fontSize: 14 }}>{waitingText}</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {parts.includes('problem') && <div>
        <div style={label}>Problem</div>
        {steps.problem ? <div style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.4 }}>{problem}</div> : waiting}
      </div>}
      {parts.includes('solutions') && <div>
        <div style={label}>Solutions</div>
        {steps.solutions ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {solutions.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', ...(best === i ? { padding: '8px 10px', margin: '-8px -10px', borderRadius: 10, background: 'rgba(232,185,35,.1)', border: '1px solid rgba(232,185,35,.35)' } : {}) }}>
                <span style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: best === i ? 'var(--gold)' : 'rgba(255,255,255,.08)', color: best === i ? '#1a1410' : 'inherit' }}>{i + 1}</span>
                <span style={{ fontSize: 14.5, lineHeight: 1.45, flex: 1 }}>
                  {best === i && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 3 }}><Icon name="star" size={12} stroke={2.2} /> Best solution</span>}
                  {s}
                </span>
              </div>
            ))}
          </div>
        ) : waiting}
      </div>}
      {parts.includes('roi') && <div>
        <div style={label}>ROI = money in your till + love</div>
        {steps.roi ? <div style={{ fontSize: 14.5, lineHeight: 1.45 }}>{roi}</div> : waiting}
      </div>}
    </div>
  );
}

function CharCount({ value, max }) {
  const n = String(value || '').length;
  return <div style={{ textAlign: 'right', fontSize: 12, marginTop: 5, color: n >= max ? '#ff9a9a' : n > max * 0.85 ? 'var(--gold)' : 'var(--ink-faint)' }}>{n}/{max}</div>;
}

const ownitFieldStyle = { textAlign: 'left', fontSize: 15.5, lineHeight: 1.45, padding: '13px 15px', fontFamily: 'inherit' };

/* ============================================================
   OWN IT: PARTICIPANT (phone)
   ============================================================ */
const EMPTY_DRAFT = { problem: '', solutions: ['', '', ''], best: 0, roi: '' };

function OwnItParticipant({ team, participantId }) {
  const [me, setMe] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState({});      // step -> true while the captain changes a submitted step
  const [pending, setPending] = useState(null);    // step waiting for the server
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [confirmFinal, setConfirmFinal] = useState(false);
  const [showCase, setShowCase] = useState(true);
  const [showTeam, setShowTeam] = useState(false);
  const errTimer = useRef(null);
  const pendingRef = useRef(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const requestMe = useCallback(() => socket.emit('ownit_get_me', { participantId }), [participantId]);

  useEffect(() => {
    requestMe();
    const onMe = (s) => {
      if (!s) return;
      const step = pendingRef.current;
      if (step && s.steps && s.steps[step]) {
        const d = draftRef.current;
        const same = step === 'problem' ? s.problem === cleanText(d.problem)
          : step === 'roi' ? s.roi === cleanText(d.roi)
            : s.solutions.join('|') === d.solutions.map(cleanText).join('|') && s.best === (d.best || 0);
        if (same) {
          pendingRef.current = null; setPending(null);
          setEditing((e) => ({ ...e, [step]: false }));
        }
      }
      setMe(s);
    };
    const onErr = ({ message }) => {
      pendingRef.current = null; setPending(null);
      setError(message);
      clearTimeout(errTimer.current);
      errTimer.current = setTimeout(() => setError(null), 5000);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') requestMe(); };
    socket.on('ownit_me', onMe);
    socket.on('ownit_error', onErr);
    socket.on('connect', requestMe);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      socket.off('ownit_me', onMe);
      socket.off('ownit_error', onErr);
      socket.off('connect', requestMe);
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(errTimer.current);
    };
  }, [requestMe]);

  // Keep the captain's typing on this phone, so a refresh or a dropped
  // connection never loses a half-written answer.
  const draftKey = me && me.gameId ? `ownit_draft_${participantId}_${me.gameId}` : null;
  useEffect(() => {
    if (!draftKey) return;
    let stored = null;
    try { stored = JSON.parse(window.localStorage.getItem(draftKey)); } catch (e) { stored = null; }
    setDraft(stored && Array.isArray(stored.solutions) ? { ...EMPTY_DRAFT, ...stored } : EMPTY_DRAFT);
    setEditing({});
  }, [draftKey]);
  useEffect(() => {
    if (!draftKey) return;
    try { window.localStorage.setItem(draftKey, JSON.stringify(draft)); } catch (e) { /* storage blocked: fine */ }
  }, [draft, draftKey]);

  // Submitted steps that are not being edited always show what the server has
  // (this also fills the boxes for a captain who takes over mid-way).
  useEffect(() => {
    if (!me || !me.inPlay) return;
    setDraft((d) => ({
      problem: me.steps.problem && !editing.problem ? me.problem : d.problem,
      solutions: me.steps.solutions && !editing.solutions ? me.solutions.slice() : d.solutions,
      best: me.steps.solutions && !editing.solutions ? (me.best || 0) : (d.best || 0),
      roi: me.steps.roi && !editing.roi ? me.roi : d.roi,
    }));
  }, [me, editing]);

  // Once the team is done, fold the case away so the confirmation sits on top.
  const isDone = !!(me && me.done);
  useEffect(() => { setShowCase(!isDone); }, [isDone]);

  useEffect(() => {
    if (!pending) return;
    const id = setTimeout(() => { pendingRef.current = null; setPending(null); }, 6000);
    return () => clearTimeout(id);
  }, [pending]);

  function submit(step) {
    const payload = step === 'problem' ? { problem: draft.problem } : step === 'solutions' ? { solutions: draft.solutions, best: draft.best || 0 } : { roi: draft.roi };
    pendingRef.current = step; setPending(step); setError(null);
    socket.emit('ownit_submit', { participantId, step, ...payload });
  }

  const colour = (me && me.colour) || team.colour;
  const teamNumber = (me && me.teamNumber) || team.number;
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, paddingRight: 84 }}>
      <img src="/logo.png" alt="" style={{ height: 32 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="lc-badge" style={{ background: `${colour}22`, color: colour, borderColor: `${colour}55` }}>Team {teamNumber}</span>
        {me && me.isCaptain && (
          <span className="lc-badge" style={{ background: 'rgba(232,185,35,.15)', color: 'var(--gold)', borderColor: 'rgba(232,185,35,.3)' }}>
            <Icon name="captain" size={13} /> Captain
          </span>
        )}
      </div>
    </div>
  );
  const shell = (children) => (
    <div className="lc-root">
      <div className="lc-glow" />
      <ConnectionPill />
      <div className="lc-content" style={{ minHeight: '100dvh', padding: '26px 16px 56px', maxWidth: 480, margin: '0 auto' }}>
        {header}
        {children}
      </div>
    </div>
  );

  if (!me) {
    return shell(
      <div style={{ textAlign: 'center', marginTop: 60 }}>
        <div className="lc-pulse-dot" style={{ margin: '0 auto 20px' }} />
        <p className="lc-sub">Loading your case...</p>
      </div>
    );
  }
  if (!me.inPlay) {
    return shell(
      <div className="lc-card" style={{ padding: 22, textAlign: 'center' }}>
        <p style={{ margin: 0 }}>You're not on a team for Own It. Please find the facilitator.</p>
      </div>
    );
  }

  const c = me.case;
  const pm = PILLAR_META[c.pillar] || {};
  const lim = me.limits || { problem: 80, text: 300 };
  const isCap = me.isCaptain;
  const stepCard = (n, title, enabled, children, extra) => (
    <div className="lc-card" style={{ padding: 18, marginBottom: 14, opacity: enabled ? 1 : 0.5, ...extra }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, background: 'rgba(232,87,26,.18)', color: 'var(--carnelian-bright)' }}>{n}</span>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{title}</span>
      </div>
      {children}
    </div>
  );
  const editBtn = (step) => (
    <button className="lc-btn lc-btn-outline" style={{ padding: '9px 14px', fontSize: 13.5, marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8 }}
      onClick={() => setEditing((e) => ({ ...e, [step]: true }))}><Icon name="edit" size={15} /> Edit</button>
  );
  const cancelBtn = (step) => (
    <button className="lc-btn lc-btn-outline" style={{ flex: '0 0 auto', padding: '12px 16px' }}
      onClick={() => setEditing((e) => ({ ...e, [step]: false }))}>Cancel</button>
  );
  const busy = (step) => pending === step;

  return shell(
    <>
      <h1 className="lc-h1" style={{ fontSize: 24, marginBottom: 6 }}>Own It</h1>
      <p className="lc-faint" style={{ marginTop: 0, marginBottom: 18 }}>Being the most loved, trusted and connected brand.</p>

      {error && (
        <div className="lc-card lc-fadein" style={{ padding: '13px 16px', marginBottom: 14, border: '1px solid #a83232', display: 'flex', gap: 10, alignItems: 'center', color: '#ff9a9a' }}>
          <Icon name="alert" size={18} /><span>{error}</span>
        </div>
      )}

      {/* The case */}
      <div className="lc-card" style={{ padding: 18, marginBottom: 14, border: `1px solid ${pm.colour}55` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <PillarBadge pillar={c.pillar} />
          <span className="lc-faint" style={{ margin: 0, fontSize: 12.5 }}>{c.pillarDetail}</span>
        </div>
        <button onClick={() => setShowCase((s) => !s)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: 'var(--ink)', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
          <span className="lc-h2" style={{ margin: 0, fontSize: 21, flex: 1 }}>{c.name}</span>
          <Icon name="chevron" size={18} style={{ transform: showCase ? 'rotate(180deg)' : 'none', transition: 'transform .2s', opacity: 0.6 }} />
        </button>
        {showCase && (
          <div className="lc-fadein">
            <p style={{ fontSize: 15.5, lineHeight: 1.55, margin: '12px 0 12px' }}>{c.text}</p>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-dim)', lineHeight: 1.45 }}><b style={{ color: pm.colour }}>Tests:</b> {c.tests}</p>
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="lc-card" style={{ padding: '14px 18px', marginBottom: 14 }}>
        <StepTicks steps={me.steps} size={13} gap={16} dim="var(--ink-faint)" />
      </div>

      {me.done ? (
        <>
          <div className="lc-card lc-pop" style={{ padding: 24, marginBottom: 14, textAlign: 'center', border: '1px solid rgba(61,220,132,.45)' }}>
            <div style={{ width: 54, height: 54, borderRadius: '50%', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(61,220,132,.15)', color: '#3ddc84' }}>
              <Icon name="check" size={30} stroke={2.6} />
            </div>
            <h2 className="lc-h2" style={{ margin: '0 0 6px' }}>Submitted</h2>
            <p className="lc-sub" style={{ margin: 0 }}>Your team's answers are locked in and on the big screen. Well done.</p>
          </div>
          <div className="lc-card" style={{ padding: 18, marginBottom: 14 }}>
            <OwnItAnswers problem={me.problem} solutions={me.solutions} best={me.best} roi={me.roi} steps={me.steps} />
          </div>
        </>
      ) : !isCap ? (
        <>
          <div className="lc-card" style={{ padding: 18, marginBottom: 14 }}>
            <SectionTitle icon="users">Brainstorm with your team</SectionTitle>
            <p style={{ margin: 0, color: 'var(--ink-dim)', lineHeight: 1.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Icon name="captain" size={16} style={{ marginTop: 3, color: 'var(--gold)' }} />
              <span>{me.captainName || 'Your captain'} submits for your team: the problem in one line, 3 solutions, then how they enhance ROI.{me.captainOnline ? '' : ' If your captain stays offline, the role moves to someone else automatically.'}</span>
            </p>
          </div>
          <div className="lc-card" style={{ padding: 18, marginBottom: 14 }}>
            <OwnItAnswers problem={me.problem} solutions={me.solutions} best={me.best} roi={me.roi} steps={me.steps} waitingText="Waiting for your captain" />
          </div>
        </>
      ) : (
        <>
          {/* Step 1 */}
          {stepCard(1, 'Problem statement', true, (
            me.steps.problem && !editing.problem ? (
              <>
                <div style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.4 }}>{me.problem}</div>
                {editBtn('problem')}
              </>
            ) : (
              <>
                <p style={{ margin: '0 0 10px', color: 'var(--ink-dim)' }}>State the core problem in one line.</p>
                <input className="lc-input" value={draft.problem} maxLength={lim.problem} placeholder={c.placeholder} style={ownitFieldStyle}
                  onChange={(e) => setDraft((d) => ({ ...d, problem: e.target.value.replace(/[\r\n]+/g, ' ') }))} />
                <CharCount value={draft.problem} max={lim.problem} />
                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                  {editing.problem && cancelBtn('problem')}
                  <button className="lc-btn lc-btn-primary" style={{ flex: 1 }} disabled={!cleanText(draft.problem) || busy('problem')} onClick={() => submit('problem')}>
                    {busy('problem') ? 'Saving...' : editing.problem ? 'Save problem' : 'Submit problem'}
                  </button>
                </div>
              </>
            )
          ))}

          {/* Step 2 */}
          {stepCard(2, 'Three solutions', me.steps.problem, (
            !me.steps.problem ? (
              <p style={{ margin: 0, color: 'var(--ink-faint)' }}>Submit the problem statement first.</p>
            ) : me.steps.solutions && !editing.solutions ? (
              <>
                <OwnItAnswers solutions={me.solutions} best={me.best} steps={{ solutions: true }} parts={['solutions']} />
                {editBtn('solutions')}
              </>
            ) : (
              <>
                <p style={{ margin: '0 0 12px', color: 'var(--ink-dim)', fontSize: 14 }}>Write 3 solutions, then tap the star on the one your team thinks is best.</p>
                {[0, 1, 2].map((i) => {
                  const isBest = (draft.best || 0) === i;
                  return (
                    <div key={i} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-dim)' }}>Solution {i + 1}</span>
                        <button type="button" onClick={() => setDraft((d) => ({ ...d, best: i }))} style={{
                          marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                          border: `1px solid ${isBest ? 'var(--gold)' : 'rgba(255,255,255,.15)'}`, background: isBest ? 'rgba(232,185,35,.18)' : 'transparent', color: isBest ? 'var(--gold)' : 'var(--ink-faint)',
                        }}><Icon name="star" size={13} stroke={2.2} /> {isBest ? 'Best solution' : 'Mark as best'}</button>
                      </div>
                      <textarea className="lc-input" rows={3} value={draft.solutions[i]} maxLength={lim.text} style={{ ...ownitFieldStyle, resize: 'vertical', ...(isBest ? { borderColor: 'rgba(232,185,35,.55)' } : {}) }}
                        onChange={(e) => { const v = e.target.value; setDraft((d) => { const s = d.solutions.slice(); s[i] = v; return { ...d, solutions: s }; }); }} />
                      <CharCount value={draft.solutions[i]} max={lim.text} />
                    </div>
                  );
                })}
                <div style={{ display: 'flex', gap: 10 }}>
                  {editing.solutions && cancelBtn('solutions')}
                  <button className="lc-btn lc-btn-primary" style={{ flex: 1 }} disabled={draft.solutions.some((s) => !cleanText(s)) || busy('solutions')} onClick={() => submit('solutions')}>
                    {busy('solutions') ? 'Saving...' : editing.solutions ? 'Save solutions' : 'Submit solutions'}
                  </button>
                </div>
              </>
            )
          ))}

          {/* Step 3 */}
          {stepCard(3, 'ROI', me.steps.problem && me.steps.solutions, (
            !(me.steps.problem && me.steps.solutions) ? (
              <p style={{ margin: 0, color: 'var(--ink-faint)' }}>Submit the 3 solutions first.</p>
            ) : (
              <>
                <p style={{ margin: '0 0 10px', fontWeight: 600, lineHeight: 1.45 }}>{me.roiQuestion || OWNIT_ROI_LABEL}</p>
                <textarea className="lc-input" rows={4} value={draft.roi} maxLength={lim.text} style={{ ...ownitFieldStyle, resize: 'vertical' }}
                  onChange={(e) => setDraft((d) => ({ ...d, roi: e.target.value }))} />
                <CharCount value={draft.roi} max={lim.text} />
                <button className="lc-btn lc-btn-gold" style={{ width: '100%', marginTop: 10 }} disabled={!cleanText(draft.roi) || busy('roi')} onClick={() => setConfirmFinal(true)}>
                  {busy('roi') ? 'Submitting...' : 'Submit final answer'}
                </button>
                <p className="lc-faint" style={{ marginBottom: 0 }}>You can still change the problem or solutions above until you submit this. After that, your answers lock.</p>
              </>
            )
          ), { border: me.steps.solutions ? '1px solid rgba(232,185,35,.35)' : undefined })}
        </>
      )}

      {/* Team */}
      <div className="lc-card" style={{ padding: '14px 18px' }}>
        <button onClick={() => setShowTeam((s) => !s)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: 'var(--ink)', cursor: 'pointer', padding: 0, fontSize: 14, fontWeight: 600 }}>
          <Icon name="users" size={16} style={{ color: 'var(--gold)' }} /> My team
          <Icon name="chevron" size={16} style={{ marginLeft: 'auto', transform: showTeam ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
        </button>
        {showTeam && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
            {(me.members || []).map((m, i) => (
              <div key={i} className="lc-teammate" style={{ animationDelay: `${i * 40}ms` }}>{m.name}{m.isMe ? ' (you)' : ''}{m.isCaptain ? '  (captain)' : ''}</div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmFinal}
        title="Submit your final answer?"
        message="Once this is in, your team's problem, solutions and ROI answer lock and appear as complete on the big screen."
        confirmLabel="Submit"
        onCancel={() => setConfirmFinal(false)}
        onConfirm={() => { setConfirmFinal(false); submit('roi'); }}
      />
    </>
  );
}

/* ============================================================
   OWN IT: PROJECTOR
   ============================================================ */
function LeapBrand({ height = 34 }) {
  const [img, setImg] = useState(true);
  if (img) return <img src="/leap-logo.png" alt="Take the LEAP" style={{ height }} onError={() => setImg(false)} />;
  return (
    <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 15, letterSpacing: '.02em', whiteSpace: 'nowrap' }}>
      Take the <span style={{ color: '#e8571a' }}>LEAP</span>
    </span>
  );
}

function OwnItSpotlight({ team, kase, onClose }) {
  const pm = PILLAR_META[kase && kase.pillar] || {};
  return (
    <div className="lc-fadein" onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 30, background: '#07080b', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4vh 5vw',
    }}>
      <div style={{ width: 'min(1500px, 100%)', maxHeight: '100%', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: '3.2vh', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 'clamp(26px,2.6vw,46px)', color: team.colour }}>
            <span style={{ width: 18, height: 18, borderRadius: '50%', background: team.colour, boxShadow: `0 0 18px ${team.colour}` }} />Team {team.number}
          </span>
          {kase && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 'clamp(16px,1.3vw,24px)', color: pm.colour, fontWeight: 700 }}>
              <Icon name={pm.icon} size={24} /> {kase.pillar} <span style={{ color: 'rgba(245,240,232,.6)', fontWeight: 500 }}>&middot; {kase.name}</span>
            </span>
          )}
          <span style={{ marginLeft: 'auto', color: 'rgba(245,240,232,.4)', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 }}><Icon name="x" size={18} /> Close</span>
        </div>

        <div style={{ fontSize: 'clamp(12px,.9vw,16px)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(232,185,35,.9)', fontWeight: 700, marginBottom: 10 }}>The problem</div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 'clamp(26px,2.7vw,52px)', lineHeight: 1.2, marginBottom: '4vh' }}>
          {team.steps.problem ? team.problem : <span style={{ opacity: 0.4 }}>Not submitted yet</span>}
        </div>

        <div style={{ fontSize: 'clamp(12px,.9vw,16px)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(232,185,35,.9)', fontWeight: 700, marginBottom: 12 }}>3 solutions</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: '4vh' }}>
          {[0, 1, 2].map((i) => {
            const isBest = team.steps.solutions && (team.best || 0) === i;
            return (
            <div key={i} style={{ padding: '22px 22px', borderRadius: 18, background: isBest ? 'rgba(232,185,35,.09)' : 'rgba(255,255,255,.04)', border: `${isBest ? 2 : 1}px solid ${isBest ? 'rgba(232,185,35,.7)' : 'rgba(255,255,255,.08)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 20, background: isBest ? '#e8b923' : 'rgba(232,87,26,.2)', color: isBest ? '#1a1410' : '#e8571a' }}>{i + 1}</div>
                {isBest && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'clamp(11px,.8vw,15px)', fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#e8b923' }}><Icon name="star" size={16} stroke={2.2} /> Best solution</span>}
              </div>
              <div style={{ fontSize: 'clamp(16px,1.35vw,25px)', lineHeight: 1.4 }}>
                {team.steps.solutions ? team.solutions[i] : <span style={{ opacity: 0.4 }}>Not submitted yet</span>}
              </div>
            </div>
            );
          })}
        </div>

        <div style={{ padding: '24px 26px', borderRadius: 18, background: 'rgba(232,185,35,.07)', border: '1px solid rgba(232,185,35,.3)' }}>
          <div style={{ fontSize: 'clamp(12px,.9vw,16px)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(232,185,35,.9)', fontWeight: 700, marginBottom: 10 }}>ROI = money in your till + love</div>
          <div style={{ fontSize: 'clamp(17px,1.45vw,27px)', lineHeight: 1.45 }}>
            {team.steps.roi ? team.roi : <span style={{ opacity: 0.4 }}>Not submitted yet</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

const cardLabel = (colour) => ({ fontSize: 'clamp(9px,.55vw,11px)', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: colour, marginBottom: 3 });

function OwnItProjector({ board }) {
  const [qrOpen, setQrOpen] = useState(false);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [localOpen, setLocalOpen] = useState(null);
  const [dismissed, setDismissed] = useState(null);
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const spotlight = board ? board.spotlight : null;
  useEffect(() => { setDismissed(null); setLocalOpen(null); }, [spotlight]);
  const openNumber = localOpen != null ? localOpen : (spotlight != null && spotlight !== dismissed ? spotlight : null);
  useEffect(() => {
    if (openNumber == null) return;
    const onKey = (e) => { if (e.key === 'Escape') { setLocalOpen(null); setDismissed(spotlight); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openNumber, spotlight]);

  const pad = 26, labelW = Math.min(250, Math.max(190, size.w * 0.13)), gap = 12;
  const cases = board ? board.cases : [];
  const rows = cases.map((c) => ({ c, teams: board.teams.filter((t) => t.caseId === c.id) }));
  const maxCols = Math.max(1, ...rows.map((r) => r.teams.length));
  const cardW = Math.min(250, (size.w - pad * 2 - labelW - 24 - gap * (maxCols - 1)) / maxCols);
  const rowH = (size.h - TOP_BAR_HEIGHT - pad * 2 - gap * 2) / 3;
  const openTeam = openNumber != null && board ? board.teams.find((t) => t.number === openNumber) : null;
  const openCase = openTeam ? cases.find((c) => c.id === openTeam.caseId) : null;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: 'radial-gradient(ellipse at top, #1a1410 0%, #07080b 60%)', color: '#f5f0e8', fontFamily: "'Inter',sans-serif" }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: TOP_BAR_HEIGHT, zIndex: 15,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px',
        background: '#0d0e12', borderBottom: '2px solid #e8571a',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <img src="/logo.png" alt="Carnelian" style={{ height: 38 }} />
          <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16 }}>Own It</span>
        </div>
        <div style={{ flex: 1, textAlign: 'center', fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap' }}>
          <span style={{ color: '#e8571a' }}>{board ? board.completeCount : 0}</span>
          <span style={{ color: 'rgba(245,240,232,.55)', marginLeft: 6 }}>of {board ? board.total : 20} teams complete</span>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 18 }}>
          <LeapBrand />
          <QrButton open={qrOpen} onClick={() => setQrOpen((o) => !o)} />
        </div>
      </div>
      <QrPanel open={qrOpen} onClose={() => setQrOpen(false)} joinUrl={JOIN_URL} />

      <div style={{ position: 'absolute', top: TOP_BAR_HEIGHT + pad, left: pad, right: pad, bottom: pad, display: 'flex', flexDirection: 'column', gap }}>
        {!board && <div style={{ margin: 'auto', color: 'rgba(245,240,232,.5)' }}>Loading...</div>}
        {rows.map(({ c, teams: list }) => {
          const pm = PILLAR_META[c.pillar] || {};
          const done = list.filter((t) => t.done).length;
          return (
            <div key={c.id} style={{ height: rowH, display: 'flex', gap: 24, alignItems: 'stretch', padding: '12px 12px 12px 0', borderRadius: 18, background: `linear-gradient(90deg, ${pm.colour}14, rgba(255,255,255,.015) 40%)`, border: '1px solid rgba(255,255,255,.05)' }}>
              <div style={{ width: labelW, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: 20, borderLeft: `4px solid ${pm.colour}`, borderRadius: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: pm.colour, fontWeight: 800, fontSize: 'clamp(13px,1vw,18px)', letterSpacing: '.12em', textTransform: 'uppercase' }}>
                  <Icon name={pm.icon} size={22} stroke={2} />{c.pillar}
                </div>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 'clamp(16px,1.35vw,25px)', lineHeight: 1.2, margin: '8px 0 6px' }}>{c.name}</div>
                <div style={{ fontSize: 13, color: 'rgba(245,240,232,.5)' }}>{done} of {list.length} complete</div>
              </div>
              <div style={{ flex: 1, display: 'flex', gap, alignItems: 'stretch', minWidth: 0 }}>
                {list.map((t) => {
                  const started = t.steps.problem;
                  return (
                    <button key={t.number} onClick={() => setLocalOpen(t.number)} className={t.done ? 'lc-card-done' : ''} style={{
                      width: cardW, flexShrink: 0, textAlign: 'left', cursor: 'pointer', color: '#2a1d14', font: 'inherit',
                      padding: '12px 14px', borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 9,
                      background: started ? '#f7e6d3' : '#efe2d4',
                      border: `2px solid ${t.done ? '#2ecc71' : 'rgba(42,29,20,.14)'}`,
                      opacity: started ? 1 : 0.55, transition: 'opacity .4s, border-color .4s, background .4s',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 'clamp(10px,.62vw,12px)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(42,29,20,.6)' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.colour, boxShadow: '0 0 0 2px rgba(42,29,20,.12)' }} />Team {t.number}
                        {t.done && <span style={{ marginLeft: 'auto', color: '#178a4c', display: 'inline-flex', alignItems: 'center', gap: 4, letterSpacing: '.06em' }}><Icon name="check" size={14} stroke={3} />Done</span>}
                      </div>
                      {!started ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontStyle: 'italic', fontSize: 'clamp(12px,.85vw,15px)', color: 'rgba(42,29,20,.55)' }}>Brainstorming</div>
                      ) : (
                        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
                          <div>
                            <div style={cardLabel('#b2400f')}>Problem</div>
                            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 'clamp(12.5px,.9vw,16px)', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.problem}</div>
                          </div>
                          <div style={{ minHeight: 0, flex: 1, overflow: 'hidden', paddingTop: 8, borderTop: '1px solid rgba(42,29,20,.1)' }}>
                            <div style={{ ...cardLabel('#8a6a00'), display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="star" size={11} stroke={2.4} /> Best solution</div>
                            {t.steps.solutions
                              ? <div style={{ fontSize: 'clamp(11.5px,.8vw,14.5px)', lineHeight: 1.38, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.solutions[t.best || 0]}</div>
                              : <div style={{ fontSize: 'clamp(11.5px,.8vw,14px)', fontStyle: 'italic', color: 'rgba(42,29,20,.5)' }}>Writing solutions...</div>}
                          </div>
                        </div>
                      )}
                      <StepTicks steps={t.steps} size={cardW < 215 ? 10 : 11} gap={cardW < 215 ? 5 : 7} nowrap light dim="rgba(42,29,20,.45)" />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {openTeam && <OwnItSpotlight team={openTeam} kase={openCase} onClose={() => { setLocalOpen(null); setDismissed(spotlight); }} />}
    </div>
  );
}

/* ============================================================
   OWN IT: FACILITATOR
   ============================================================ */
function OwnItFacilitatorPanel({ oi, onConfirm }) {
  const [open, setOpen] = useState({});
  const [busy, setBusy] = useState(false);
  if (!oi) return <div className="lc-card" style={{ padding: 24 }}><p className="lc-faint" style={{ margin: 0 }}>Loading Own It...</p></div>;
  const count = (k) => oi.teams.filter((t) => t.steps[k]).length;
  const allDone = oi.total > 0 && oi.completeCount === oi.total;
  async function downloadCards() {
    setBusy(true);
    try { await downloadOwnItCardsPdf(oi); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="lc-stats-row" style={{ display: 'flex', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
        <div className="lc-stat-card"><div className="lc-stat-label">Teams complete</div><div className="lc-stat-value">{oi.completeCount}<span style={{ color: 'var(--ink-faint)', fontSize: 20 }}>/{oi.total}</span></div>
          <div className="lc-bar-track" style={{ marginTop: 10 }}><div className="lc-bar-fill" style={{ width: `${oi.total ? (oi.completeCount / oi.total) * 100 : 0}%` }} /></div></div>
        <div className="lc-stat-card"><div className="lc-stat-label">Problems in</div><div className="lc-stat-value">{count('problem')}</div></div>
        <div className="lc-stat-card"><div className="lc-stat-label">Solutions in</div><div className="lc-stat-value">{count('solutions')}</div></div>
        <div className="lc-stat-card"><div className="lc-stat-label">ROI in</div><div className="lc-stat-value">{count('roi')}</div></div>
      </div>

      <div className="lc-card" style={{ padding: 22, marginBottom: 18 }}>
        <div className="lc-btn-row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className={`lc-btn ${allDone ? 'lc-btn-gold' : 'lc-btn-outline'}`} style={{ flex: '1 1 220px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} disabled={busy}
            onClick={() => (allDone ? downloadCards() : onConfirm({
              title: 'Not every team is complete',
              message: `${oi.completeCount} of ${oi.total} teams are complete. Download the cards anyway? Steps a team has not submitted show as "Not submitted".`,
              confirmLabel: 'Download anyway',
              onConfirm: downloadCards,
            }))}>
            <Icon name="download" size={18} /> {busy ? 'Preparing PDF...' : 'Download all cards'}
          </button>
          {oi.spotlight != null && (
            <button className="lc-btn lc-btn-gold" style={{ flex: '1 1 220px' }} onClick={() => socket.emit('facilitator_ownit_spotlight', { teamNumber: null })}>
              Close Team {oi.spotlight} on projector
            </button>
          )}
          <button className="lc-btn lc-btn-outline" style={{ flex: '1 1 180px' }} onClick={() => onConfirm({
            title: 'Restart Own It?',
            message: 'Cases are drawn again at random and every team\'s answers are cleared. Teams and captains stay as they are.',
            confirmLabel: 'Restart Own It', danger: true,
            onConfirm: () => socket.emit('facilitator_restart_ownit'),
          })}>Restart Own It</button>
        </div>
        <p className="lc-faint" style={{ marginBottom: 0 }}>
          Key: ticks show what each team has submitted (Problem, Solutions, ROI). <b>Download all cards</b> saves one PDF page per team with its answers and member names. A team is complete once its ROI answer is in, and its answers lock. <b>Reopen</b> unlocks a complete team so its captain can change answers. <b>Show on projector</b> opens that team full screen for the debrief. Green dot online, grey offline. Offline captains are replaced automatically after about 30 seconds.
        </p>
      </div>

      {oi.cases.map((c) => {
        const list = oi.teams.filter((t) => t.caseId === c.id);
        return (
          <div key={c.id} className="lc-card" style={{ padding: 22, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <PillarBadge pillar={c.pillar} />
              <span style={{ fontWeight: 700, fontSize: 17 }}>{c.name}</span>
              <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--ink-dim)' }}>{list.filter((t) => t.done).length} of {list.length} complete</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 12 }}>
              {list.map((t) => {
                const cap = oi.captains[t.number] || { members: [] };
                const status = t.done ? 'Complete' : t.steps.solutions ? 'Writing ROI' : t.steps.problem ? 'Writing solutions' : 'Brainstorming';
                const isOpen = !!open[t.number];
                const onAir = oi.spotlight === t.number;
                return (
                  <div key={t.number} style={{ padding: 14, borderRadius: 14, background: 'rgba(255,255,255,.03)', border: `1px solid ${onAir ? 'var(--gold)' : t.done ? 'rgba(61,220,132,.45)' : t.colour + '33'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <TeamTag number={t.number} colour={t.colour} />
                      <span style={{ marginLeft: 'auto', fontSize: 12.5, color: t.done ? '#3ddc84' : 'var(--ink-dim)' }}>{status}</span>
                    </div>
                    <div style={{ marginBottom: 10 }}><StepTicks steps={t.steps} size={12} gap={10} dim="var(--ink-faint)" /></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13 }}>
                      <Icon name="captain" size={14} style={{ color: 'var(--gold)' }} />
                      <select className="lc-select" value={cap.captainId || ''} style={{ padding: '7px 10px', fontSize: 13, flex: 1 }}
                        onChange={(e) => socket.emit('facilitator_ownit_set_captain', { teamNumber: t.number, participantId: e.target.value })}>
                        {cap.members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.online ? '' : ' (offline)'}</option>)}
                      </select>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: cap.captainOnline ? '#3ddc84' : '#666' }} />
                    </div>
                    {t.steps.problem && <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.4, marginBottom: 8 }}>{t.problem}</div>}
                    {(t.steps.solutions || t.steps.roi) && (
                      <button onClick={() => setOpen((o) => ({ ...o, [t.number]: !o[t.number] }))} style={{ background: 'none', border: 'none', color: 'var(--ink-dim)', cursor: 'pointer', padding: 0, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        {isOpen ? 'Hide answers' : 'Show answers'}
                        <Icon name="chevron" size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                      </button>
                    )}
                    {isOpen && <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,.03)', marginBottom: 10 }}><OwnItAnswers problem={t.problem} solutions={t.solutions} best={t.best} roi={t.roi} steps={t.steps} parts={['solutions', 'roi']} waitingText="Not yet" /></div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className={`lc-btn ${onAir ? 'lc-btn-gold' : 'lc-btn-outline'}`} style={{ flex: 1, padding: '7px', fontSize: 12.5 }}
                        onClick={() => socket.emit('facilitator_ownit_spotlight', { teamNumber: onAir ? null : t.number })}>
                        {onAir ? 'Close on projector' : 'Show on projector'}
                      </button>
                      {t.done && (
                        <button className="lc-btn lc-btn-outline" style={{ flex: '0 0 auto', padding: '7px 12px', fontSize: 12.5 }} onClick={() => onConfirm({
                          title: `Reopen Team ${t.number}?`,
                          message: 'Their captain can change the problem, solutions and ROI answer again. The team shows as not complete until they submit the ROI answer again.',
                          confirmLabel: 'Reopen',
                          onConfirm: () => socket.emit('facilitator_ownit_reopen', { teamNumber: t.number }),
                        })}>Reopen</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ============================================================
   PROJECTOR VIEW
   ============================================================ */
const QR_PANEL_WIDTH = 300;

function QrIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
    </svg>
  );
}

// The QR button on every projector top bar, so anyone who got logged out can
// scan again in any activity.
function QrButton({ open, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999,
      border: `1px solid ${open ? '#e8571a' : 'rgba(255,255,255,.2)'}`,
      background: open ? 'rgba(232,87,26,.18)' : 'rgba(255,255,255,.04)',
      color: '#f5f0e8', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Inter',sans-serif",
    }}>
      <QrIcon size={15} /> {open ? 'Hide QR' : 'QR code'}
    </button>
  );
}
const JOIN_URL = `${window.location.origin}/`;

// Docked to the right edge under the top bar, not centred, so the room can
// still watch the nodes arrive while late joiners scan.
function QrPanel({ open, onClose, joinUrl }) {
  if (!open) return null;
  return (
    <div className="lc-fadein" style={{
      position: 'absolute', top: TOP_BAR_HEIGHT + 2, right: 0, width: QR_PANEL_WIDTH, zIndex: 40,
      padding: '22px 22px 20px', background: 'rgba(13,14,18,.94)', borderLeft: '1px solid rgba(232,87,26,.4)',
      borderBottom: '1px solid rgba(232,87,26,.4)', borderBottomLeftRadius: 18,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      fontFamily: "'Inter',sans-serif", backdropFilter: 'blur(10px)',
    }}>
      <button onClick={onClose} aria-label="Close QR code" style={{
        position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: '50%',
        border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.05)', color: '#f5f0e8',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <div style={{ fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(232,185,35,.85)', fontWeight: 600 }}>Scan to join</div>
      <div style={{ padding: 14, borderRadius: 16, background: '#fdfaf5', boxShadow: '0 0 40px rgba(232,185,35,.2)' }}>
        <QRCodeSVG value={joinUrl} size={QR_PANEL_WIDTH - 72} bgColor="#fdfaf5" fgColor="#14100c" level="M" />
      </div>
      <p style={{ margin: 0, fontSize: 13, color: 'rgba(245,240,232,.6)', textAlign: 'center', wordBreak: 'break-all' }}>
        {joinUrl.replace(/^https?:\/\//, '')}
      </p>
    </div>
  );
}

const TOP_BAR_HEIGHT = 60;

function pathRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Shrinks text with an ellipsis until it fits maxWidth, protects the block
// layout from full names (first + middle + last) overflowing the card.
function truncateToWidth(ctx, text, maxWidth) {
  if (!text) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

// Grid cell for team block i: 5 columns, as many rows as the team count
// needs (10 teams = 2 rows, 20 teams = 4 rows), offset below the top bar.
function teamBlockRect(i, w, h, count = 10) {
  const cols = 5;
  const rows = Math.max(1, Math.ceil(count / cols));
  const topOffset = TOP_BAR_HEIGHT + 14;
  const margin = Math.max(16, w * 0.012);
  const gutter = rows > 2 ? 10 : 14;
  const cellW = (w - margin * 2 - gutter * (cols - 1)) / cols;
  const cellH = (h - topOffset - margin - gutter * (rows - 1)) / rows;
  const col = i % cols, row = Math.floor(i / cols);
  return { x: margin + col * (cellW + gutter), y: topOffset + row * (cellH + gutter), w: cellW, h: cellH };
}

function ProjectorView() {
  const canvasRef = useRef(null);
  const simRef = useRef(null);
  const nodesRef = useRef([]);
  const persistentEdgesRef = useRef([]);
  const flashEdgesRef = useRef([]);
  const starsRef = useRef([]);
  const teamsRef = useRef([]);
  const stateRef = useRef('idle');
  const rafRef = useRef(null);
  const lastFrameTsRef = useRef(null);
  const dims = useRef({ w: window.innerWidth, h: window.innerHeight });

  const [activity, setActivity] = useState('constellation');
  const activityRef = useRef('constellation');
  const [sessionState, setSessionState] = useState('idle');
  const [joinedCount, setJoinedCount] = useState(0);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [teams, setTeams] = useState([]);
  const [showFormingBanner, setShowFormingBanner] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const qrOpenRef = useRef(false);
  useEffect(() => { qrOpenRef.current = qrOpen; }, [qrOpen]);

  const [board, setBoard] = useState(null);
  const [ownitBoard, setOwnitBoard] = useState(null);

  const joinUrl = `${window.location.origin}/`;

  useEffect(() => { stateRef.current = sessionState; }, [sessionState]);
  useEffect(() => { teamsRef.current = teams; }, [teams]);
  useEffect(() => { activityRef.current = activity; }, [activity]);

  const ensureNode = useCallback((id, name) => {
    let node = nodesRef.current.find((n) => n.id === id);
    if (!node) {
      const a = Math.random() * Math.PI * 2;
      const r = 80 + Math.random() * 160;
      node = {
        id, name,
        x: dims.current.w / 2 + Math.cos(a) * r, y: dims.current.h / 2 + Math.sin(a) * r,
        vx: 0, vy: 0, colour: '#e8571a', radius: 6.5, answerVector: {}, pulseUntil: 0, bornAt: Date.now(),
      };
      nodesRef.current.push(node);
      if (simRef.current) { simRef.current.nodes(nodesRef.current); }
    } else { node.name = name; }
    return node;
  }, []);

  function recomputePersistentEdges() {
    const nodes = nodesRef.current;
    const edges = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let shared = 0;
        for (const q in a.answerVector) if (b.answerVector[q] !== undefined && b.answerVector[q] === a.answerVector[q]) shared++;
        if (shared >= 3) edges.push({ a: a.id, b: b.id, w: shared });
      }
    }
    persistentEdgesRef.current = edges;
  }

  function affinityForce(alpha) {
    const byKey = {};
    nodesRef.current.forEach((n) => {
      Object.entries(n.answerVector).forEach(([q, opt]) => {
        const key = `${q}-${opt}`;
        (byKey[key] = byKey[key] || []).push(n);
      });
    });
    Object.values(byKey).forEach((group) => {
      if (group.length < 2) return;
      const cx = d3.mean(group, (n) => n.x), cy = d3.mean(group, (n) => n.y);
      group.forEach((n) => { n.vx += (cx - n.x) * alpha * 0.02; n.vy += (cy - n.y) * alpha * 0.02; });
    });
  }

  function teamForce(alpha) {
    // Pull is much stronger once teams are formed, so the tight per-team
    // cluster wins decisively against the global repulsion below.
    const pull = stateRef.current === 'teams_formed' ? 0.24 : 0.09;
    nodesRef.current.forEach((n) => {
      if (n.teamTarget) { n.vx += (n.teamTarget.x - n.x) * alpha * pull; n.vy += (n.teamTarget.y - n.y) * alpha * pull; }
    });
  }

  // Global repulsion is tuned for nodes roaming the full screen, once
  // teams are packed into small boxes it overpowers the pull to center
  // and shoves nodes toward the block edges. Weaken it for that phase.
  function updatePhysicsForPhase() {
    if (!simRef.current) return;
    if (stateRef.current === 'teams_formed') {
      simRef.current.force('charge', d3.forceManyBody().strength(-3));
      simRef.current.force('collide', d3.forceCollide().radius(7));
    } else {
      simRef.current.force('charge', d3.forceManyBody().strength(-42));
      simRef.current.force('collide', d3.forceCollide().radius(14));
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    function seedStars() {
      const { w, h } = dims.current;
      starsRef.current = Array.from({ length: 180 }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.3 + 0.3, tw: Math.random() * Math.PI * 2, sp: 0.4 + Math.random() * 1.2 }));
    }
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      dims.current = { w: window.innerWidth, h: window.innerHeight };
      canvas.width = dims.current.w * dpr; canvas.height = dims.current.h * dpr;
      canvas.style.width = dims.current.w + 'px'; canvas.style.height = dims.current.h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedStars();
      if (simRef.current) simRef.current.force('center', d3.forceCenter(dims.current.w / 2, dims.current.h / 2));
      if (stateRef.current === 'teams_formed' && teamsRef.current.length) applyTeamPositions(teamsRef.current);
    }
    resize();
    window.addEventListener('resize', resize);

    const sim = d3.forceSimulation(nodesRef.current)
      .force('charge', d3.forceManyBody().strength(-42))
      .force('center', d3.forceCenter(dims.current.w / 2, dims.current.h / 2))
      .force('collide', d3.forceCollide().radius(14))
      .alphaDecay(0.018).alphaMin(0.002)
      .on('tick', () => { affinityForce(sim.alpha()); teamForce(sim.alpha()); });
    simRef.current = sim;
    // Node positions are driven directly in the draw loop below (wander during
    // the gathering phase, eased pull to team targets after formation). The d3
    // simulation is kept only so existing references stay valid, running it
    // would fight both: its charge force pushes nodes to the screen edges, and
    // its decaying alpha freezes clusters mid-flight before they reach a box.
    sim.stop();

    function drawTeamBlocks(w, h, now) {
      const teamCount = teamsRef.current.length;
      const compact = teamCount > 10;
      teamsRef.current.forEach((t, i) => {
        const rect = teamBlockRect(i, w, h, teamCount);

        ctx.save();
        pathRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, compact ? 12 : 16);
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = t.colour + '77';
        ctx.shadowColor = t.colour;
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.font = compact ? "700 12px Poppins, system-ui, sans-serif" : "700 15px Poppins, system-ui, sans-serif";
        ctx.fillStyle = t.colour;
        ctx.textAlign = 'left';
        ctx.fillText(`TEAM ${t.number}`, rect.x + 12, rect.y + (compact ? 18 : 24));
        ctx.font = "500 11px Inter, system-ui, sans-serif";
        ctx.fillStyle = 'rgba(245,240,232,.4)';
        ctx.textAlign = 'right';
        ctx.fillText(`${t.memberIds.length}`, rect.x + rect.w - 12, rect.y + (compact ? 18 : 24));
        ctx.restore();

        const memberNodes = t.memberIds.map((id) => nodesRef.current.find((n) => n.id === id)).filter(Boolean);

        ctx.lineWidth = 0.7;
        ctx.strokeStyle = t.colour + '38';
        for (let a = 0; a < memberNodes.length; a++) {
          for (let b = a + 1; b < memberNodes.length; b++) {
            ctx.beginPath();
            ctx.moveTo(memberNodes[a].x, memberNodes[a].y);
            ctx.lineTo(memberNodes[b].x, memberNodes[b].y);
            ctx.stroke();
          }
        }

        memberNodes.forEach((n) => {
          const entry = Math.min(1, (now - n.bornAt) / 600);
          const r = n.radius * entry;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.shadowColor = n.colour; ctx.shadowBlur = 9;
          ctx.fillStyle = n.colour; ctx.fill(); ctx.shadowBlur = 0;

          ctx.font = compact ? "500 9px Inter, system-ui, sans-serif" : "500 10px Inter, system-ui, sans-serif";
          ctx.fillStyle = `rgba(245,240,232,${0.7 * entry})`;
          const boxCenterX = rect.x + rect.w / 2;
          const pad = 8;
          if (n.x < boxCenterX) {
            ctx.textAlign = 'left';
            const maxWidth = (rect.x + rect.w - pad) - (n.x + r + 4);
            ctx.fillText(truncateToWidth(ctx, n.name, Math.max(24, maxWidth)), n.x + r + 4, n.y + 3);
          } else {
            ctx.textAlign = 'right';
            const maxWidth = (n.x - r - 4) - (rect.x + pad);
            ctx.fillText(truncateToWidth(ctx, n.name, Math.max(24, maxWidth)), n.x - r - 4, n.y + 3);
          }
        });
      });
    }

    function draw(ts) {
      if (activityRef.current === 'puzzle') {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const { w, h } = dims.current;
      const now = Date.now();
      const dt = Math.min(lastFrameTsRef.current ? (ts - lastFrameTsRef.current) / 1000 : 0.016, 0.05);
      lastFrameTsRef.current = ts;

      // Gathering phase (joining + self-paced quiz): nodes roam freely,
      // gently repel each other, and drift back toward center over time so
      // they never permanently settle along an edge or in a corner.
      // Also runs during the brief scatter right after teams are formed,
      // before each node has been given its team target.
      const isGathering = stateRef.current === 'idle' || stateRef.current === 'populating' || stateRef.current === 'quiz_open';
      const isScattering = stateRef.current === 'teams_formed' && nodesRef.current.some((n) => !n.teamTarget);
      if (isGathering || isScattering) {
        const top = TOP_BAR_HEIGHT + 20;
        const nodes = nodesRef.current;

        nodes.forEach((n) => {
          if (n.wanderVx === undefined) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 40 + Math.random() * 30;
            n.wanderVx = Math.cos(angle) * speed;
            n.wanderVy = Math.sin(angle) * speed;
          }
          // Continuous small jitter, without this a node's path is a
          // perfectly straight bounce forever, and enough random initial
          // angles end up nearly edge-parallel, which is why older nodes
          // (more elapsed time) were the ones ending up stuck on the walls.
          // No pull toward center, nodes are free to roam the whole
          // screen, edges and corners included.
          n.wanderVx += (Math.random() - 0.5) * 30 * dt;
          n.wanderVy += (Math.random() - 0.5) * 30 * dt;
        });

        // Mild mutual repulsion so nodes spread out instead of overlapping,
        // cheap even at a few hundred nodes since it's a plain distance check.
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            const distSq = dx * dx + dy * dy;
            const minDist = 46;
            if (distSq < minDist * minDist && distSq > 0.01) {
              const dist = Math.sqrt(distSq);
              const push = (minDist - dist) * 1.6 * dt;
              const nx = dx / dist, ny = dy / dist;
              a.wanderVx -= nx * push; a.wanderVy -= ny * push;
              b.wanderVx += nx * push; b.wanderVy += ny * push;
            }
          }
        }

        nodes.forEach((n) => {
          // Light damping so jitter accumulating over many minutes doesn't
          // let speed drift upward or downward without bound, then hold it
          // to a sane cruising range.
          n.wanderVx *= Math.pow(0.4, dt);
          n.wanderVy *= Math.pow(0.4, dt);
          const speedNow = Math.hypot(n.wanderVx, n.wanderVy);
          const minSpeed = 28, maxSpeed = 85;
          if (speedNow > 0.01 && speedNow < minSpeed) {
            const boost = minSpeed / speedNow;
            n.wanderVx *= boost; n.wanderVy *= boost;
          } else if (speedNow > maxSpeed) {
            n.wanderVx = (n.wanderVx / speedNow) * maxSpeed;
            n.wanderVy = (n.wanderVy / speedNow) * maxSpeed;
          }
          n.x += n.wanderVx * dt;
          n.y += n.wanderVy * dt;
          const r = n.radius + 8;
          // Keep roaming nodes out from behind the docked QR panel.
          const rightWall = qrOpenRef.current ? w - QR_PANEL_WIDTH : w;
          if (n.x < r) { n.x = r; n.wanderVx = Math.abs(n.wanderVx); }
          if (n.x > rightWall - r) { n.x = rightWall - r; n.wanderVx = -Math.abs(n.wanderVx); }
          if (n.y < top + r) { n.y = top + r; n.wanderVy = Math.abs(n.wanderVy); }
          if (n.y > h - r) { n.y = h - r; n.wanderVy = -Math.abs(n.wanderVy); }
        });
      }

      // Team formation: ease each node directly to its assigned slot inside
      // its team's box, plus a small idle drift so the final state breathes.
      if (stateRef.current === 'teams_formed') {
        nodesRef.current.forEach((n) => {
          if (!n.teamTarget) return;
          const ease = Math.min(1, 3.2 * dt);
          n.x += (n.teamTarget.x - n.x) * ease;
          n.y += (n.teamTarget.y - n.y) * ease;
          if (n.driftPhase === undefined) n.driftPhase = Math.random() * Math.PI * 2;
          n.x += Math.sin(ts / 1400 + n.driftPhase) * 0.16;
          n.y += Math.cos(ts / 1600 + n.driftPhase) * 0.16;
        });
      }

      const grad = ctx.createRadialGradient(w / 2, h * 0.35, 0, w / 2, h * 0.35, Math.max(w, h) * 0.85);
      grad.addColorStop(0, '#1a1410'); grad.addColorStop(0.6, '#111016'); grad.addColorStop(1, '#07080b');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

      starsRef.current.forEach((s) => {
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(ts / 1000 * s.sp + s.tw));
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fillStyle = `rgba(245,240,232,${0.12 * tw})`; ctx.fill();
      });

      if (stateRef.current === 'teams_formed') {
        drawTeamBlocks(w, h, now);
      } else {
        persistentEdgesRef.current.forEach(({ a, b, w: shared }) => {
          const na = nodesRef.current.find((n) => n.id === a), nb = nodesRef.current.find((n) => n.id === b);
          if (!na || !nb) return;
          const alpha = 0.05 + (shared - 3) * 0.035;
          ctx.strokeStyle = `rgba(232,185,35,${alpha})`; ctx.lineWidth = 0.8;
          const mx = (na.x + nb.x) / 2, my = (na.y + nb.y) / 2, dx = nb.x - na.x, dy = nb.y - na.y;
          ctx.beginPath(); ctx.moveTo(na.x, na.y); ctx.quadraticCurveTo(mx - dy * 0.08, my + dx * 0.08, nb.x, nb.y); ctx.stroke();
        });

        flashEdgesRef.current = flashEdgesRef.current.filter((e) => now - e.bornAt < 1500);
        flashEdgesRef.current.forEach(({ a, b, bornAt }) => {
          const na = nodesRef.current.find((n) => n.id === a), nb = nodesRef.current.find((n) => n.id === b);
          if (!na || !nb) return;
          const age = (now - bornAt) / 1500, fade = 1 - age;
          ctx.strokeStyle = `rgba(255,180,80,${fade * 0.85})`; ctx.lineWidth = 1.6 + fade * 1.4;
          ctx.shadowColor = 'rgba(255,150,60,0.8)'; ctx.shadowBlur = 8 * fade;
          ctx.beginPath(); ctx.moveTo(na.x, na.y); ctx.lineTo(nb.x, nb.y); ctx.stroke(); ctx.shadowBlur = 0;
        });

        nodesRef.current.forEach((n) => {
          const pulsing = now < n.pulseUntil;
          const pulseAmt = pulsing ? 1 + 0.9 * ((n.pulseUntil - now) / 900) : 1;
          const entry = Math.min(1, (now - n.bornAt) / 600);
          const r = n.radius * pulseAmt * entry;
          const halo = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 4.5);
          halo.addColorStop(0, n.colour + '55'); halo.addColorStop(1, 'transparent');
          ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(n.x, n.y, r * 4.5, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.shadowColor = n.colour; ctx.shadowBlur = pulsing ? 26 : 13; ctx.fillStyle = n.colour; ctx.fill(); ctx.shadowBlur = 0;
          ctx.beginPath(); ctx.arc(n.x - r * 0.28, n.y - r * 0.28, r * 0.35, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
          ctx.font = "500 11.5px Inter, system-ui, sans-serif"; ctx.fillStyle = `rgba(245,240,232,${0.55 * entry})`;
          ctx.textAlign = 'left';
          ctx.fillText(n.name || '', n.x + r + 6, n.y + 4);
        });
      }

      rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(rafRef.current); sim.stop(); };
  }, []);

  useEffect(() => {
    function computeSubmitted(state) {
      const total = state.questions.length;
      const byPid = {};
      state.answers.forEach((a) => { (byPid[a.participantId] = byPid[a.participantId] || new Set()).add(a.questionIndex); });
      return Object.values(byPid).filter((s) => s.size >= total).length;
    }

    socket.on('state_sync', (state) => {
      setActivity(state.session.activity || 'constellation');
      setJoinedCount(Object.keys(state.participants).length);
      setSessionState(state.session.state);
      setTeams(state.teams);
      setSubmittedCount(computeSubmitted(state));
      Object.values(state.participants).forEach((p) => {
        const node = ensureNode(p.id, p.name);
        state.answers.filter((a) => a.participantId === p.id).forEach((a) => { node.answerVector[a.questionIndex] = a.optionIndex; });
      });
      recomputePersistentEdges();
      if (state.session.state === 'teams_formed') {
        stateRef.current = 'teams_formed';
        updatePhysicsForPhase();
        applyTeamPositions(state.teams);
      }
      setBoard(state.puzzle || null);
      if (state.ownit) setOwnitBoard(state.ownit);
    });

    socket.on('participants_update', (participants) => {
      setJoinedCount(Object.keys(participants).length);
      Object.values(participants).forEach((p) => ensureNode(p.id, p.name));
      const ids = new Set(Object.keys(participants));
      nodesRef.current = nodesRef.current.filter((n) => ids.has(n.id));
      if (simRef.current) simRef.current.nodes(nodesRef.current);
      setSessionState((s) => (s === 'idle' ? 'populating' : s));
    });

    socket.on('answer_received', (answer) => {
      const node = nodesRef.current.find((n) => n.id === answer.participantId);
      if (node) { node.answerVector[answer.questionIndex] = answer.optionIndex; node.pulseUntil = Date.now() + 900; }
      recomputePersistentEdges();
      const peers = nodesRef.current.filter((n) => n.id !== answer.participantId && n.answerVector[answer.questionIndex] === answer.optionIndex);
      d3.shuffle(peers.slice()).slice(0, 3).forEach((p) => flashEdgesRef.current.push({ a: answer.participantId, b: p.id, bornAt: Date.now() }));
    });

    socket.on('submitted_update', ({ submitted }) => setSubmittedCount(submitted));

    socket.on('session_update', (session) => {
      setActivity(session.activity || 'constellation');
      setSessionState(session.state);
    });

    socket.on('teams_formed', ({ teams }) => {
      setTeams(teams); setSessionState('teams_formed'); setShowFormingBanner(true);
      // Scatter outward first, nodes keep wandering until targets are
      // assigned below, which reads as the graph breaking apart.
      nodesRef.current.forEach((n) => {
        n.teamTarget = null;
        n.wanderVx = (n.wanderVx || 0) + (Math.random() - 0.5) * 90;
        n.wanderVy = (n.wanderVy || 0) + (Math.random() - 0.5) * 90;
      });
      setTimeout(() => {
        stateRef.current = 'teams_formed';
        updatePhysicsForPhase();
        applyTeamPositions(teams);
      }, 1400);
      setTimeout(() => setShowFormingBanner(false), 4200);
    });

    // The projector asks for live board updates on every (re)connect.
    const hello = () => socket.emit('hello', { role: 'projector' });
    socket.on('connect', hello);
    if (socket.connected) hello();
    socket.on('puzzle_started', (b) => { setActivity('puzzle'); setBoard(b); });
    socket.on('puzzle_board', (b) => { if (b) setBoard(b); });
    socket.on('ownit_started', (b) => { setActivity('ownit'); setOwnitBoard(b); });
    socket.on('ownit_board', (b) => { if (b) setOwnitBoard(b); });

    socket.on('reset', () => {
      nodesRef.current = []; persistentEdgesRef.current = []; flashEdgesRef.current = [];
      setTeams([]); setSessionState('idle'); setJoinedCount(0); setSubmittedCount(0);
      setActivity('constellation'); setBoard(null); setOwnitBoard(null);
      stateRef.current = 'idle';
      updatePhysicsForPhase();
      if (simRef.current) { simRef.current.nodes([]); }
    });

    return () => {
      socket.off('state_sync'); socket.off('participants_update');
      socket.off('answer_received'); socket.off('submitted_update'); socket.off('session_update'); socket.off('teams_formed');
      socket.off('connect', hello); socket.off('puzzle_started'); socket.off('puzzle_board'); socket.off('reset');
      socket.off('ownit_started'); socket.off('ownit_board');
    };
  }, [ensureNode]);

  function applyTeamPositions(teamList) {
    const { w, h } = dims.current;
    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // sunflower-pattern spacing
    const count = teamList.length;
    teamList.forEach((team, i) => {
      const rect = teamBlockRect(i, w, h, count);
      const headerH = count > 10 ? 26 : 34;
      const top = rect.y + headerH, bottom = rect.y + rect.h - 10;
      const cx = rect.x + rect.w / 2, cy = (top + bottom) / 2;
      const ry = ((bottom - top) / 2) * 0.82;
      const rx = (rect.w / 2) * 0.5; // leaves room either side for name labels
      team.centre = { x: cx, y: cy };
      const n = team.memberIds.length || 1;
      team.memberIds.forEach((pid, idx) => {
        const node = nodesRef.current.find((nn) => nn.id === pid);
        if (!node) return;
        // Sunflower distribution: sqrt radial spacing keeps density even
        // across the whole disc instead of cramming everyone onto 1-2 thin
        // rings, so names have real breathing room between them.
        const t = (idx + 0.5) / n;
        const r = Math.sqrt(t);
        const angle = idx * GOLDEN_ANGLE;
        node.teamTarget = { x: cx + Math.cos(angle) * r * rx, y: cy + Math.sin(angle) * r * ry };
        node.colour = team.colour; node.radius = count > 10 ? 5 : 6.5;
      });
    });
    teamsRef.current = teamList;
  }

  if (activity === 'puzzle') {
    return <PuzzleProjector board={board} />;
  }
  if (activity === 'ownit') {
    return <OwnItProjector board={ownitBoard} />;
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#07080b' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0 }} />
      <QrPanel open={qrOpen} onClose={() => setQrOpen(false)} joinUrl={joinUrl} />

      {(sessionState === 'idle' || sessionState === 'populating' || sessionState === 'quiz_open' || sessionState === 'teams_formed') && (
        <div className="lc-fadein" style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: TOP_BAR_HEIGHT, zIndex: 15,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px',
          background: '#0d0e12',
          borderBottom: '2px solid #e8571a',
          backdropFilter: 'blur(10px)', fontFamily: "'Inter',sans-serif",
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
            <img src="/logo.png" alt="Carnelian" style={{ height: 38 }} />
            <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: '.01em', color: '#f5f0e8' }}>
              Team Formation
            </span>
          </div>
          <div style={{ flex: 1, textAlign: 'center', fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 15 }}>
            {sessionState === 'quiz_open' ? (
              <>
                <span style={{ color: '#e8571a' }}>{submittedCount}</span>
                <span style={{ color: 'rgba(245,240,232,.55)', marginLeft: 6 }}>submitted</span>
              </>
            ) : sessionState === 'teams_formed' ? (
              <>
                <span style={{ color: '#e8571a' }}>{teams.length}</span>
                <span style={{ color: 'rgba(245,240,232,.55)', marginLeft: 6 }}>teams formed</span>
              </>
            ) : (
              <>
                <span style={{ color: '#e8571a' }}>{joinedCount}</span>
                <span style={{ color: 'rgba(245,240,232,.55)', marginLeft: 6 }}>joined</span>
              </>
            )}
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 18 }}>
            <span style={{ fontSize: 11.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(245,240,232,.4)' }}>
              Convey Meaning. Create Significance.
            </span>
            <button onClick={() => setQrOpen((o) => !o)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999,
              border: `1px solid ${qrOpen ? '#e8571a' : 'rgba(255,255,255,.2)'}`,
              background: qrOpen ? 'rgba(232,87,26,.18)' : 'rgba(255,255,255,.04)',
              color: '#f5f0e8', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              <QrIcon size={15} /> {qrOpen ? 'Hide QR' : 'QR code'}
            </button>
          </div>
        </div>
      )}

      {showFormingBanner && (
        <div className="lc-fadein" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', background: 'radial-gradient(circle, rgba(7,8,11,.72) 0%, transparent 65%)' }}>
          <div style={{ fontSize: 13, letterSpacing: '.3em', textTransform: 'uppercase', color: 'rgba(232,185,35,.8)', marginBottom: 14, fontWeight: 600 }}>Forming</div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 'clamp(44px,7vw,104px)', letterSpacing: '-0.03em', color: '#f5f0e8', textShadow: '0 0 60px rgba(232,87,26,.6)' }}>{({ 10: 'Ten', 20: 'Twenty' })[teams.length] || teams.length} Teams</div>
        </div>
      )}
    </div>

  );
}

/* ============================================================
   FACILITATOR VIEW
   ============================================================ */
function FacilitatorView() {
  const [joinedCount, setJoinedCount] = useState(0);
  const [activity, setActivity] = useState('constellation');
  const [sessionState, setSessionState] = useState('idle');
  const [submittedCount, setSubmittedCount] = useState(0);
  const [questions, setQuestions] = useState([]);
  const [participants, setParticipants] = useState({});
  const [teams, setTeams] = useState([]);
  const [moveParticipantId, setMoveParticipantId] = useState('');
  const [moveTeamId, setMoveTeamId] = useState('');
  const [search, setSearch] = useState('');
  const [pz, setPz] = useState(null);       // facilitator puzzle detail (includes codes)
  const [board, setBoard] = useState(null); // same board the projector shows
  const [oi, setOi] = useState(null);       // Own It detail for the facilitator
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    function computeSubmitted(state) {
      const total = state.questions.length;
      const byPid = {};
      state.answers.forEach((a) => { (byPid[a.participantId] = byPid[a.participantId] || new Set()).add(a.questionIndex); });
      return Object.values(byPid).filter((s) => s.size >= total).length;
    }

    socket.on('state_sync', (state) => {
      setQuestions(state.questions); setParticipants(state.participants);
      setJoinedCount(Object.keys(state.participants).length);
      setActivity(state.session.activity || 'constellation');
      setSessionState(state.session.state);
      setTeams(state.teams);
      setSubmittedCount(computeSubmitted(state));
      setBoard(state.puzzle || null);
      if (!state.puzzle) setPz(null);
    });
    socket.on('participants_update', (p) => { setParticipants(p); setJoinedCount(Object.keys(p).length); });
    socket.on('submitted_update', ({ submitted }) => setSubmittedCount(submitted));
    socket.on('session_update', (session) => {
      setActivity(session.activity || 'constellation'); setSessionState(session.state);
    });
    socket.on('teams_formed', ({ teams }) => { setTeams(teams); setSessionState('teams_formed'); });
    // Announce as facilitator on every (re)connect to get codes and stats.
    const hello = () => socket.emit('hello', { role: 'facilitator' });
    socket.on('connect', hello);
    if (socket.connected) hello();
    socket.on('puzzle_started', (b) => { setActivity('puzzle'); setBoard(b); });
    socket.on('puzzle_board', (b) => { if (b) setBoard(b); });
    socket.on('puzzle_facilitator', (d) => { if (d) setPz(d); });
    socket.on('ownit_started', () => setActivity('ownit'));
    socket.on('ownit_facilitator', (d) => { if (d) setOi(d); });
    socket.on('reset', () => {
      setActivity('constellation'); setSessionState('idle'); setJoinedCount(0); setSubmittedCount(0);
      setTeams([]); setParticipants({}); setPz(null); setBoard(null); setOi(null);
    });
    return () => {
      socket.off('state_sync'); socket.off('participants_update'); socket.off('submitted_update');
      socket.off('session_update'); socket.off('teams_formed'); socket.off('reset');
      socket.off('connect', hello); socket.off('puzzle_started'); socket.off('puzzle_board'); socket.off('puzzle_facilitator');
      socket.off('ownit_started'); socket.off('ownit_facilitator');
    };
  }, []);

  function startQuiz() { socket.emit('facilitator_start_quiz'); }
  function makeTeams() { socket.emit('facilitator_make_teams'); }
  function resetAll() {
    setConfirm({
      title: 'Reset the entire session?',
      message: 'All participants, answers, teams, Code Up and Own It progress will be cleared. Everyone will be sent back to the join screen.',
      confirmLabel: 'Reset everything',
      danger: true,
      onConfirm: () => socket.emit('facilitator_reset'),
    });
  }
  function startPuzzle() {
    setConfirm({
      title: 'Start Code Up?',
      message: 'Every phone switches to the puzzle. Each team gets a captain, partner teams are shuffled, and the first 4 answerers per team get their scenarios.',
      confirmLabel: 'Start puzzle',
      onConfirm: () => socket.emit('facilitator_start_puzzle'),
    });
  }
  function startOwnIt() {
    setConfirm({
      title: 'Start Own It?',
      message: 'Every phone switches to Own It. Each team gets one of the 3 cases at random (7, 7 and 6 teams) and works at its own pace. Captains carry over from Code Up.',
      confirmLabel: 'Start Own It',
      onConfirm: () => socket.emit('facilitator_start_ownit'),
    });
  }
  function moveParticipant() {
    if (!moveParticipantId || !moveTeamId) return;
    socket.emit('facilitator_move_participant', { participantId: moveParticipantId, teamId: moveTeamId });
    setMoveParticipantId(''); setMoveTeamId('');
  }
  function deleteParticipant(id) {
    const person = participants[id];
    setConfirm({
      title: 'Remove this person?',
      message: `${person ? person.name : 'This participant'} will be removed from the room and from any team they were on.`,
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: () => socket.emit('facilitator_delete_participant', { participantId: id }),
    });
  }

  const pct = joinedCount ? Math.round((submittedCount / joinedCount) * 100) : 0;
  const filtered = Object.values(participants).filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="lc-root">
      <div className="lc-glow" />
      <ConnectionPill />
      <div className="lc-content lc-fadein" style={{ padding: '26px clamp(16px,4vw,44px) 60px', maxWidth: 1040, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15, marginBottom: 26, flexWrap: 'wrap' }}>
          <img src="/logo.png" alt="Carnelian" style={{ height: 42 }} />
          <div>
            <h1 className="lc-h1" style={{ fontSize: 'clamp(19px,3vw,25px)', marginBottom: 6 }}>Facilitator Console</h1>
            <span className="lc-badge">{activity === 'puzzle' ? 'Code Up' : activity === 'ownit' ? 'Own It' : 'Team Formation'} · {sessionState.replace('_', ' ')}</span>
          </div>
        </div>

        {activity === 'constellation' && (
          <>
            <div className="lc-stats-row" style={{ display: 'flex', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
              <div className="lc-stat-card"><div className="lc-stat-label">Joined</div><div className="lc-stat-value">{joinedCount}</div></div>
              <div className="lc-stat-card">
                <div className="lc-stat-label">Submitted the quiz</div>
                <div className="lc-stat-value" style={{ color: pct >= 80 ? '#3ddc84' : 'var(--ink)' }}>{submittedCount}<span style={{ color: 'var(--ink-faint)', fontSize: 20 }}>/{joinedCount}</span></div>
                <div className="lc-bar-track" style={{ marginTop: 10 }}><div className="lc-bar-fill" style={{ width: `${pct}%` }} /></div>
              </div>
              <div className="lc-stat-card">
                <div className="lc-stat-label">Questions</div>
                <div className="lc-stat-value">{questions.length || 6}</div>
              </div>
            </div>

            <div className="lc-card" style={{ padding: 24, marginBottom: 18 }}>
              {sessionState === 'idle' && (
                <>
                  <p style={{ margin: '0 0 18px', fontSize: 16, color: 'var(--ink-dim)' }}>
                    Once you start, every joined phone gets all {questions.length || 6} questions at once, people answer at their own pace, no need to push each question.
                  </p>
                  <button className="lc-btn lc-btn-primary" onClick={startQuiz} style={{ width: '100%' }}>Start the quiz</button>
                </>
              )}
              {sessionState === 'quiz_open' && (
                <>
                  <p style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 500 }}>Quiz is open</p>
                  <p className="lc-faint" style={{ marginTop: 0 }}>People are answering at their own pace. You never need everyone to finish, make teams whenever the room feels ready.</p>
                </>
              )}
              {sessionState === 'teams_formed' && (
                <p style={{ margin: 0, fontSize: 16, color: 'var(--ink-dim)' }}>Teams are formed. Start Code Up below when ready.</p>
              )}
            </div>

            <div className="lc-card" style={{ padding: 24, marginBottom: 18 }}>
              <div className="lc-btn-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button className="lc-btn lc-btn-danger" onClick={makeTeams} disabled={sessionState === 'idle'} style={{ flex: '2 1 220px' }}>✦ Make teams</button>
                <button className="lc-btn lc-btn-outline" onClick={resetAll}>Reset to idle</button>
              </div>
            </div>

            {teams.length > 0 && (
              <div className="lc-card" style={{ padding: 24, marginBottom: 18 }}>
                <h3 style={{ fontSize: 14, opacity: .75, margin: '0 0 14px', letterSpacing: '.05em', textTransform: 'uppercase' }}>Teams</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
                  {teams.map((t) => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999, background: 'rgba(255,255,255,.03)', border: `1px solid ${t.colour}44`, fontSize: 13 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: t.colour, boxShadow: `0 0 10px ${t.colour}` }} />Team {t.number}<b style={{ color: t.colour }}>{t.memberIds.length}</b>
                      <span style={{ color: 'var(--ink-faint)', fontSize: 12 }}>{t.memberIds.filter((id) => participants[id] && participants[id].gender === 'female').length}F</span>
                    </div>
                  ))}
                </div>
                <h3 style={{ fontSize: 14, opacity: .75, margin: '0 0 12px', letterSpacing: '.05em', textTransform: 'uppercase' }}>Manual override</h3>
                <div className="lc-btn-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <select className="lc-select" value={moveParticipantId} onChange={(e) => setMoveParticipantId(e.target.value)}>
                    <option value="">Select participant</option>
                    {Object.values(participants).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select className="lc-select" value={moveTeamId} onChange={(e) => setMoveTeamId(e.target.value)}>
                    <option value="">Select team</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>Team {t.number}</option>)}
                  </select>
                  <button className="lc-btn lc-btn-primary" onClick={moveParticipant}>Move</button>
                </div>
                <div className="lc-btn-row" style={{ marginTop: 18, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button className="lc-btn lc-btn-gold" onClick={startPuzzle} style={{ flex: '2 1 220px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}><Icon name="puzzle" size={18} /> Start Code Up</button>
                  <button className="lc-btn lc-btn-outline" onClick={startOwnIt} style={{ flex: '1 1 180px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}><Icon name="bulb" size={18} /> Start Own It</button>
                </div>
              </div>
            )}

            <div className="lc-card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: 14, opacity: .75, margin: 0, letterSpacing: '.05em', textTransform: 'uppercase' }}>Participants ({joinedCount})</h3>
                <input className="lc-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name" style={{ width: 200, padding: '10px 14px', fontSize: 14, textAlign: 'left' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflowY: 'auto' }}>
                {filtered.length === 0 && <p className="lc-faint" style={{ margin: 0 }}>Nobody yet.</p>}
                {filtered.map((p) => {
                  const t = teams.find((tt) => tt.id === p.teamId);
                  return (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,.03)', padding: '10px 15px', borderRadius: 10, fontSize: 14 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        {t && <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.colour }} />}
                        {p.name}{t && <span style={{ color: 'var(--ink-faint)', fontSize: 12 }}>Team {t.number}</span>}
                      </span>
                      <button onClick={() => deleteParticipant(p.id)} style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: 'rgba(168,50,50,.2)', color: '#ff9a9a', fontSize: 12, cursor: 'pointer' }}>Remove</button>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {activity === 'puzzle' && (
          <>
            <PuzzleFacilitatorPanel pz={pz} board={board} onConfirm={setConfirm} />
            <div className="lc-card" style={{ padding: 22, marginBottom: 18 }}>
              <h3 style={{ fontSize: 14, opacity: .75, margin: '0 0 6px', letterSpacing: '.05em', textTransform: 'uppercase' }}>Next activity</h3>
              <p className="lc-faint" style={{ marginTop: 0, marginBottom: 14 }}>Own It uses the same teams and captains. Start it whenever Code Up is done.</p>
              <button className="lc-btn lc-btn-gold" onClick={startOwnIt} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}><Icon name="bulb" size={18} /> Start Own It</button>
            </div>
            <div className="lc-card" style={{ padding: 22 }}>
              <div className="lc-btn-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button className="lc-btn lc-btn-danger" onClick={resetAll}>Reset entire session</button>
              </div>
            </div>
          </>
        )}

        {activity === 'ownit' && (
          <>
            <OwnItFacilitatorPanel oi={oi} onConfirm={setConfirm} />
            <div className="lc-card" style={{ padding: 22 }}>
              <div className="lc-btn-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button className="lc-btn lc-btn-danger" onClick={resetAll}>Reset entire session</button>
              </div>
            </div>
          </>
        )}
      </div>

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        danger={confirm?.danger}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { confirm?.onConfirm?.(); setConfirm(null); }}
      />
    </div>
  );
}

/* ============================================================
   APP ROOT
   ============================================================ */
export default function App() {
  useInjectTheme();
  const path = window.location.pathname;
  if (path.startsWith('/projector')) return <ProjectorView />;
  if (path.startsWith('/facilitator')) return <FacilitatorView />;
  return <ParticipantView />;
}