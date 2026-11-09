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

  const restoreFromState = useCallback((state) => {
    const me = state.participants[participantId];
    setJoinedCount(Object.keys(state.participants).length);
    if (state.questions) setQuestions(state.questions);
    if (!me) { setScreen('join'); return; }
    setMyName(me.name);

    if (state.session.state === 'teams_formed') {
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
      if (session.state === 'quiz_open') {
        setScreen((s) => (s === 'waiting' ? 'quiz' : s));
      }
    });
    socket.on('reset', () => {
      setScreen('join'); setQuestions([]); setQuizIndex(0); setAnsweredSet(new Set());
      setSelectedOption(null); setLocked(false); setTeam(null); setTeammates([]);
    });
    return () => {
      socket.off('state_sync', restoreFromState);
      socket.off('joined'); socket.off('join_error'); socket.off('room_count');
      socket.off('teams_formed'); socket.off('reset');
      socket.off('answer_confirmed'); socket.off('session_update');
    };
  }, [participantId, restoreFromState]);

  function handleJoin(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 40) { setJoinError('Enter 1-40 characters.'); return; }
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

  const question = questions[quizIndex];

  return (
    <div className="lc-root">
      <div className="lc-glow" />
      <ConnectionPill />
      <div className="lc-content" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 20px 48px', maxWidth: 480, margin: '0 auto' }}>
        <img src="/logo.png" alt="Carnelian" className="lc-logo" style={{ marginBottom: 24 }} />

        {screen === 'join' && (
          <form onSubmit={handleJoin} className="lc-fadein" style={{ width: '100%', textAlign: 'center' }}>
            <span className="lc-badge" style={{ marginBottom: 18, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="users" size={14} /> Team Formation</span>
            <h1 className="lc-h1" style={{ marginBottom: 10 }}>Join the room</h1>
            <p className="lc-sub" style={{ marginBottom: 26 }}>Please write your name</p>
            <input className="lc-input" value={name} maxLength={40} placeholder="Your name"
              onChange={(e) => setName(e.target.value)} autoFocus autoComplete="off" />
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              {[['man', 'Man'], ['woman', 'Woman']].map(([val, label]) => (
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
                <span className="lc-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{pending ? 'Sending...' : <><Icon name="check" size={14} /> Locked in</>}</span>
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
              <span className="lc-badge">Go and find your team</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const ICON_PATHS = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.8c1.9.7 3.1 2.4 3.5 5.2" /></>,
  shuffle: <><path d="M3 7h3.5c4.5 0 6.5 10 11 10H21" /><path d="M3 17h3.5c1.8 0 3.1-1.6 4.2-3.6M13.3 9.6C14.4 8 15.7 7 17.5 7H21" /><path d="M18 4l3 3-3 3M18 14l3 3-3 3" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  shrink: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
};

function Icon({ name, size = 18, stroke = 1.8, style }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, ...style }}>
      {ICON_PATHS[name] || null}
    </svg>
  );
}


// Full screen for the projector laptop (hides the browser bars). F key too.
function useFullscreen() {
  const [on, setOn] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggle = useCallback(() => {
    try {
      const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* not supported: ignore */ }
  }, []);
  return [on, toggle];
}

function FullscreenButton({ compact }) {
  const [on, toggle] = useFullscreen();
  return (
    <button onClick={toggle} title={on ? 'Exit full screen (F)' : 'Full screen (F)'} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: compact ? '8px 10px' : '8px 14px', borderRadius: 999,
      border: `1px solid ${on ? '#e8571a' : 'rgba(255,255,255,.2)'}`, background: on ? 'rgba(232,87,26,.18)' : 'rgba(255,255,255,.04)',
      color: '#f5f0e8', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Inter',sans-serif",
    }}>
      <Icon name={on ? 'shrink' : 'expand'} size={15} />{compact ? null : (on ? 'Exit full screen' : 'Full screen')}
    </button>
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

// Grid cell for team block i: one row of up to 4 tall columns (4 teams),
// more rows only if the team count ever goes above 4.
function teamBlockRect(i, w, h, count = 4) {
  const cols = Math.max(1, Math.min(4, count));
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

  const [sessionState, setSessionState] = useState('idle');
  const [joinedCount, setJoinedCount] = useState(0);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [teams, setTeams] = useState([]);
  const [showFormingBanner, setShowFormingBanner] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const qrOpenRef = useRef(false);
  useEffect(() => { qrOpenRef.current = qrOpen; }, [qrOpen]);

  const joinUrl = `${window.location.origin}/`;

  useEffect(() => { stateRef.current = sessionState; }, [sessionState]);
  useEffect(() => { teamsRef.current = teams; }, [teams]);

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

    socket.on('session_update', (session) => setSessionState(session.state));

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

    // The projector announces itself on every (re)connect to get the full state.
    const hello = () => socket.emit('hello', { role: 'projector' });
    socket.on('connect', hello);
    if (socket.connected) hello();

    socket.on('reset', () => {
      nodesRef.current = []; persistentEdgesRef.current = []; flashEdgesRef.current = [];
      setTeams([]); setSessionState('idle'); setJoinedCount(0); setSubmittedCount(0);
      stateRef.current = 'idle';
      updatePhysicsForPhase();
      if (simRef.current) { simRef.current.nodes([]); }
    });

    return () => {
      socket.off('state_sync'); socket.off('participants_update');
      socket.off('answer_received'); socket.off('submitted_update'); socket.off('session_update'); socket.off('teams_formed');
      socket.off('connect', hello); socket.off('reset');
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
            <FullscreenButton compact={window.innerWidth < 1500} />
          </div>
        </div>
      )}

      {showFormingBanner && (
        <div className="lc-fadein" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', background: 'radial-gradient(circle, rgba(7,8,11,.72) 0%, transparent 65%)' }}>
          <div style={{ fontSize: 13, letterSpacing: '.3em', textTransform: 'uppercase', color: 'rgba(232,185,35,.8)', marginBottom: 14, fontWeight: 600 }}>Forming</div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 'clamp(44px,7vw,104px)', letterSpacing: '-0.03em', color: '#f5f0e8', textShadow: '0 0 60px rgba(232,87,26,.6)' }}>{({ 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six' })[teams.length] || teams.length} Teams</div>
        </div>
      )}
    </div>

  );
}

/* ============================================================
   FACILITATOR VIEW
   ============================================================ */
// Short labels for the balance table (question index -> option index -> label).
const EXP_SHORT = ['<2', '2-5', '6-10', '11-15', '15+'];

function FacilitatorView() {
  const [joinedCount, setJoinedCount] = useState(0);
  const [sessionState, setSessionState] = useState('idle');
  const [submittedCount, setSubmittedCount] = useState(0);
  const [questions, setQuestions] = useState([]);
  const [participants, setParticipants] = useState({});
  const [answers, setAnswers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [moveParticipantId, setMoveParticipantId] = useState('');
  const [moveTeamId, setMoveTeamId] = useState('');
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    function computeSubmitted(state) {
      const total = state.questions.length;
      const byPid = {};
      state.answers.forEach((a) => { (byPid[a.participantId] = byPid[a.participantId] || new Set()).add(a.questionIndex); });
      return Object.values(byPid).filter((s) => s.size >= total).length;
    }

    socket.on('state_sync', (state) => {
      setQuestions(state.questions); setParticipants(state.participants); setAnswers(state.answers || []);
      setJoinedCount(Object.keys(state.participants).length);
      setSessionState(state.session.state);
      setTeams(state.teams);
      setSubmittedCount(computeSubmitted(state));
    });
    socket.on('participants_update', (p) => { setParticipants(p); setJoinedCount(Object.keys(p).length); });
    socket.on('answer_received', (a) => setAnswers((prev) => [...prev, a]));
    socket.on('submitted_update', ({ submitted }) => setSubmittedCount(submitted));
    socket.on('session_update', (session) => setSessionState(session.state));
    socket.on('teams_formed', ({ teams, participants }) => {
      setTeams(teams); setSessionState('teams_formed');
      if (participants) setParticipants(participants);
    });
    const hello = () => socket.emit('hello', { role: 'facilitator' });
    socket.on('connect', hello);
    if (socket.connected) hello();
    socket.on('reset', () => {
      setSessionState('idle'); setJoinedCount(0); setSubmittedCount(0);
      setTeams([]); setParticipants({}); setAnswers([]);
    });
    return () => {
      socket.off('state_sync'); socket.off('participants_update'); socket.off('answer_received'); socket.off('submitted_update');
      socket.off('session_update'); socket.off('teams_formed'); socket.off('reset');
      socket.off('connect', hello);
    };
  }, []);

  function startQuiz() { socket.emit('facilitator_start_quiz'); }
  function makeTeams() {
    if (teams.length === 0) { socket.emit('facilitator_make_teams'); return; }
    setConfirm({
      title: 'Make the teams again?',
      message: 'This makes a new balanced split of 4 teams. Everyone may move to a different team, and any manual moves will be lost.',
      confirmLabel: 'Make new teams',
      onConfirm: () => socket.emit('facilitator_make_teams'),
    });
  }
  function resetAll() {
    setConfirm({
      title: 'Reset the entire session?',
      message: 'All participants, answers and teams will be cleared. Everyone will be sent back to the join screen.',
      confirmLabel: 'Reset everything',
      danger: true,
      onConfirm: () => socket.emit('facilitator_reset'),
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

  // pid -> { questionIndex: optionIndex }
  const answerMap = {};
  answers.forEach((a) => { (answerMap[a.participantId] = answerMap[a.participantId] || {})[a.questionIndex] = a.optionIndex; });
  const companyOptions = (questions[1] && questions[1].options) || [];
  const companyOf = (pid) => { const v = answerMap[pid] && answerMap[pid][1]; return v === undefined ? '-' : companyOptions[v]; };
  const expOf = (pid) => { const v = answerMap[pid] && answerMap[pid][0]; return v === undefined ? '-' : EXP_SHORT[v]; };

  const pct = joinedCount ? Math.round((submittedCount / joinedCount) * 100) : 0;
  const filtered = Object.values(participants).filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const label = { fontSize: 14, opacity: .75, letterSpacing: '.05em', textTransform: 'uppercase' };

  return (
    <div className="lc-root">
      <div className="lc-glow" />
      <ConnectionPill />
      <div className="lc-content lc-fadein" style={{ padding: '26px clamp(16px,4vw,44px) 60px', maxWidth: 1040, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15, marginBottom: 26, flexWrap: 'wrap' }}>
          <img src="/logo.png" alt="Carnelian" style={{ height: 42 }} />
          <div>
            <h1 className="lc-h1" style={{ fontSize: 'clamp(19px,3vw,25px)', marginBottom: 6 }}>Facilitator Console</h1>
            <span className="lc-badge">Team Formation · {sessionState.replace('_', ' ')}</span>
          </div>
        </div>

        <div className="lc-stats-row" style={{ display: 'flex', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
          <div className="lc-stat-card"><div className="lc-stat-label">Joined</div><div className="lc-stat-value">{joinedCount}</div></div>
          <div className="lc-stat-card">
            <div className="lc-stat-label">Submitted the quiz</div>
            <div className="lc-stat-value" style={{ color: pct >= 80 ? '#3ddc84' : 'var(--ink)' }}>{submittedCount}<span style={{ color: 'var(--ink-faint)', fontSize: 20 }}>/{joinedCount}</span></div>
            <div className="lc-bar-track" style={{ marginTop: 10 }}><div className="lc-bar-fill" style={{ width: `${pct}%` }} /></div>
          </div>
          <div className="lc-stat-card">
            <div className="lc-stat-label">Teams</div>
            <div className="lc-stat-value">4</div>
          </div>
        </div>

        <div className="lc-card" style={{ padding: 24, marginBottom: 18 }}>
          {sessionState === 'idle' && (
            <>
              <p style={{ margin: '0 0 18px', fontSize: 16, color: 'var(--ink-dim)' }}>
                Once you start, every joined phone gets all {questions.length || 4} questions at once. People answer at their own pace, so there is no need to push each question.
              </p>
              <button className="lc-btn lc-btn-primary" onClick={startQuiz} style={{ width: '100%' }}>Start the quiz</button>
            </>
          )}
          {sessionState === 'populating' && (
            <>
              <p style={{ margin: '0 0 18px', fontSize: 16, color: 'var(--ink-dim)' }}>
                People are joining. Start the quiz when the room is in.
              </p>
              <button className="lc-btn lc-btn-primary" onClick={startQuiz} style={{ width: '100%' }}>Start the quiz</button>
            </>
          )}
          {sessionState === 'quiz_open' && (
            <>
              <p style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 500 }}>Quiz is open</p>
              <p className="lc-faint" style={{ marginTop: 0 }}>People are answering at their own pace. Make teams once everyone has submitted. Anyone who has not answered is still placed, balanced by gender only.</p>
            </>
          )}
          {sessionState === 'teams_formed' && (
            <p style={{ margin: 0, fontSize: 16, color: 'var(--ink-dim)' }}>Teams are formed and showing on every phone and the big screen.</p>
          )}
        </div>

        <div className="lc-card" style={{ padding: 24, marginBottom: 18 }}>
          <div className="lc-btn-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="lc-btn lc-btn-danger" onClick={makeTeams} disabled={sessionState === 'idle' || joinedCount === 0}
              style={{ flex: '2 1 220px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <Icon name={teams.length ? 'shuffle' : 'users'} size={18} /> {teams.length ? 'Make teams again' : 'Make 4 teams'}
            </button>
            <button className="lc-btn lc-btn-outline" onClick={resetAll}>Reset to idle</button>
          </div>
        </div>

        {teams.length > 0 && (
          <div className="lc-card" style={{ padding: 24, marginBottom: 18 }}>
            <h3 style={{ ...label, margin: '0 0 14px' }}>Teams</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 22 }}>
              {teams.map((t) => {
                const members = t.memberIds.filter((id) => participants[id]);
                const women = members.filter((id) => participants[id].gender === 'woman').length;
                return (
                  <div key={t.id} style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${t.colour}55`, borderRadius: 14, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontWeight: 700 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.colour, boxShadow: `0 0 10px ${t.colour}` }} />
                      Team {t.number}
                      <span style={{ marginLeft: 'auto', color: 'var(--ink-faint)', fontSize: 12, fontWeight: 500 }}>{members.length} people · {women} W · {members.length - women} M</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {members.map((id) => (
                        <div key={id} style={{ fontSize: 13, lineHeight: 1.3 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{participants[id].name}</span>
                            <span style={{ color: 'var(--ink-dim)', whiteSpace: 'nowrap', fontSize: 12 }}>{participants[id].gender === 'woman' ? 'W' : 'M'} · {expOf(id)} yrs</span>
                          </div>
                          <div style={{ color: 'var(--ink-faint)', fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{companyOf(id)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <h3 style={{ ...label, margin: '0 0 12px' }}>Manual override</h3>
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
          </div>
        )}

        <div className="lc-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <h3 style={{ ...label, margin: 0 }}>Participants ({joinedCount})</h3>
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