import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import * as d3 from 'd3';
import { QRCodeSVG } from 'qrcode.react';

/* ============================================================
   SOCKET
   ============================================================ */
const SERVER_URL = 'https://constellation-backend-4d88.onrender.com';
const socket = io(SERVER_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
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
  @keyframes lc-pop { 0% { transform: scale(0.7); opacity:0; } 60% { transform: scale(1.06); } 100% { transform: scale(1); opacity:1; } }
  @keyframes lc-rise { from { opacity:0; transform: translateY(14px); } to { opacity:1; transform:translateY(0); } }
  @keyframes lc-breathe { 0%,100% { transform: scale(1); box-shadow: 0 0 40px currentColor; } 50% { transform: scale(1.05); box-shadow: 0 0 70px currentColor; } }
  @keyframes lc-spin { to { transform: rotate(360deg); } }
  @keyframes lc-zoomin { from { opacity:0; transform: scale(0.85); } to { opacity:1; transform: scale(1); } }
  @keyframes lc-glowpop { 0% { box-shadow: 0 0 0 rgba(232,185,35,0); } 40% { box-shadow: 0 0 60px rgba(232,185,35,.8); } 100% { box-shadow: 0 0 20px rgba(232,185,35,.3); } }
  @keyframes lc-boomflash { 0% { opacity:0; } 15% { opacity:1; } 100% { opacity:0; } }
  @keyframes lc-meshdraw { 0% { opacity:0; } 100% { opacity:1; } }
  @keyframes lc-meshglow { 0%,100% { opacity: 0.35; } 50% { opacity: 0.6; } }
  @keyframes lc-completebanner { 0% { opacity:0; transform: translateY(10px) scale(0.97); } 15% { opacity:1; transform: translateY(0) scale(1); } 80% { opacity:1; } 100% { opacity:0; } }

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

  .lc-jig-slot {
    border-radius:10px; display:flex; flex-direction:column; align-items:center; justify-content:center;
    position:relative; overflow:hidden; border:1.5px solid rgba(255,255,255,.08); background:rgba(255,255,255,.02);
  }
  .lc-jig-slot.placed { animation: lc-glowpop 1s ease-out both; }
  .lc-jig-slot.locked::after {
    content:''; position:absolute; inset:0;
    background:
      url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23e8b923' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><rect x='5' y='11' width='14' height='10' rx='2'/><path d='M8 11V7a4 4 0 018 0v4'/></svg>") center / 34% no-repeat,
      rgba(0,0,0,.35);
  }

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

/* Styled confirmation dialog — replaces window.confirm, which renders as a
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

function useElapsedClock(startedAt, running) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running || !startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, running]);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/* ============================================================
   PARTICIPANT VIEW (phone)
   ============================================================ */
function getOrCreateParticipantId() {
  let id = localStorage.getItem('constellation_participant_id');
  if (!id) {
    id = 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('constellation_participant_id', id);
  }
  return id;
}

function ParticipantView() {
  const [participantId] = useState(getOrCreateParticipantId);
  const [screen, setScreen] = useState('join'); // join | waiting | quiz | submitted | reveal
  const [name, setName] = useState('');
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

    if (state.session.state === 'teams_formed' || state.session.activity === 'jigsaw') {
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

  useEffect(() => {
    socket.on('state_sync', restoreFromState);
    socket.on('joined', (p) => { setMyName(p.name); setScreen('waiting'); });
    socket.on('answer_confirmed', () => setPending(false));
    socket.on('join_error', ({ message }) => setJoinError(message));
    socket.on('participants_update', (p) => setJoinedCount(Object.keys(p).length));
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
    socket.on('jigsaw_started', () => setActivity('jigsaw'));
    socket.on('reset', () => {
      setScreen('join'); setQuestions([]); setQuizIndex(0); setAnsweredSet(new Set());
      setSelectedOption(null); setLocked(false); setTeam(null); setTeammates([]); setActivity('constellation');
    });
    return () => {
      socket.off('state_sync', restoreFromState);
      socket.off('joined'); socket.off('join_error'); socket.off('participants_update');
      socket.off('teams_formed'); socket.off('reset');
      socket.off('answer_confirmed'); socket.off('session_update'); socket.off('jigsaw_started');
    };
  }, [participantId, restoreFromState]);

  function handleJoin(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 20) { setJoinError('Enter 1-20 characters.'); return; }
    setJoinError('');
    socket.emit('join', { id: participantId, name: trimmed });
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

  // Once a team is known and the room has moved to jigsaw, hand off entirely.
  if (team && activity === 'jigsaw') {
    return <JigsawParticipant team={team} teammates={teammates} participantId={participantId} />;
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
            <span className="lc-badge" style={{ marginBottom: 18, display: 'inline-flex' }}>✦ Constellation</span>
            <h1 className="lc-h1" style={{ marginBottom: 10 }}>Join the room</h1>
            <p className="lc-sub" style={{ marginBottom: 26 }}>First name plus last initial</p>
            <input className="lc-input" value={name} maxLength={20} placeholder="e.g. Ahmed K"
              onChange={(e) => setName(e.target.value)} autoFocus autoComplete="off" />
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
   JIGSAW — PARTICIPANT (shared team state, any member can act)
   ============================================================ */
function JigsawParticipant({ team, teammates = [], participantId }) {
  const [tab, setTab] = useState('board');
  const [board, setBoard] = useState([]);
  const [holding, setHolding] = useState([]);
  const [legend, setLegend] = useState([]);
  const [isCaptain, setIsCaptain] = useState(false);
  const [captainName, setCaptainName] = useState(null);
  const [errors, setErrors] = useState({});
  const [inputs, setInputs] = useState({}); // { rowIndex: { code, slot } }
  const [hintBanner, setHintBanner] = useState(null);

  const requestState = useCallback(() => {
    socket.emit('jigsaw_get_team_state', { teamNumber: team.number, participantId });
  }, [team.number, participantId]);

  useEffect(() => {
    requestState();
    socket.on('jigsaw_team_state', (data) => {
      if (data.teamNumber !== team.number) return;
      setBoard(data.board); setHolding(data.holding); setLegend(data.legend);
      setIsCaptain(!!data.isCaptain); setCaptainName(data.captainName || null);
    });
    socket.on('jigsaw_refresh', ({ teamNumbers }) => {
      if (teamNumbers.includes(team.number)) requestState();
    });
    socket.on('jigsaw_place_error', ({ message }) => {
      setErrors((e) => ({ ...e, active: message }));
      setTimeout(() => setErrors((e) => ({ ...e, active: null })), 3500);
    });
    socket.on('jigsaw_hint', ({ teamNumber, section, slot, code }) => {
      if (teamNumber !== team.number) return;
      setHintBanner(`Hint — Section ${section}: slot ${slot}, code ${code}`);
      setTimeout(() => setHintBanner(null), 10000);
    });
    socket.on('jigsaw_act2_unlocked', requestState);
    return () => {
      socket.off('jigsaw_team_state'); socket.off('jigsaw_refresh'); socket.off('jigsaw_place_error');
      socket.off('jigsaw_hint'); socket.off('jigsaw_act2_unlocked');
    };
  }, [team.number, requestState]);

  function updateInput(idx, field, value) {
    setInputs((prev) => ({ ...prev, [idx]: { ...prev[idx], [field]: value } }));
  }

  function submitPlacement(idx) {
    const row = inputs[idx] || {};
    if (!row.code || !row.slot) {
      setErrors((e) => ({ ...e, active: 'Fill in both fields.' }));
      setTimeout(() => setErrors((e) => ({ ...e, active: null })), 2500);
      return;
    }
    socket.emit('jigsaw_place_piece', { teamNumber: team.number, code: row.code, slotNumber: row.slot, participantId });
  }

  function submitRocket(slot) {
    socket.emit('jigsaw_place_rocket', { teamNumber: team.number, slotNumber: slot, participantId });
  }

  return (
    <div className="lc-root">
      <div className="lc-glow" />
      <ConnectionPill />
      <div className="lc-content" style={{ minHeight: '100dvh', padding: '28px 18px 48px', maxWidth: 480, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <img src="/logo.png" alt="" style={{ height: 32 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="lc-badge" style={{ background: `${team.colour}22`, color: team.colour, borderColor: `${team.colour}55` }}>
              Team {team.number}
            </span>
            {isCaptain && <span className="lc-badge" style={{ background: 'rgba(232,185,35,.15)', color: 'var(--gold)', borderColor: 'rgba(232,185,35,.3)' }}>You're the captain</span>}
          </div>
        </div>

        <h1 className="lc-h1" style={{ fontSize: 24, marginBottom: 16 }}>The Jigsaw</h1>

        {hintBanner && (
          <div className="lc-card lc-fadein" style={{ padding: '14px 18px', marginBottom: 16, border: `1px solid var(--gold)` }}>
            <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{hintBanner}</span>
          </div>
        )}

        {errors.active && (
          <div className="lc-card lc-fadein" style={{ padding: '14px 18px', marginBottom: 16, border: '1px solid #a83232' }}>
            <span style={{ color: '#ff9a9a' }}>{errors.active}</span>
          </div>
        )}

        <div className="lc-tabs" style={{ marginBottom: 20 }}>
          <button className={`lc-tab ${tab === 'board' ? 'active' : ''}`} onClick={() => setTab('board')}>Our board</button>
          <button className={`lc-tab ${tab === 'holding' ? 'active' : ''}`} onClick={() => setTab('holding')}>We're holding</button>
          <button className={`lc-tab ${tab === 'legend' ? 'active' : ''}`} onClick={() => setTab('legend')}>We know slots</button>
          <button className={`lc-tab ${tab === 'team' ? 'active' : ''}`} onClick={() => setTab('team')}>My team</button>
        </div>

        {tab === 'board' && (
          <div>
            <p className="lc-faint" style={{ marginTop: 0, marginBottom: 16 }}>
              {board.length > 0 && board.every((r) => r.isRocket)
                ? "Your team owns two sections of the puzzle. Both are part of the rocket — you'll place them at the very end, in front of everyone. No codes to collect."
                : isCaptain
                  ? 'Your team owns two sections of the puzzle. Get the code and slot number for each from other teams to place them.'
                  : `Your team owns two sections of the puzzle. ${captainName || 'Your team\'s captain'} handles entering the codes and slots — track them down if you find one.`}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {board.map((row, idx) => (
                <div key={idx} className="lc-card" style={{ padding: 20 }}>
                  <p className="lc-faint" style={{ marginTop: 0, marginBottom: 12, fontWeight: 700, color: 'var(--gold)', letterSpacing: '.02em' }}>
                    Section {row.section}
                  </p>
                  {row.placed ? (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                        <PuzzleCrop slot={row.slot} size={72} rounded={12} style={{ border: '1px solid rgba(232,185,35,.35)' }} />
                      </div>
                      <p style={{ margin: 0, fontWeight: 600 }}>{row.isRocket ? 'Part of the rocket' : row.valueText}</p>
                      <span className="lc-badge" style={{ marginTop: 10 }}>Slot {row.slot} · Placed</span>
                    </div>
                  ) : row.locked ? (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4, color: 'var(--ink-faint)' }}>
                        <svg viewBox="0 0 24 24" width={32} height={32} fill="none" stroke="currentColor"
                          strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                          <rect x="5" y="11" width="14" height="10" rx="2" />
                          <path d="M8 11V7a4 4 0 018 0v4" />
                        </svg>
                      </div>
                      <p className="lc-faint" style={{ marginBottom: 6 }}>This piece unlocks once the rest of the board is done.</p>
                      <p className="lc-faint" style={{ marginTop: 0, color: 'var(--gold)', opacity: 0.75 }}>
                        Meanwhile, other teams need what's on your other tabs.
                      </p>
                    </div>
                  ) : row.isRocket ? (
                    isCaptain ? (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: 'var(--gold)' }}>
                          <RocketIcon part="body" size={40} />
                        </div>
                        <p className="lc-faint" style={{ marginBottom: 14 }}>This is your slot — no code needed. Place it when everyone's watching.</p>
                        <button className="lc-btn lc-btn-gold" style={{ width: '100%' }} onClick={() => submitRocket(row.slot)}>
                          Place slot {row.slot}
                        </button>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: 'var(--gold)' }}>
                          <RocketIcon part="body" size={40} />
                        </div>
                        <p className="lc-faint">Unlocked and ready. {captainName || 'Your captain'} will place it live.</p>
                      </div>
                    )
                  ) : isCaptain ? (
                    <div>
                      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                        <input className="lc-input" placeholder="Slot #" inputMode="numeric"
                          value={inputs[idx]?.slot || ''} onChange={(e) => updateInput(idx, 'slot', e.target.value)} />
                        <input className="lc-input" placeholder="Code" style={{ textTransform: 'uppercase' }}
                          value={inputs[idx]?.code || ''} onChange={(e) => updateInput(idx, 'code', e.target.value)} />
                      </div>
                      <button className="lc-btn lc-btn-primary" style={{ width: '100%' }} onClick={() => submitPlacement(idx)}>Place piece</button>
                    </div>
                  ) : (
                    <p className="lc-faint" style={{ textAlign: 'center' }}>
                      Still waiting on a code and slot. {captainName || 'Your captain'} will enter them here once found.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'holding' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="lc-faint" style={{ marginTop: 0 }}>Read these codes to the owning team when they find you.</p>
            {holding.length === 0 ? (
              <div className="lc-card" style={{ padding: '16px 18px' }}>
                <p style={{ margin: 0, color: 'var(--ink-dim)' }}>You don't have a code to share right now — a teammate might.</p>
              </div>
            ) : holding.map((h, i) => (
              <div key={i} className="lc-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: h.placed ? 0.4 : 1 }}>
                <span style={{ fontWeight: 600 }}>Section {h.section}</span>
                <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>{h.code}</span>
                <span className="lc-faint" style={{ margin: 0 }}>Team {h.ownerTeamNumber}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'legend' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="lc-faint" style={{ marginTop: 0 }}>Read these slot numbers to the owning team when they find you.</p>
            {legend.length === 0 ? (
              <div className="lc-card" style={{ padding: '16px 18px' }}>
                <p style={{ margin: 0, color: 'var(--ink-dim)' }}>You don't have a slot to share right now — a teammate might.</p>
              </div>
            ) : legend.map((l, i) => (
              <div key={i} className="lc-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: l.placed ? 0.4 : 1 }}>
                <span style={{ fontWeight: 600 }}>Section {l.section}</span>
                <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 22, fontWeight: 700 }}>Slot {l.slot}</span>
                <span className="lc-faint" style={{ margin: 0 }}>Team {l.ownerTeamNumber}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'team' && (
          <div className="lc-fadein" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p className="lc-faint" style={{ marginTop: 0 }}>
              Your team for the rest of the session. Find these people if you get separated.
            </p>
            {teammates.length > 0 ? (
              teammates.map((n, i) => (
                <div key={i} className="lc-teammate" style={{ animationDelay: `${i * 40}ms` }}>{n}</div>
              ))
            ) : (
              <div className="lc-teammate" style={{ opacity: 0.6, fontStyle: 'italic' }}>No one else on your team yet</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   PROJECTOR VIEW
   ============================================================ */
function QrToggle({ joinUrl }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} style={{
        position: 'absolute', bottom: 20, right: 24, zIndex: 20,
        padding: '9px 16px', borderRadius: 999, border: '1px solid rgba(255,255,255,.2)',
        background: 'rgba(0,0,0,.4)', color: '#f5f0e8', fontSize: 13, fontWeight: 600,
        backdropFilter: 'blur(8px)', cursor: 'pointer', display: open ? 'none' : 'block',
      }}>
        ⌗ QR code
      </button>
      {open && (
        <div className="lc-fadein" style={{
          position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(7,8,11,.88)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20,
        }}>
          <button onClick={() => setOpen(false)} style={{
            position: 'absolute', top: 24, right: 28, width: 42, height: 42, borderRadius: '50%',
            border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.06)', color: '#fff',
            fontSize: 20, cursor: 'pointer',
          }}>✕</button>
          <div style={{ padding: 22, borderRadius: 26, background: '#fdfaf5', boxShadow: '0 0 70px rgba(232,185,35,.22)' }}>
            <QRCodeSVG value={joinUrl} size={320} bgColor="#fdfaf5" fgColor="#14100c" level="M" />
          </div>
          <p style={{ fontSize: 18, color: 'rgba(245,240,232,.6)' }}>{joinUrl.replace(/^https?:\/\//, '')}</p>
        </div>
      )}
    </>
  );
}

// Rocket spine segments (slots 3, 8, 13) — wordless by design, per the brief.
// Used only as a pre-placement placeholder before the real artwork reveals.
const ROCKET_PARTS = {
  nose: 'M12 2c2.5 3 4 6 4 9H8c0-3 1.5-6 4-9zm0 5.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z',
  body: 'M8 2h8v16H8V2zm0 5L4 11v6l4-3m8-8l4 4v6l-4-3m-6 5h4',
  flame: 'M8 2h8v6H8V2zm4 6c2 3 3.5 5 3.5 7.5a3.5 3.5 0 01-7 0C8.5 13 10 11 12 8zm-4 2l-2 4m10-4l2 4',
};

function RocketIcon({ part, size = 28, strokeWidth = 1.7, style }) {
  const d = ROCKET_PARTS[part] || ROCKET_PARTS.body;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d={d} />
    </svg>
  );
}

// Crops one tile out of /public/final-puzzle.jpg for a given board slot.
// The image is a fixed 5-across x 4-down grid — this only shows correctly
// once a piece is actually placed, since slot position is public at that
// point but not before (matches "no preview of the finished artwork").
function PuzzleCrop({ slot, size, fill, rounded = 10, style }) {
  const idx = slot - 1;
  const col = idx % 5, row = Math.floor(idx / 5);
  const bgPosX = (col / 4) * 100;
  const bgPosY = (row / 3) * 100;
  const dims = fill ? { width: '100%', height: '100%' } : { width: size, height: size };
  return (
    <div style={{
      ...dims,
      borderRadius: rounded,
      overflow: 'hidden',
      backgroundImage: "url('/final-puzzle.jpg')",
      backgroundSize: '500% 400%',
      backgroundPosition: `${bgPosX}% ${bgPosY}%`,
      backgroundRepeat: 'no-repeat',
      flexShrink: 0,
      ...style,
    }} />
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

// Shrinks text with an ellipsis until it fits maxWidth — protects the block
// layout from full names (first + middle + last) overflowing the card.
function truncateToWidth(ctx, text, maxWidth) {
  if (!text) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

// Grid cell for team block i (0-9), 5 columns x 2 rows, offset below the top bar.
function teamBlockRect(i, w, h) {
  const topOffset = TOP_BAR_HEIGHT + 16;
  const margin = Math.max(20, w * 0.015);
  const gutter = 14;
  const cellW = (w - margin * 2 - gutter * 4) / 5;
  const cellH = (h - topOffset - margin - gutter) / 2;
  const col = i % 5, row = Math.floor(i / 5);
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

  const [jigsawPieces, setJigsawPieces] = useState([]);
  const [jigsawTeams, setJigsawTeams] = useState([]);
  const [zoomPiece, setZoomPiece] = useState(null);
  const zoomTokenRef = useRef(0);
  const [jigsawStartedAt, setJigsawStartedAt] = useState(null);
  const [jigsawClockRunning, setJigsawClockRunning] = useState(false);
  // Detected from the real file so the grid's true shape matches the
  // artwork exactly — no more forcing square cells onto a non-square image.
  const [puzzleAspect, setPuzzleAspect] = useState(1.25); // 5:4 fallback until loaded
  const [showCompleteBoom, setShowCompleteBoom] = useState(false);
  const prevJigsawStateRef = useRef(null);

  const joinUrl = `${window.location.origin}/`;
  const clock = useElapsedClock(jigsawStartedAt, jigsawClockRunning);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) return;
      const raw = img.naturalWidth / img.naturalHeight;
      // Clamp to a sane range regardless of the file's actual proportions —
      // an unclamped extreme ratio (very wide or very tall) is exactly what
      // collapsed the grid into a thin strip before this guard existed.
      const clamped = Math.min(Math.max(raw, 0.7), 2.0);
      setPuzzleAspect(clamped);
    };
    img.onerror = () => setPuzzleAspect(1.25); // couldn't load — keep the safe 5:4 fallback
    img.src = '/final-puzzle.jpg';
  }, []);

  // Fires once, right when the board actually finishes — a quick flash and
  // a connecting mesh sweeping across every piece, then settles into a
  // quieter persistent glow for as long as the board holds its final state.
  useEffect(() => {
    if (sessionState === 'complete' && prevJigsawStateRef.current !== 'complete') {
      setShowCompleteBoom(true);
      setTimeout(() => setShowCompleteBoom(false), 3200);
    }
    prevJigsawStateRef.current = sessionState;
  }, [sessionState]);

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

  // Global repulsion is tuned for nodes roaming the full screen — once
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
    // simulation is kept only so existing references stay valid — running it
    // would fight both: its charge force pushes nodes to the screen edges, and
    // its decaying alpha freezes clusters mid-flight before they reach a box.
    sim.stop();

    function drawTeamBlocks(w, h, now) {
      teamsRef.current.forEach((t, i) => {
        const rect = teamBlockRect(i, w, h);

        ctx.save();
        pathRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 16);
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = t.colour + '77';
        ctx.shadowColor = t.colour;
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.font = "700 15px Poppins, system-ui, sans-serif";
        ctx.fillStyle = t.colour;
        ctx.textAlign = 'left';
        ctx.fillText(`TEAM ${t.number}`, rect.x + 14, rect.y + 24);
        ctx.font = "500 11px Inter, system-ui, sans-serif";
        ctx.fillStyle = 'rgba(245,240,232,.4)';
        ctx.textAlign = 'right';
        ctx.fillText(`${t.memberIds.length}`, rect.x + rect.w - 14, rect.y + 24);
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

          ctx.font = "500 10px Inter, system-ui, sans-serif";
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
      if (activityRef.current === 'jigsaw') {
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
          // Continuous small jitter — without this a node's path is a
          // perfectly straight bounce forever, and enough random initial
          // angles end up nearly edge-parallel, which is why older nodes
          // (more elapsed time) were the ones ending up stuck on the walls.
          // No pull toward center — nodes are free to roam the whole
          // screen, edges and corners included.
          n.wanderVx += (Math.random() - 0.5) * 30 * dt;
          n.wanderVy += (Math.random() - 0.5) * 30 * dt;
        });

        // Mild mutual repulsion so nodes spread out instead of overlapping —
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
          if (n.x < r) { n.x = r; n.wanderVx = Math.abs(n.wanderVx); }
          if (n.x > w - r) { n.x = w - r; n.wanderVx = -Math.abs(n.wanderVx); }
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
      setJigsawStartedAt(state.session.jigsawStartedAt);
      setJigsawClockRunning(state.session.jigsawClockRunning);
      if (state.jigsaw) {
        setJigsawPieces(state.jigsaw.pieces);
        setJigsawTeams(state.jigsaw.teams);
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

    socket.on('session_update', (session) => {
      setActivity(session.activity || 'constellation');
      setSessionState(session.state);
      setJigsawStartedAt(session.jigsawStartedAt);
      setJigsawClockRunning(session.jigsawClockRunning);
    });

    socket.on('teams_formed', ({ teams }) => {
      setTeams(teams); setSessionState('teams_formed'); setShowFormingBanner(true);
      // Scatter outward first — nodes keep wandering until targets are
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

    socket.on('jigsaw_started', (data) => {
      setActivity('jigsaw'); setJigsawPieces(data.pieces); setJigsawTeams(data.teams);
      setJigsawStartedAt(data.session.jigsawStartedAt); setJigsawClockRunning(true);
    });
    socket.on('jigsaw_board_update', (data) => { setJigsawPieces(data.pieces); setJigsawTeams(data.teams); });
    socket.on('jigsaw_piece_placed', (piece) => {
      const token = ++zoomTokenRef.current;
      setZoomPiece(piece);
      setTimeout(() => {
        if (zoomTokenRef.current === token) setZoomPiece(null);
      }, 6000);
    });
    socket.on('jigsaw_act2_unlocked', () => {});

    socket.on('reset', () => {
      nodesRef.current = []; persistentEdgesRef.current = []; flashEdgesRef.current = [];
      setTeams([]); setSessionState('idle'); setJoinedCount(0); setSubmittedCount(0);
      setActivity('constellation'); setJigsawPieces([]); setJigsawTeams([]);
      stateRef.current = 'idle';
      updatePhysicsForPhase();
      if (simRef.current) { simRef.current.nodes([]); }
    });

    return () => {
      socket.off('state_sync'); socket.off('participants_update');
      socket.off('answer_received'); socket.off('submitted_update'); socket.off('session_update'); socket.off('teams_formed');
      socket.off('jigsaw_started'); socket.off('jigsaw_board_update'); socket.off('jigsaw_piece_placed');
      socket.off('jigsaw_act2_unlocked'); socket.off('reset');
    };
  }, [ensureNode]);

  function applyTeamPositions(teamList) {
    const { w, h } = dims.current;
    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // sunflower-pattern spacing
    teamList.forEach((team, i) => {
      const rect = teamBlockRect(i, w, h);
      const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2 + 10;
      const clusterR = Math.min(rect.w, rect.h) * 0.36;
      team.centre = { x: cx, y: cy };
      const n = team.memberIds.length || 1;
      team.memberIds.forEach((pid, idx) => {
        const node = nodesRef.current.find((nn) => nn.id === pid);
        if (!node) return;
        // Sunflower distribution: sqrt radial spacing keeps density even
        // across the whole disc instead of cramming everyone onto 1-2 thin
        // rings, so names have real breathing room between them.
        const t = (idx + 0.5) / n;
        const r = clusterR * Math.sqrt(t);
        const angle = idx * GOLDEN_ANGLE;
        node.teamTarget = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
        node.colour = team.colour; node.radius = 6.5;
      });
    });
    teamsRef.current = teamList;
  }

  if (activity === 'jigsaw') {
    return (
      <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#07080b', color: '#f5f0e8', fontFamily: "'Inter',sans-serif" }}>
        <div style={{ position: 'absolute', top: 22, left: 30, display: 'flex', alignItems: 'center', gap: 16 }}>
          <img src="/logo.png" alt="" style={{ height: 34 }} />
          <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: 3 }}>{clock}</span>
        </div>

        <div style={{
          position: 'absolute', top: 90, left: '50%', transform: 'translateX(-50%)',
          display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gridTemplateRows: 'repeat(4, 1fr)', gap: 10,
          // Bounded by width AND height (whichever is tighter), and shaped to
          // the artwork's real aspect ratio (detected on load) rather than an
          // assumed 5:4 — this is what was distorting/compressing every tile.
          width: `min(76vw, calc((100vh - 130px) * ${puzzleAspect}), 1100px)`,
          aspectRatio: puzzleAspect,
        }}>
          {jigsawPieces.map((p) => {
            const teamColour = jigsawTeams.find((t) => t.number === p.ownerTeamNumber)?.colour;
            return (
              <div key={p.slot} className={`lc-jig-slot ${p.placed ? 'placed' : ''} ${p.locked ? 'locked' : ''}`}
                style={{ borderColor: p.placed ? teamColour + '88' : undefined, padding: 0 }}>
                {p.placed ? (
                  <PuzzleCrop slot={p.slot} fill rounded={9} />
                ) : (
                  <span style={{ opacity: 0.3, fontSize: 13 }}>{p.slot}</span>
                )}
              </div>
            );
          })}

          {sessionState === 'complete' && (
            <svg
              viewBox="0 0 5 4" preserveAspectRatio="none"
              style={{ gridColumn: '1 / -1', gridRow: '1 / -1', pointerEvents: 'none', position: 'relative', zIndex: 5, width: '100%', height: '100%' }}
            >
              {Array.from({ length: 20 }).map((_, idx) => {
                const col = idx % 5, row = Math.floor(idx / 5);
                const cx = col + 0.5, cy = row + 0.5;
                const lines = [];
                if (col < 4) lines.push({ x1: cx, y1: cy, x2: cx + 1, y2: cy, key: `h${idx}` });
                if (row < 3) lines.push({ x1: cx, y1: cy, x2: cx, y2: cy + 1, key: `v${idx}` });
                return lines.map((l) => (
                  <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                    stroke="#e8b923" strokeWidth={0.012} vectorEffect="non-scaling-stroke"
                    style={{
                      animation: showCompleteBoom
                        ? 'lc-meshdraw 1s ease-out both'
                        : 'lc-meshglow 3.5s ease-in-out infinite',
                      animationDelay: showCompleteBoom ? `${idx * 25}ms` : `${idx * 90}ms`,
                    }} />
                ));
              })}
            </svg>
          )}

          {showCompleteBoom && (
            <div style={{
              gridColumn: '1 / -1', gridRow: '1 / -1', pointerEvents: 'none', position: 'relative', zIndex: 6,
              background: 'radial-gradient(circle, rgba(232,185,35,.55) 0%, transparent 70%)',
              animation: 'lc-boomflash 1.1s ease-out both',
            }} />
          )}
        </div>

        {showCompleteBoom && (
          <div style={{
            position: 'absolute', bottom: '8%', left: '50%', transform: 'translateX(-50%)',
            pointerEvents: 'none', textAlign: 'center', animation: 'lc-completebanner 3.2s ease-out both',
          }}>
            <div style={{
              fontFamily: "'Poppins',sans-serif", fontWeight: 800, letterSpacing: '-0.02em',
              fontSize: 'clamp(28px,4vw,48px)', color: '#f5f0e8', textShadow: '0 0 40px rgba(232,185,35,.6)',
            }}>
              The picture is complete
            </div>
          </div>
        )}

        <div style={{ position: 'absolute', top: 90, right: 26, display: 'flex', flexDirection: 'column', gap: 8, width: 190 }}>
          {jigsawTeams.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: t.colour, boxShadow: `0 0 8px ${t.colour}` }} />
              <span style={{ flex: 1 }}>Team {t.number}</span>
              <span style={{ opacity: 0.5 }}>{t.placedCount}/2</span>
            </div>
          ))}
        </div>

        {zoomPiece && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(7,8,11,.92)', display: 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28,
            animation: 'lc-zoomin .4s ease-out both',
          }}>
            <PuzzleCrop slot={zoomPiece.slot} size={340} rounded={24}
              style={{ boxShadow: '0 30px 90px rgba(0,0,0,.6), 0 0 70px rgba(232,185,35,.3)', border: '1px solid rgba(232,185,35,.35)' }} />
            <span className="lc-badge">Delivered by Team {zoomPiece.ownerTeamNumber}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#07080b' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0 }} />
      <QrToggle joinUrl={joinUrl} />

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
              {sessionState === 'teams_formed' ? 'Team Formation' : 'Constellation'}
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
          <div style={{ flex: 1, textAlign: 'right', fontSize: 11.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(245,240,232,.4)' }}>
            Convey Meaning. Create Significance.
          </div>
        </div>
      )}

      {showFormingBanner && (
        <div className="lc-fadein" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', background: 'radial-gradient(circle, rgba(7,8,11,.72) 0%, transparent 65%)' }}>
          <div style={{ fontSize: 13, letterSpacing: '.3em', textTransform: 'uppercase', color: 'rgba(232,185,35,.8)', marginBottom: 14, fontWeight: 600 }}>Forming</div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 'clamp(44px,7vw,104px)', letterSpacing: '-0.03em', color: '#f5f0e8', textShadow: '0 0 60px rgba(232,87,26,.6)' }}>Ten Teams</div>
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
  const [jigsawTeams, setJigsawTeams] = useState([]);
  const [jigsawStartedAt, setJigsawStartedAt] = useState(null);
  const [jigsawClockRunning, setJigsawClockRunning] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const clock = useElapsedClock(jigsawStartedAt, jigsawClockRunning);

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
      setJigsawStartedAt(state.session.jigsawStartedAt);
      setJigsawClockRunning(state.session.jigsawClockRunning);
      if (state.jigsaw) setJigsawTeams(state.jigsaw.teams);
    });
    socket.on('participants_update', (p) => { setParticipants(p); setJoinedCount(Object.keys(p).length); });
    socket.on('submitted_update', ({ submitted }) => setSubmittedCount(submitted));
    socket.on('session_update', (session) => {
      setActivity(session.activity || 'constellation'); setSessionState(session.state);
      setJigsawStartedAt(session.jigsawStartedAt); setJigsawClockRunning(session.jigsawClockRunning);
    });
    socket.on('teams_formed', ({ teams }) => { setTeams(teams); setSessionState('teams_formed'); });
    socket.on('jigsaw_started', (data) => {
      setActivity('jigsaw'); setJigsawTeams(data.teams); setJigsawStartedAt(data.session.jigsawStartedAt); setJigsawClockRunning(true);
    });
    socket.on('jigsaw_board_update', (data) => setJigsawTeams(data.teams));
    socket.on('reset', () => {
      setActivity('constellation'); setSessionState('idle'); setJoinedCount(0); setSubmittedCount(0);
      setTeams([]); setParticipants({}); setJigsawTeams([]);
    });
    return () => {
      socket.off('state_sync'); socket.off('participants_update'); socket.off('submitted_update');
      socket.off('session_update'); socket.off('teams_formed'); socket.off('jigsaw_started');
      socket.off('jigsaw_board_update'); socket.off('reset');
    };
  }, []);

  function startQuiz() { socket.emit('facilitator_start_quiz'); }
  function makeTeams() { socket.emit('facilitator_make_teams'); }
  function resetAll() {
    setConfirm({
      title: 'Reset the entire session?',
      message: 'All participants, answers, teams and puzzle progress will be cleared. Everyone will be sent back to the join screen.',
      confirmLabel: 'Reset everything',
      danger: true,
      onConfirm: () => socket.emit('facilitator_reset'),
    });
  }
  function startJigsaw() {
    setConfirm({
      title: 'Start the jigsaw puzzle?',
      message: 'Every phone will switch over to the puzzle view and the room clock starts running.',
      confirmLabel: 'Start puzzle',
      onConfirm: () => socket.emit('facilitator_start_jigsaw'),
    });
  }
  function restartJigsaw() {
    setConfirm({
      title: 'Restart the jigsaw?',
      message: 'Fresh transfer codes will be generated and the board resets to empty. Teams stay as they are.',
      confirmLabel: 'Restart puzzle',
      danger: true,
      onConfirm: () => socket.emit('facilitator_restart_jigsaw'),
    });
  }
  function sendHint(teamNumber) { socket.emit('facilitator_jigsaw_hint', { teamNumber }); }
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
            <span className="lc-badge">{activity} · {sessionState}</span>
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
                    Once you start, every joined phone gets all {questions.length || 6} questions at once — people answer at their own pace, no need to push each question.
                  </p>
                  <button className="lc-btn lc-btn-primary" onClick={startQuiz} style={{ width: '100%' }}>Start the quiz</button>
                </>
              )}
              {sessionState === 'quiz_open' && (
                <>
                  <p style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 500 }}>Quiz is open</p>
                  <p className="lc-faint" style={{ marginTop: 0 }}>People are answering at their own pace. You never need everyone to finish — make teams whenever the room feels ready.</p>
                </>
              )}
              {sessionState === 'teams_formed' && (
                <p style={{ margin: 0, fontSize: 16, color: 'var(--ink-dim)' }}>Teams are formed. Start the jigsaw puzzle below when ready.</p>
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
                <div className="lc-btn-row" style={{ marginTop: 18 }}>
                  <button className="lc-btn lc-btn-gold" onClick={startJigsaw} style={{ width: '100%' }}>✦ Start the Jigsaw Puzzle →</button>
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

        {activity === 'jigsaw' && (
          <>
            <div className="lc-stats-row" style={{ display: 'flex', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
              <div className="lc-stat-card"><div className="lc-stat-label">Room clock</div><div className="lc-stat-value" style={{ fontSize: 32 }}>{clock}</div></div>
              <div className="lc-stat-card"><div className="lc-stat-label">Act</div><div className="lc-stat-value">{sessionState === 'act1' ? 'One' : sessionState === 'act2' ? 'Two — rocket' : 'Complete'}</div></div>
              <div className="lc-stat-card"><div className="lc-stat-label">Placed</div><div className="lc-stat-value">{jigsawTeams.reduce((s, t) => s + (t.placedCount || 0), 0)}<span style={{ color: 'var(--ink-faint)', fontSize: 20 }}>/20</span></div></div>
            </div>

            <div className="lc-card" style={{ padding: 24, marginBottom: 18 }}>
              <h3 style={{ fontSize: 14, opacity: .75, margin: '0 0 16px', letterSpacing: '.05em', textTransform: 'uppercase' }}>Teams — hint if stuck</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                {jigsawTeams.map((t) => (
                  <div key={t.id} className="lc-card" style={{ padding: '12px 14px', border: `1px solid ${t.colour}33` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: t.colour }} />
                      <b>Team {t.number}</b>
                      <span style={{ marginLeft: 'auto', fontSize: 13, opacity: .6 }}>{t.placedCount}/2</span>
                    </div>
                    <button className="lc-btn lc-btn-outline" style={{ width: '100%', padding: '8px', fontSize: 13 }} onClick={() => sendHint(t.number)} disabled={t.placedCount >= 2}>
                      Reveal a hint
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="lc-card" style={{ padding: 24 }}>
              <div className="lc-btn-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button className="lc-btn lc-btn-outline" onClick={restartJigsaw}>Restart jigsaw (fresh codes)</button>
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