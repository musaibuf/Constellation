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
   GLOBAL THEME + STYLE INJECTION
   Carnelian palette: deep carnelian orange-red as the hero accent,
   near-black charcoal base, warm gold as a secondary accent,
   ten gemstone-inspired hues for the split teams.
   ============================================================ */
const THEME_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap');

  :root {
    --carnelian: #c1440e;
    --carnelian-bright: #e8571a;
    --carnelian-deep: #7a2a08;
    --gold: #e8b923;
    --charcoal: #0b0c10;
    --charcoal-2: #14151d;
    --charcoal-3: #1d1f2a;
    --ink: #f5f0e8;
    --ink-dim: rgba(245,240,232,0.6);
    --ink-faint: rgba(245,240,232,0.35);
  }

  * { box-sizing: border-box; }

  .lc-root {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    background: radial-gradient(ellipse at top, #1a1410 0%, var(--charcoal) 55%);
    color: var(--ink);
    min-height: 100vh;
    width: 100%;
    position: relative;
    overflow-x: hidden;
  }

  .lc-glow {
    position: fixed;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(circle at 15% 10%, rgba(193,68,14,0.18), transparent 45%),
      radial-gradient(circle at 85% 85%, rgba(232,185,35,0.10), transparent 40%);
    z-index: 0;
  }

  .lc-content { position: relative; z-index: 1; }

  @keyframes lc-pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.4); opacity: 0.5; }
  }
  @keyframes lc-fadein {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes lc-shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }

  .lc-fadein { animation: lc-fadein 0.5s ease-out both; }

  .lc-logo {
    height: 56px;
    filter: drop-shadow(0 0 20px rgba(193,68,14,0.35));
  }

  .lc-h1 {
    font-family: 'Poppins', sans-serif;
    font-weight: 800;
    font-size: clamp(28px, 6vw, 48px);
    margin: 0;
    letter-spacing: -0.02em;
  }
  .lc-h2 {
    font-family: 'Poppins', sans-serif;
    font-weight: 700;
    font-size: clamp(20px, 4.5vw, 30px);
    margin: 0 0 20px;
    line-height: 1.3;
  }
  .lc-sub { font-size: clamp(14px, 3vw, 17px); color: var(--ink-dim); margin: 0; }
  .lc-faint { font-size: 13px; color: var(--ink-faint); margin: 12px 0 0; }

  .lc-card {
    background: linear-gradient(160deg, rgba(29,31,42,0.9), rgba(20,21,29,0.9));
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 20px;
    backdrop-filter: blur(12px);
    box-shadow: 0 8px 32px rgba(0,0,0,0.35);
  }

  .lc-input {
    width: 100%;
    padding: 18px 20px;
    font-size: 18px;
    border-radius: 14px;
    border: 1.5px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.04);
    color: var(--ink);
    text-align: center;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .lc-input:focus {
    border-color: var(--carnelian-bright);
    box-shadow: 0 0 0 4px rgba(193,68,14,0.15);
  }

  .lc-btn {
    padding: 16px 24px;
    font-size: 16px;
    font-weight: 600;
    border-radius: 14px;
    border: none;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
    font-family: 'Inter', sans-serif;
  }
  .lc-btn:active { transform: scale(0.97); }
  .lc-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  .lc-btn-primary {
    background: linear-gradient(135deg, var(--carnelian-bright), var(--carnelian));
    color: #fff;
    box-shadow: 0 6px 20px rgba(193,68,14,0.35);
  }
  .lc-btn-primary:hover:not(:disabled) { box-shadow: 0 8px 28px rgba(193,68,14,0.5); }

  .lc-btn-outline {
    background: rgba(255,255,255,0.03);
    color: var(--ink);
    border: 1.5px solid rgba(255,255,255,0.15);
  }
  .lc-btn-outline:hover:not(:disabled) { border-color: rgba(255,255,255,0.35); }

  .lc-btn-danger {
    background: linear-gradient(135deg, #a83232, #7a1f1f);
    color: #fff;
    box-shadow: 0 6px 20px rgba(168,50,50,0.3);
  }

  .lc-option {
    width: 100%;
    padding: 20px 18px;
    font-size: 17px;
    font-weight: 500;
    border-radius: 16px;
    border: 1.5px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.03);
    color: var(--ink);
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }
  .lc-option:hover:not(:disabled) { border-color: var(--carnelian-bright); background: rgba(193,68,14,0.08); }
  .lc-option.lc-selected {
    background: linear-gradient(135deg, var(--carnelian-bright), var(--carnelian));
    border-color: var(--carnelian-bright);
    color: #fff;
    box-shadow: 0 6px 20px rgba(193,68,14,0.35);
  }
  .lc-option.lc-dimmed { opacity: 0.3; }

  .lc-pulse-dot {
    width: 14px; height: 14px; border-radius: 50%;
    background: var(--carnelian-bright);
    animation: lc-pulse 1.3s infinite ease-in-out;
    box-shadow: 0 0 20px rgba(232,87,26,0.6);
  }

  .lc-team-swatch {
    width: 72px; height: 72px; border-radius: 50%;
    box-shadow: 0 0 40px currentColor, inset 0 0 20px rgba(255,255,255,0.2);
  }

  .lc-teammate {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 14px 18px;
    font-size: 16px;
    font-weight: 500;
  }

  .lc-stat-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    padding: 18px 22px;
    min-width: 150px;
    flex: 1 1 150px;
  }
  .lc-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-faint); }
  .lc-stat-value { font-family: 'Poppins', sans-serif; font-size: 28px; font-weight: 700; margin-top: 4px; }

  .lc-select {
    padding: 14px 16px;
    border-radius: 12px;
    border: 1.5px solid rgba(255,255,255,0.12);
    background: var(--charcoal-3);
    color: var(--ink);
    font-size: 14px;
    flex: 1 1 160px;
  }

  .lc-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 14px; border-radius: 999px;
    font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
    background: rgba(193,68,14,0.15); color: var(--carnelian-bright);
    border: 1px solid rgba(193,68,14,0.3);
  }

  /* ---- Responsive breakpoints ---- */
  @media (max-width: 640px) {
    .lc-stats-row { flex-direction: column; }
    .lc-btn-row { flex-direction: column; }
    .lc-select { width: 100%; }
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
  const [screen, setScreen] = useState('join');
  const [name, setName] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joinedCount, setJoinedCount] = useState(0);
  const [question, setQuestion] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(null);
  const [locked, setLocked] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [team, setTeam] = useState(null);
  const [teammates, setTeammates] = useState([]);

  const restoreFromState = useCallback((state) => {
    const me = state.participants[participantId];
    setJoinedCount(Object.keys(state.participants).length);
    if (!me) { setScreen('join'); return; }

    if (state.session.state === 'split' || state.session.state === 'final') {
      const myTeam = state.teams.find((t) => t.id === me.teamId);
      if (myTeam) {
        setTeam(myTeam);
        setTeammates(myTeam.memberIds.filter((id) => id !== participantId)
          .map((id) => state.participants[id]?.name).filter(Boolean));
        setScreen('reveal');
        return;
      }
    }

    if (state.session.state === 'question' && state.session.currentQuestion !== null) {
      const q = state.questions[state.session.currentQuestion];
      setQuestion(q);
      setQuestionIndex(state.session.currentQuestion);
      const already = state.answers.find(
        (a) => a.participantId === participantId && a.questionIndex === state.session.currentQuestion
      );
      setSelectedOption(already ? already.optionIndex : null);
      setLocked(!!already);
      setScreen('question');
      return;
    }
    setScreen('waiting');
  }, [participantId]);

  useEffect(() => {
    socket.on('state_sync', restoreFromState);
    socket.on('joined', () => setScreen('waiting'));
    socket.on('join_error', ({ message }) => setJoinError(message));
    socket.on('participants_update', (p) => setJoinedCount(Object.keys(p).length));
    socket.on('question_live', ({ questionIndex: qi, question: q }) => {
      setQuestion(q); setQuestionIndex(qi); setSelectedOption(null); setLocked(false); setScreen('question');
    });
    socket.on('split_triggered', ({ teams, participants }) => {
      const me = participants[participantId];
      if (!me) return;
      const myTeam = teams.find((t) => t.id === me.teamId);
      if (myTeam) {
        setTeam(myTeam);
        setTeammates(myTeam.memberIds.filter((id) => id !== participantId)
          .map((id) => participants[id]?.name).filter(Boolean));
        setScreen('reveal');
      }
    });
    socket.on('reset', () => {
      setScreen('join'); setQuestion(null); setQuestionIndex(null);
      setSelectedOption(null); setLocked(false); setTeam(null); setTeammates([]);
    });
    return () => {
      socket.off('state_sync', restoreFromState);
      socket.off('joined'); socket.off('join_error'); socket.off('participants_update');
      socket.off('question_live'); socket.off('split_triggered'); socket.off('reset');
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
    if (locked || questionIndex === null) return;
    setSelectedOption(optionIndex); setLocked(true);
    socket.emit('submit_answer', { participantId, questionIndex, optionIndex });
  }

  return (
    <div className="lc-root">
      <div className="lc-glow" />
      <div className="lc-content" style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '36px 20px', maxWidth: 480, margin: '0 auto',
      }}>
        <img src="/logo.png" alt="Carnelian" className="lc-logo" style={{ marginBottom: 28 }} />

        {screen === 'join' && (
          <form onSubmit={handleJoin} className="lc-fadein" style={{ width: '100%', textAlign: 'center' }}>
            <span className="lc-badge" style={{ marginBottom: 16, display: 'inline-flex' }}>Welcome</span>
            <h1 className="lc-h1" style={{ marginBottom: 8 }}>Join the room</h1>
            <p className="lc-sub" style={{ marginBottom: 24 }}>First name plus last initial</p>
            <input className="lc-input" value={name} maxLength={20} placeholder="e.g. Ahmed K"
              onChange={(e) => setName(e.target.value)} autoFocus />
            {joinError && <p style={{ color: '#ff6b6b', fontSize: 14, marginTop: 10 }}>{joinError}</p>}
            <button className="lc-btn lc-btn-primary" type="submit" style={{ width: '100%', marginTop: 16 }}>
              Join now
            </button>
          </form>
        )}

        {screen === 'waiting' && (
          <div className="lc-fadein" style={{ textAlign: 'center', marginTop: 40 }}>
            <div className="lc-pulse-dot" style={{ margin: '0 auto 20px' }} />
            <h1 className="lc-h1">You're in</h1>
            <p className="lc-sub" style={{ marginTop: 10 }}>{joinedCount} people have joined</p>
            <p className="lc-faint">Waiting for the facilitator to start</p>
          </div>
        )}

        {screen === 'question' && question && (
          <div className="lc-fadein" style={{ width: '100%' }}>
            <h2 className="lc-h2">{question.text}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {question.options.map((opt, i) => (
                <button key={i} disabled={locked} onClick={() => handleAnswer(i)}
                  className={`lc-option ${selectedOption === i ? 'lc-selected' : ''} ${locked && selectedOption !== i ? 'lc-dimmed' : ''}`}>
                  {opt}
                </button>
              ))}
            </div>
            {locked && <p className="lc-faint" style={{ textAlign: 'center' }}>Locked in. Wait for the next question.</p>}
          </div>
        )}

        {screen === 'reveal' && team && (
          <div className="lc-fadein" style={{ textAlign: 'center', width: '100%' }}>
            <p className="lc-faint">Your team is</p>
            <h1 className="lc-h1" style={{ color: team.colour, margin: '6px 0 20px' }}>{team.name}</h1>
            <div className="lc-team-swatch" style={{ background: team.colour, color: team.colour, margin: '0 auto 24px' }} />
            <p className="lc-sub" style={{ marginBottom: 12 }}>Teammates</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {teammates.map((n, i) => <div key={i} className="lc-teammate">{n}</div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   PROJECTOR VIEW (laptop, fullscreen canvas)
   ============================================================ */
function ProjectorView() {
  const canvasRef = useRef(null);
  const simRef = useRef(null);
  const nodesRef = useRef([]);
  const persistentEdgesRef = useRef([]);
  const flashEdgesRef = useRef([]);
  const participantsRef = useRef({});
  const questionsRef = useRef([]);
  const rafRef = useRef(null);
  const dims = useRef({ w: window.innerWidth, h: window.innerHeight });

  const [sessionState, setSessionState] = useState('idle');
  const [joinedCount, setJoinedCount] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [teams, setTeams] = useState([]);

  const joinUrl = `${window.location.origin}/`;

  const ensureNode = useCallback((id, name) => {
    let node = nodesRef.current.find((n) => n.id === id);
    if (!node) {
      node = {
        id, name,
        x: dims.current.w / 2 + (Math.random() - 0.5) * 200,
        y: dims.current.h / 2 + (Math.random() - 0.5) * 200,
        vx: 0, vy: 0, colour: '#e8571a', radius: 7, teamId: null, answerVector: {},
      };
      nodesRef.current.push(node);
      if (simRef.current) { simRef.current.nodes(nodesRef.current); simRef.current.alpha(0.6).restart(); }
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
        if (shared >= 3) edges.push({ a: a.id, b: b.id });
      }
    }
    persistentEdgesRef.current = edges;
  }

  function affinityForce(alpha) {
    const nodes = nodesRef.current;
    const byQuestionOption = {};
    nodes.forEach((n) => {
      Object.entries(n.answerVector).forEach(([q, opt]) => {
        const key = `${q}-${opt}`;
        (byQuestionOption[key] = byQuestionOption[key] || []).push(n);
      });
    });
    Object.values(byQuestionOption).forEach((group) => {
      if (group.length < 2) return;
      const cx = d3.mean(group, (n) => n.x), cy = d3.mean(group, (n) => n.y);
      group.forEach((n) => { n.vx += (cx - n.x) * alpha * 0.02; n.vy += (cy - n.y) * alpha * 0.02; });
    });
  }

  function teamForce(alpha) {
    nodesRef.current.forEach((n) => {
      if (n.teamTarget) {
        n.vx += (n.teamTarget.x - n.x) * alpha * 0.08;
        n.vy += (n.teamTarget.y - n.y) * alpha * 0.08;
      }
    });
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    function resize() {
      dims.current = { w: window.innerWidth, h: window.innerHeight };
      canvas.width = dims.current.w; canvas.height = dims.current.h;
    }
    resize();
    window.addEventListener('resize', resize);

    const sim = d3.forceSimulation(nodesRef.current)
      .force('charge', d3.forceManyBody().strength(-40))
      .force('center', d3.forceCenter(dims.current.w / 2, dims.current.h / 2))
      .force('collide', d3.forceCollide().radius(12))
      .alphaDecay(0.02)
      .on('tick', () => { affinityForce(sim.alpha()); teamForce(sim.alpha()); });
    simRef.current = sim;

    function draw() {
      const { w, h } = dims.current;
      ctx.clearRect(0, 0, w, h);
      const grad = ctx.createRadialGradient(w / 2, h * 0.3, 0, w / 2, h * 0.3, Math.max(w, h) * 0.8);
      grad.addColorStop(0, '#1a1410'); grad.addColorStop(1, '#0b0c10');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

      const now = Date.now();
      ctx.lineWidth = 1;
      persistentEdgesRef.current.forEach(({ a, b }) => {
        const na = nodesRef.current.find((n) => n.id === a), nb = nodesRef.current.find((n) => n.id === b);
        if (!na || !nb) return;
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.beginPath(); ctx.moveTo(na.x, na.y); ctx.lineTo(nb.x, nb.y); ctx.stroke();
      });

      flashEdgesRef.current = flashEdgesRef.current.filter((e) => now - e.bornAt < 1500);
      flashEdgesRef.current.forEach(({ a, b, bornAt }) => {
        const na = nodesRef.current.find((n) => n.id === a), nb = nodesRef.current.find((n) => n.id === b);
        if (!na || !nb) return;
        const age = (now - bornAt) / 1500;
        ctx.strokeStyle = `rgba(232,185,35,${1 - age})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(na.x, na.y); ctx.lineTo(nb.x, nb.y); ctx.stroke();
      });

      nodesRef.current.forEach((n) => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.shadowColor = n.colour; ctx.shadowBlur = 12;
        ctx.fillStyle = n.colour; ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = '11px Inter, sans-serif';
        ctx.fillStyle = 'rgba(245,240,232,0.8)';
        ctx.fillText(n.name || '', n.x + n.radius + 4, n.y + 4);
      });

      rafRef.current = requestAnimationFrame(draw);
    }
    draw();

    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(rafRef.current); sim.stop(); };
  }, []);

  useEffect(() => {
    socket.on('state_sync', (state) => {
      questionsRef.current = state.questions;
      participantsRef.current = state.participants;
      setJoinedCount(Object.keys(state.participants).length);
      setSessionState(state.session.state);
      setCurrentQuestion(state.session.currentQuestion);
      setTeams(state.teams);
      Object.values(state.participants).forEach((p) => {
        const node = ensureNode(p.id, p.name);
        state.answers.filter((a) => a.participantId === p.id)
          .forEach((a) => { node.answerVector[a.questionIndex] = a.optionIndex; });
      });
      recomputePersistentEdges();
      if (state.session.state === 'split' || state.session.state === 'final') applyTeamPositions(state.teams);
    });

    socket.on('participants_update', (participants) => {
      participantsRef.current = participants;
      setJoinedCount(Object.keys(participants).length);
      Object.values(participants).forEach((p) => ensureNode(p.id, p.name));
      setSessionState((s) => (s === 'idle' ? 'populating' : s));
    });

    socket.on('question_live', ({ questionIndex }) => {
      setSessionState('question'); setCurrentQuestion(questionIndex);
      if (simRef.current) simRef.current.alpha(0.5).restart();
    });

    socket.on('answer_received', (answer) => {
      const node = nodesRef.current.find((n) => n.id === answer.participantId);
      if (node) node.answerVector[answer.questionIndex] = answer.optionIndex;
      recomputePersistentEdges();
      const peers = nodesRef.current.filter((n) =>
        n.id !== answer.participantId && n.answerVector[answer.questionIndex] === answer.optionIndex);
      d3.shuffle(peers.slice()).slice(0, 3).forEach((p) => {
        flashEdgesRef.current.push({ a: answer.participantId, b: p.id, bornAt: Date.now() });
      });
      if (simRef.current) simRef.current.alpha(Math.max(simRef.current.alpha(), 0.25)).restart();
    });

    socket.on('session_update', (session) => {
      setSessionState(session.state); setCurrentQuestion(session.currentQuestion);
      if (session.state === 'clustered' && simRef.current) simRef.current.alpha(0.4).restart();
    });

    socket.on('split_triggered', ({ teams, participants }) => {
      setTeams(teams); participantsRef.current = participants; setSessionState('split');
      applyTeamPositions(teams);
      if (simRef.current) simRef.current.alpha(1).restart();
      setTimeout(() => setSessionState('final'), 10000);
    });

    socket.on('reset', () => {
      nodesRef.current = []; persistentEdgesRef.current = []; flashEdgesRef.current = [];
      participantsRef.current = {}; setTeams([]); setSessionState('idle'); setCurrentQuestion(null);
      if (simRef.current) { simRef.current.nodes([]); simRef.current.alpha(1).restart(); }
    });

    return () => {
      socket.off('state_sync'); socket.off('participants_update'); socket.off('question_live');
      socket.off('answer_received'); socket.off('session_update'); socket.off('split_triggered'); socket.off('reset');
    };
  }, [ensureNode]);

  function applyTeamPositions(teamList) {
    const w = dims.current.w, h = dims.current.h;
    const cols = 5, rows = 2;
    const cellW = w / cols, cellH = h / rows;
    teamList.forEach((team, i) => {
      const cx = cellW * (i % cols) + cellW / 2, cy = cellH * Math.floor(i / cols) + cellH / 2;
      team.memberIds.forEach((pid, idx) => {
        const node = nodesRef.current.find((n) => n.id === pid);
        if (!node) return;
        const angle = (idx / team.memberIds.length) * Math.PI * 2;
        node.teamTarget = { x: cx + Math.cos(angle) * 60, y: cy + Math.sin(angle) * 60 };
        node.colour = team.colour;
      });
    });
  }

  const question = currentQuestion !== null ? questionsRef.current[currentQuestion] : null;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#0b0c10' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0 }} />

      {sessionState === 'idle' && (
        <div className="lc-fadein" style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 18, fontFamily: "'Inter', sans-serif",
        }}>
          <img src="/logo.png" alt="Carnelian" className="lc-logo" style={{ height: 90, marginBottom: 6 }} />
          <div className="lc-card" style={{ padding: 24 }}>
            <QRCodeSVG value={joinUrl} size={280} bgColor="transparent" fgColor="#f5f0e8" />
          </div>
          <p style={{ fontSize: 20, color: 'var(--ink-dim)' }}>{joinUrl}</p>
          <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: 32, fontWeight: 700 }}>{joinedCount} joined</p>
        </div>
      )}

      {sessionState === 'question' && question && (
        <div className="lc-fadein" style={{
          position: 'absolute', top: 0, left: 0, right: 0, padding: '36px 52px',
          background: 'linear-gradient(to bottom, rgba(11,12,16,0.92), transparent)',
        }}>
          <h1 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 'clamp(24px, 4vw, 38px)', margin: '0 0 18px' }}>
            {question.text}
          </h1>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {question.options.map((opt, i) => (
              <span key={i} style={{
                padding: '10px 20px', borderRadius: 999, fontSize: 16,
                border: '1px solid rgba(232,185,35,0.4)', background: 'rgba(232,185,35,0.08)', color: 'var(--gold)',
              }}>{opt}</span>
            ))}
          </div>
        </div>
      )}

      {(sessionState === 'split' || sessionState === 'final') && (
        <div style={{
          position: 'absolute', bottom: 20, left: 20, right: 20, display: 'flex',
          gap: 18, flexWrap: 'wrap', fontFamily: "'Inter', sans-serif", fontSize: 14,
        }}>
          {teams.map((t) => (
            <div key={t.id} className="lc-card" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.colour, boxShadow: `0 0 10px ${t.colour}` }} />
              {t.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   FACILITATOR VIEW (laptop / phone control panel)
   ============================================================ */
function FacilitatorView() {
  const [joinedCount, setJoinedCount] = useState(0);
  const [sessionState, setSessionState] = useState('idle');
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answerCount, setAnswerCount] = useState({ count: 0, total: 0 });
  const [participants, setParticipants] = useState({});
  const [teams, setTeams] = useState([]);
  const [moveParticipantId, setMoveParticipantId] = useState('');
  const [moveTeamId, setMoveTeamId] = useState('');

  useEffect(() => {
    socket.on('state_sync', (state) => {
      setQuestions(state.questions); setParticipants(state.participants);
      setJoinedCount(Object.keys(state.participants).length);
      setSessionState(state.session.state); setCurrentQuestion(state.session.currentQuestion);
      setTeams(state.teams);
      if (state.session.currentQuestion !== null) {
        const c = state.answers.filter((a) => a.questionIndex === state.session.currentQuestion).length;
        setAnswerCount({ count: c, total: Object.keys(state.participants).length });
      }
    });
    socket.on('participants_update', (p) => { setParticipants(p); setJoinedCount(Object.keys(p).length); });
    socket.on('question_live', ({ questionIndex }) => {
      setCurrentQuestion(questionIndex); setSessionState('question');
      setAnswerCount((prev) => ({ count: 0, total: prev.total }));
    });
    socket.on('answer_count', (data) => setAnswerCount(data));
    socket.on('session_update', (session) => { setSessionState(session.state); setCurrentQuestion(session.currentQuestion); });
    socket.on('split_triggered', ({ teams }) => { setTeams(teams); setSessionState('split'); });
    socket.on('reset', () => {
      setSessionState('idle'); setCurrentQuestion(null); setJoinedCount(0);
      setAnswerCount({ count: 0, total: 0 }); setTeams([]); setParticipants({});
    });
    return () => {
      socket.off('state_sync'); socket.off('participants_update'); socket.off('question_live');
      socket.off('answer_count'); socket.off('session_update'); socket.off('split_triggered'); socket.off('reset');
    };
  }, []);

  function nextQuestion() { socket.emit('facilitator_next_question'); }
  function prevQuestion() { socket.emit('facilitator_previous_question'); }
  function triggerSplit() {
    if (window.confirm('Trigger the team split? This cannot be undone without a reset.')) socket.emit('facilitator_trigger_split');
  }
  function resetAll() {
    if (window.confirm('Reset the whole session? All participants and answers will be cleared.')) socket.emit('facilitator_reset');
  }
  function moveParticipant() {
    if (!moveParticipantId || !moveTeamId) return;
    socket.emit('facilitator_move_participant', { participantId: moveParticipantId, teamId: moveTeamId });
  }
  function deleteParticipant(id) {
    if (window.confirm('Remove this participant?')) socket.emit('facilitator_delete_participant', { participantId: id });
  }

  const questionLabel = currentQuestion !== null && questions[currentQuestion]
    ? `Q${currentQuestion + 1} of ${questions.length}: ${questions[currentQuestion].text}`
    : 'No question live';

  return (
    <div className="lc-root">
      <div className="lc-glow" />
      <div className="lc-content lc-fadein" style={{ padding: '28px clamp(16px, 4vw, 48px)', maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <img src="/logo.png" alt="Carnelian" style={{ height: 40 }} />
          <div>
            <h1 className="lc-h1" style={{ fontSize: 'clamp(20px, 3vw, 26px)' }}>Facilitator Console</h1>
            <span className="lc-badge">{sessionState}</span>
          </div>
        </div>

        <div className="lc-stats-row" style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
          <div className="lc-stat-card">
            <div className="lc-stat-label">Joined</div>
            <div className="lc-stat-value">{joinedCount}</div>
          </div>
          <div className="lc-stat-card">
            <div className="lc-stat-label">Answered (current Q)</div>
            <div className="lc-stat-value">{answerCount.count} / {joinedCount}</div>
          </div>
          <div className="lc-stat-card">
            <div className="lc-stat-label">Question</div>
            <div className="lc-stat-value">{currentQuestion !== null ? currentQuestion + 1 : '—'}/{questions.length || 6}</div>
          </div>
        </div>

        <div className="lc-card" style={{ padding: 24, marginBottom: 20 }}>
          <p className="lc-sub" style={{ marginBottom: 16, fontSize: 16, color: 'var(--ink)' }}>{questionLabel}</p>
          <div className="lc-btn-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="lc-btn lc-btn-outline" onClick={prevQuestion}
              disabled={currentQuestion === null || currentQuestion === 0}>← Previous</button>
            <button className="lc-btn lc-btn-primary" onClick={nextQuestion}
              disabled={currentQuestion !== null && currentQuestion >= questions.length - 1}>Next question →</button>
          </div>
        </div>

        <div className="lc-card" style={{ padding: 24, marginBottom: 20 }}>
          <div className="lc-btn-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="lc-btn lc-btn-danger" onClick={triggerSplit}>✦ Trigger split</button>
            <button className="lc-btn lc-btn-outline" onClick={resetAll}>Reset to idle</button>
          </div>
        </div>

        {teams.length > 0 && (
          <div className="lc-card" style={{ padding: 24, marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, opacity: 0.8, margin: '0 0 14px' }}>Manual team override</h3>
            <div className="lc-btn-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <select className="lc-select" value={moveParticipantId} onChange={(e) => setMoveParticipantId(e.target.value)}>
                <option value="">Select participant</option>
                {Object.values(participants).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select className="lc-select" value={moveTeamId} onChange={(e) => setMoveTeamId(e.target.value)}>
                <option value="">Select team</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button className="lc-btn lc-btn-primary" onClick={moveParticipant}>Move</button>
            </div>
          </div>
        )}

        <div className="lc-card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 15, opacity: 0.8, margin: '0 0 14px' }}>Participants ({joinedCount})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
            {Object.values(participants).map((p) => (
              <div key={p.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'rgba(255,255,255,0.03)', padding: '10px 16px', borderRadius: 10, fontSize: 14,
              }}>
                <span>{p.name}</span>
                <button onClick={() => deleteParticipant(p.id)} style={{
                  padding: '5px 12px', borderRadius: 8, border: 'none', background: 'rgba(168,50,50,0.2)',
                  color: '#ff9a9a', fontSize: 12, cursor: 'pointer',
                }}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   APP ROOT — path-based routing, no router dependency
   ============================================================ */
export default function App() {
  useInjectTheme();
  const path = window.location.pathname;
  if (path.startsWith('/projector')) return <ProjectorView />;
  if (path.startsWith('/facilitator')) return <FacilitatorView />;
  return <ParticipantView />;
}