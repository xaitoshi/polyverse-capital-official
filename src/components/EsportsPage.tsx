import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// ── Live stream config ─────────────────────────────────────────────────────────
const LEAGUES = [
  { id: 'LCK', label: 'LCK', twitch: 'lck',  ytHandle: 'LCK'  },
  { id: 'LPL', label: 'LPL', twitch: null,    ytHandle: 'lpl'  },
  { id: 'LEC', label: 'LEC', twitch: 'lec',   ytHandle: 'LEC'  },
  { id: 'LCS', label: 'LCS', twitch: 'lcs',   ytHandle: 'LCS'  },
  { id: 'MSI', label: 'MSI / Worlds', twitch: 'riotgames', ytHandle: 'lolesports' },
] as const;

// ── Live stats types ───────────────────────────────────────────────────────────
interface TeamStats { gold: number; kills: number; towers: number; dragons: number }
interface GameStats {
  blueTeam: string; redTeam: string; gameTime: string;
  blue: TeamStats; red: TeamStats;
}
interface StatsSnapshot extends GameStats { timestamp: number }

// ── Tiny SVG line chart ────────────────────────────────────────────────────────
function DiffChart({ data, label, color }: {
  data: { t: number; diff: number }[];
  label: string;
  color: string;
}) {
  if (data.length < 2) return (
    <div className="h-24 flex items-center justify-center text-[10px] text-gray-700">
      {data.length < 1 ? 'No data yet' : 'Waiting for more data points…'}
    </div>
  );

  const W = 300, H = 80, PAD = 8;
  const diffs = data.map(d => d.diff);
  const min = Math.min(...diffs, 0);
  const max = Math.max(...diffs, 0);
  const range = max - min || 1;

  const toY = (v: number) => PAD + ((max - v) / range) * (H - PAD * 2);
  const toX = (i: number) => PAD + (i / (data.length - 1)) * (W - PAD * 2);

  const pts = data.map((d, i) => `${toX(i)},${toY(d.diff)}`).join(' ');
  const zeroY = toY(0);

  return (
    <div className="space-y-1">
      <div className="text-[10px] text-gray-500 tracking-wider">{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 80 }}>
        {/* zero line */}
        <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
        {/* area fill */}
        <polyline
          points={`${toX(0)},${zeroY} ${pts} ${toX(data.length - 1)},${zeroY}`}
          fill={color} fillOpacity={0.12} stroke="none"
        />
        {/* line */}
        <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
        {/* last point dot */}
        <circle cx={toX(data.length - 1)} cy={toY(diffs[diffs.length - 1])} r={3} fill={color} />
      </svg>
      <div className="flex justify-between text-[9px] font-mono">
        <span style={{ color }} className="font-bold">
          {diffs[diffs.length - 1] > 0 ? '+' : ''}{diffs[diffs.length - 1].toLocaleString()}
        </span>
        <span className="text-gray-700">{data.length} snapshots</span>
      </div>
    </div>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface TeamRecord { wins: number; total: number }
interface H2HRecord  { t1: string; t2: string; wins1: number; total: number }
interface ChampStat  { wins: number; total: number }
interface PlayerData { teams: string[]; champs: Record<string, ChampStat> }
interface EsportsDB {
  teams: Record<string, TeamRecord>;
  h2h:   Record<string, H2HRecord>;
  players: Record<string, PlayerData>;
  teamPlayers: Record<string, string[]>;
}
type SynergyDB = Record<string, { wins: number; total: number }>;

// ── Helpers ────────────────────────────────────────────────────────────────────
const pct = (w: number, t: number) => t === 0 ? 0 : w / t;
const pctStr = (w: number, t: number) => t === 0 ? 'N/A' : `${Math.round((w / t) * 100)}%`;

function h2hKey(a: string, b: string) {
  return `${[a,b].sort().join('|||')}`;
}

function synergyKey(a: string, b: string) {
  return `${[a,b].sort().join('+')}`;
}

interface SynergyPair { pair: string; wins: number; total: number }
function getSynergyData(synergies: SynergyDB, champs: string[]): { bonus: number; pairs: SynergyPair[] } {
  const filled = champs.filter(Boolean);
  const pairs: SynergyPair[] = [];
  let totalBonus = 0; let count = 0;
  for (let i = 0; i < filled.length; i++) {
    for (let j = i + 1; j < filled.length; j++) {
      const rec = synergies[synergyKey(filled[i], filled[j])];
      if (rec && rec.total > 0) {
        totalBonus += (rec.wins / rec.total) - 0.5;
        count++;
        pairs.push({ pair: `${filled[i]} + ${filled[j]}`, wins: rec.wins, total: rec.total });
      }
    }
  }
  pairs.sort((a, b) => b.wins / b.total - a.wins / a.total);
  return { bonus: count > 0 ? totalBonus / count : 0, pairs };
}

function getH2H(db: EsportsDB, a: string, b: string) {
  const key = h2hKey(a, b);
  const rec = db.h2h[key];
  if (!rec) return null;
  const winsA = rec.t1 === a ? rec.wins1 : rec.total - rec.wins1;
  return { winsA, winsB: rec.total - winsA, total: rec.total };
}

// Win probability model
// Weights: team overall 30% | h2h 25% | champ scores 45% | synergy bonus additive
function calcProb(
  db: EsportsDB,
  synergies: SynergyDB | null,
  teamA: string, teamB: string,
  champsA: string[], champsB: string[],
  rosterA: string[], rosterB: string[],
) {
  const recA = db.teams[teamA] ?? { wins: 0, total: 1 };
  const recB = db.teams[teamB] ?? { wins: 0, total: 1 };
  const wrA = pct(recA.wins, recA.total);
  const wrB = pct(recB.wins, recB.total);

  const h2h = getH2H(db, teamA, teamB);
  const h2hA = h2h ? pct(h2h.winsA, h2h.total) : 0.5;
  const h2hB = h2h ? pct(h2h.winsB, h2h.total) : 0.5;

  // Champion scores — only count slots where a champ is selected
  const champScoreFor = (players: string[], champs: string[]) => {
    const rates: number[] = [];
    players.forEach((p, i) => {
      const champ = champs[i];
      if (!champ || !db.players[p]) return;
      const cs = db.players[p].champs[champ];
      if (cs && cs.total > 0) rates.push(pct(cs.wins, cs.total));
    });
    return rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0.5;
  };

  const hasChamps = champsA.some(Boolean) || champsB.some(Boolean);
  const csA = champScoreFor(rosterA, champsA);
  const csB = champScoreFor(rosterB, champsB);

  // Synergy bonus — additive offset based on champion pair win rates vs 50% baseline
  const synDataA = synergies && hasChamps ? getSynergyData(synergies, champsA) : { bonus: 0, pairs: [] };
  const synDataB = synergies && hasChamps ? getSynergyData(synergies, champsB) : { bonus: 0, pairs: [] };
  const hasSynergy = synDataA.pairs.length > 0 || synDataB.pairs.length > 0;

  const baseA = hasChamps ? 0.30 * wrA + 0.25 * h2hA + 0.45 * csA
                          : 0.55 * wrA + 0.45 * h2hA;
  const baseB = hasChamps ? 0.30 * wrB + 0.25 * h2hB + 0.45 * csB
                          : 0.55 * wrB + 0.45 * h2hB;

  const wA = baseA + (hasSynergy ? 0.1 * synDataA.bonus : 0);
  const wB = baseB + (hasSynergy ? 0.1 * synDataB.bonus : 0);

  const total = wA + wB;
  return {
    probA: total === 0 ? 0.5 : wA / total,
    probB: total === 0 ? 0.5 : wB / total,
    wrA, wrB, h2hA, h2hB, csA, csB, hasChamps,
    synDataA, synDataB, hasSynergy,
    score: Math.round((total === 0 ? 0.5 : wA / total) * 100),
  };
}

// ── Autocomplete ───────────────────────────────────────────────────────────────
function Autocomplete({
  value, onChange, options, placeholder, className = ''
}: {
  value: string; onChange: (v: string) => void;
  options: string[]; placeholder: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const filtered = useMemo(() =>
    query.length < 1 ? options.slice(0, 20)
    : options.filter(o => o.toLowerCase().includes(query.toLowerCase())).slice(0, 20),
  [query, options]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); onChange(''); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 font-mono"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-[#0d0d0d] border border-white/10 rounded-lg max-h-52 overflow-y-auto shadow-xl">
          {filtered.map(o => (
            <button key={o} onMouseDown={() => { onChange(o); setQuery(o); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs font-mono text-gray-300 hover:bg-blue-500/10 hover:text-blue-300 transition-colors">
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ChampSelect ────────────────────────────────────────────────────────────────
function ChampSelect({
  champs, value, onChange, getImg,
}: {
  champs: Record<string, ChampStat>; value: string;
  onChange: (v: string) => void; getImg: (name: string) => string | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        if (query !== value) onChange(query);
      }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [query, value, onChange]);

  const sorted = Object.entries(champs).sort((a, b) => b[1].total - a[1].total);
  const filtered = query.length < 1
    ? sorted.slice(0, 15)
    : sorted.filter(([c]) => c.toLowerCase().includes(query.toLowerCase())).slice(0, 15);

  const knownChamp = champs[value];
  const selectedImg = value ? getImg(value) : null;

  return (
    <div ref={ref} className="relative flex-1">
      <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded px-2 py-1 focus-within:border-blue-500/50">
        {selectedImg && (
          <img src={selectedImg} alt={value} className="w-5 h-5 rounded-sm object-cover shrink-0" />
        )}
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="champion…"
          className="flex-1 bg-transparent text-xs font-mono text-gray-300 placeholder:text-gray-700 focus:outline-none min-w-0"
        />
        {value && !knownChamp && (
          <span className="text-[8px] text-yellow-600 shrink-0">no data</span>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-0.5 left-0 right-0 bg-[#0d0d0d] border border-white/10 rounded-lg max-h-52 overflow-y-auto shadow-xl">
          {filtered.map(([champ, stat]) => {
            const img = getImg(champ);
            return (
              <button key={champ} onMouseDown={() => { onChange(champ); setQuery(champ); setOpen(false); }}
                className="w-full text-left px-2 py-1.5 text-xs font-mono text-gray-300 hover:bg-blue-500/10 hover:text-blue-300 transition-colors flex items-center gap-2">
                {img
                  ? <img src={img} alt={champ} className="w-6 h-6 rounded-sm object-cover shrink-0" />
                  : <div className="w-6 h-6 rounded-sm bg-white/10 shrink-0" />
                }
                <span className="flex-1">{champ}</span>
                <span className="text-gray-600 text-[10px]">{pctStr(stat.wins, stat.total)} · {stat.total}g</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── WinBar ─────────────────────────────────────────────────────────────────────
function WinBar({ probA, teamA, teamB }: { probA: number; teamA: string; teamB: string }) {
  const pA = Math.round(probA * 100);
  const pB = 100 - pA;
  const color = pA >= 60 ? '#22c55e' : pA >= 50 ? '#3b82f6' : '#f97316';
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs font-mono mb-1">
        <span style={{ color }} className="font-bold">{teamA}</span>
        <span className="text-gray-500">WIN PROBABILITY</span>
        <span className="text-orange-400 font-bold">{teamB}</span>
      </div>
      <div className="flex h-8 rounded-lg overflow-hidden border border-white/10">
        <div className="flex items-center justify-center text-sm font-bold text-white transition-all"
          style={{ width: `${pA}%`, backgroundColor: color, opacity: 0.85 }}>
          {pA}%
        </div>
        <div className="flex items-center justify-center text-sm font-bold text-white transition-all"
          style={{ width: `${pB}%`, backgroundColor: '#f97316', opacity: 0.75 }}>
          {pB}%
        </div>
      </div>
    </div>
  );
}

// ── Positions ──────────────────────────────────────────────────────────────────
const POSITIONS = ['Top', 'Jungle', 'Mid', 'Bot', 'Support'];

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function EsportsPage() {
  const [db, setDb] = useState<EsportsDB | null>(null);
  const [synergies, setSynergies] = useState<SynergyDB | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');

  // Per-team: which player is in each position slot
  const [rosterA, setRosterA] = useState<string[]>(Array(5).fill(''));
  const [rosterB, setRosterB] = useState<string[]>(Array(5).fill(''));

  // Per-team: which champ each player picked
  const [champsA, setChampsA] = useState<string[]>(Array(5).fill(''));
  const [champsB, setChampsB] = useState<string[]>(Array(5).fill(''));

  // Player search tab
  const [playerSearch, setPlayerSearch] = useState('');

  // ── Live stream + AI analysis state ──────────────────────────────────────────
  const [selectedLeague, setSelectedLeague] = useState<typeof LEAGUES[number]['id']>('LCK');
  const [streamSource, setStreamSource] = useState<'twitch' | 'youtube'>('twitch');
  const [captureActive, setCaptureActive] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [gameStats, setGameStats] = useState<GameStats | null>(null);
  const [statsHistory, setStatsHistory] = useState<StatsSnapshot[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const captureVideoRef = useRef<HTMLVideoElement>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);
  const analysisIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const league = LEAGUES.find(l => l.id === selectedLeague)!;
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const twitchSrc = league.twitch
    ? `https://player.twitch.tv/?channel=${league.twitch}&parent=${hostname}&autoplay=false`
    : null;
  const youtubeSrc = `https://www.youtube.com/@${league.ytHandle}/live`;

  const captureAndAnalyze = useCallback(async () => {
    if (!captureVideoRef.current) return;
    const video = captureVideoRef.current;
    if (video.readyState < 2 || video.videoWidth === 0) return;

    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      // Draw full frame, then crop to the stream panel area:
      // left 65% (stream column) × top 30% (where LoL scoreboard overlay sits)
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')!.drawImage(video, 0, 0);

      const cropW = Math.floor(canvas.width  * 0.65);
      const cropH = Math.floor(canvas.height * 0.30);
      const crop = document.createElement('canvas');
      crop.width = cropW;
      crop.height = cropH;
      crop.getContext('2d')!.drawImage(canvas, 0, 0, cropW, cropH, 0, 0, cropW, cropH);

      const base64 = crop.toDataURL('image/jpeg', 0.85).split(',')[1];

      const res = await fetch('/api/esports-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType: 'image/jpeg' }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const snapshot: StatsSnapshot = { ...data, timestamp: Date.now() };
      setGameStats(data);
      setStatsHistory(prev => [...prev, snapshot]);
      setLastUpdated(new Date());
      setSecondsAgo(0);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Analysis failed';
      if (msg !== 'no scoreboard visible') setAnalysisError(msg);
    } finally {
      setAnalysisLoading(false);
    }
  }, []);

  const stopAnalysis = useCallback(() => {
    captureStreamRef.current?.getTracks().forEach(t => t.stop());
    captureStreamRef.current = null;
    if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current);
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    analysisIntervalRef.current = null;
    tickIntervalRef.current = null;
    setCaptureActive(false);
    setGameStats(null);
    setStatsHistory([]);
    setLastUpdated(null);
    setAnalysisError(null);
  }, []);

  const startAnalysis = async () => {
    try {
      const stream = await (navigator.mediaDevices as MediaDevices & {
        getDisplayMedia: (c: object) => Promise<MediaStream>
      }).getDisplayMedia({
        video: { frameRate: 1 },
        audio: false,
        preferCurrentTab: true,
      });

      captureStreamRef.current = stream;
      if (captureVideoRef.current) {
        captureVideoRef.current.srcObject = stream;
        await captureVideoRef.current.play();
      }

      setCaptureActive(true);
      setStatsHistory([]);
      setGameStats(null);
      setAnalysisError(null);

      // First capture after video loads
      setTimeout(captureAndAnalyze, 1500);
      analysisIntervalRef.current = setInterval(captureAndAnalyze, 15000);

      // "X seconds ago" ticker
      tickIntervalRef.current = setInterval(() => setSecondsAgo(s => s + 1), 1000);

      stream.getVideoTracks()[0].addEventListener('ended', stopAnalysis);
    } catch (e: unknown) {
      const name = e instanceof Error ? (e as Error & { name: string }).name : '';
      if (name !== 'NotAllowedError') setAnalysisError('Screen capture failed — please try again');
    }
  };

  // Chart data derived from history
  const goldDiff   = statsHistory.map(s => ({ t: s.timestamp, diff: s.blue.gold    - s.red.gold    }));
  const killDiff   = statsHistory.map(s => ({ t: s.timestamp, diff: s.blue.kills   - s.red.kills   }));
  const towerDiff  = statsHistory.map(s => ({ t: s.timestamp, diff: s.blue.towers  - s.red.towers  }));
  const dragonDiff = statsHistory.map(s => ({ t: s.timestamp, diff: s.blue.dragons - s.red.dragons }));

  const downloadGameStats = () => {
    if (!gameStats) return;

    const W = 800, CHART_H = 100, PAD = 32;
    const CHARTS = [
      { label: 'GOLD DIFF',   data: goldDiff,   color: '#3b82f6' },
      { label: 'KILL DIFF',   data: killDiff,   color: '#22c55e' },
      { label: 'TOWER DIFF',  data: towerDiff,  color: '#a855f7' },
      { label: 'DRAGON DIFF', data: dragonDiff, color: '#f97316' },
    ];
    const STAT_SECTION = 200;
    const H = PAD + 60 + STAT_SECTION + CHARTS.length * (CHART_H + 40) + PAD;

    const canvas = document.createElement('canvas');
    canvas.width = W * 2; canvas.height = H * 2;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);

    // Background
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, W, H);

    // Subtle grid
    ctx.strokeStyle = 'rgba(59,130,246,0.05)';
    ctx.lineWidth = 1;
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // Header
    ctx.font = 'bold 11px monospace'; ctx.fillStyle = '#3b82f6';
    ctx.fillText('POLYVERSE', PAD, 30);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(' /ESPORTS · LIVE GAME STATS', PAD + 71, 30);
    ctx.font = '9px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.2)';
    const ts = new Date().toLocaleString();
    ctx.fillText(ts, W - PAD - ctx.measureText(ts).width, 30);

    // Divider
    ctx.fillStyle = 'rgba(59,130,246,0.15)'; ctx.fillRect(PAD, 40, W - PAD * 2, 1);

    // Team names + game time
    const blue = gameStats.blueTeam || 'BLUE';
    const red  = gameStats.redTeam  || 'RED';
    ctx.font = 'bold 20px monospace'; ctx.fillStyle = '#3b82f6';
    ctx.fillText(blue, PAD, 72);
    ctx.font = '11px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText('vs', W / 2 - 8, 72);
    ctx.font = 'bold 20px monospace'; ctx.fillStyle = '#f97316';
    const redW = ctx.measureText(red).width;
    ctx.fillText(red, W - PAD - redW, 72);
    ctx.font = '10px monospace'; ctx.fillStyle = '#6b7280';
    const timeLabel = `⏱ ${gameStats.gameTime || '—'}`;
    ctx.fillText(timeLabel, W / 2 - ctx.measureText(timeLabel).width / 2, 90);

    // Stat bars
    const stats = [
      { label: 'GOLD',    bv: gameStats.blue.gold,    rv: gameStats.red.gold,    fmt: (v: number) => `${(v/1000).toFixed(1)}k` },
      { label: 'KILLS',   bv: gameStats.blue.kills,   rv: gameStats.red.kills,   fmt: (v: number) => String(v) },
      { label: 'TOWERS',  bv: gameStats.blue.towers,  rv: gameStats.red.towers,  fmt: (v: number) => String(v) },
      { label: 'DRAGONS', bv: gameStats.blue.dragons, rv: gameStats.red.dragons, fmt: (v: number) => String(v) },
    ];
    let sy = 110;
    const barW = W - PAD * 2;
    stats.forEach(({ label, bv, rv, fmt }) => {
      const total = bv + rv || 1;
      const bFrac = bv / total;
      ctx.font = '8px monospace'; ctx.fillStyle = '#4b5563';
      ctx.textAlign = 'center';
      ctx.fillText(label, W / 2, sy - 2);
      ctx.textAlign = 'left';
      ctx.font = 'bold 9px monospace'; ctx.fillStyle = '#3b82f6';
      ctx.fillText(fmt(bv), PAD, sy - 2);
      ctx.fillStyle = '#f97316'; ctx.textAlign = 'right';
      ctx.fillText(fmt(rv), W - PAD, sy - 2);
      ctx.textAlign = 'left';
      // Blue bar
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath(); ctx.roundRect(PAD, sy, barW * bFrac, 7, [3, 0, 0, 3]); ctx.fill();
      // Red bar
      ctx.fillStyle = '#f97316';
      ctx.beginPath(); ctx.roundRect(PAD + barW * bFrac, sy, barW * (1 - bFrac), 7, [0, 3, 3, 0]); ctx.fill();
      sy += 30;
    });

    // Charts
    let cy = PAD + 60 + STAT_SECTION - 10;
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(PAD, cy - 6, W - PAD * 2, 1);
    cy += 10;

    CHARTS.forEach(({ label, data, color }) => {
      if (data.length < 2) return;
      ctx.font = '8px monospace'; ctx.fillStyle = '#6b7280';
      ctx.fillText(label, PAD, cy + 12);

      const diffs = data.map(d => d.diff);
      const min = Math.min(...diffs, 0);
      const max = Math.max(...diffs, 0);
      const range = max - min || 1;
      const cW = W - PAD * 2;
      const toX = (i: number) => PAD + (i / (data.length - 1)) * cW;
      const toY = (v: number) => cy + 18 + ((max - v) / range) * (CHART_H - 10);
      const zeroY = toY(0);

      // Zero line
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD, zeroY); ctx.lineTo(PAD + cW, zeroY); ctx.stroke();

      // Area fill
      ctx.beginPath();
      ctx.moveTo(toX(0), zeroY);
      data.forEach((d, i) => ctx.lineTo(toX(i), toY(d.diff)));
      ctx.lineTo(toX(data.length - 1), zeroY);
      ctx.closePath();
      ctx.fillStyle = color + '20'; ctx.fill();

      // Line
      ctx.beginPath();
      data.forEach((d, i) => i === 0 ? ctx.moveTo(toX(i), toY(d.diff)) : ctx.lineTo(toX(i), toY(d.diff)));
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round'; ctx.stroke();

      // Last value
      const last = diffs[diffs.length - 1];
      ctx.font = 'bold 9px monospace'; ctx.fillStyle = color;
      const lastLabel = `${last > 0 ? '+' : ''}${last.toLocaleString()}`;
      ctx.fillText(lastLabel, PAD, cy + CHART_H + 22);
      ctx.font = '8px monospace'; ctx.fillStyle = '#374151'; ctx.textAlign = 'right';
      ctx.fillText(`${data.length} snapshots`, W - PAD, cy + CHART_H + 22);
      ctx.textAlign = 'left';

      cy += CHART_H + 40;
    });

    // Footer
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(PAD, H - 24, W - PAD * 2, 1);
    ctx.font = '8px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillText('polyverse.capital/esports · powered by commonstack ai', PAD, H - 10);

    const link = document.createElement('a');
    link.download = `${blue}-vs-${red}-game-stats.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Gemini scan
  const [scanImg, setScanImg] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Champion images from DDragon
  const [champImgs, setChampImgs] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/esports.json')
      .then(r => r.json())
      .then((data: EsportsDB) => { setDb(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => {
    fetch('/synergies.json')
      .then(r => r.json())
      .then((data: SynergyDB) => setSynergies(data))
      .catch(() => {}); // silently fail — synergies are supplementary
  }, []);

  useEffect(() => {
    fetch('https://ddragon.leagueoflegends.com/api/versions.json')
      .then(r => r.json())
      .then((versions: string[]) => versions[0])
      .then(version =>
        fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`)
          .then(r => r.json())
          .then(data => {
            const map: Record<string, string> = {};
            Object.values(data.data as Record<string, { id: string; name: string }>).forEach(champ => {
              const url = `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champ.id}.png`;
              map[champ.name] = url;
              map[champ.id]   = url;
              // normalised key: lowercase, strip non-alphanumeric (handles "K'Sante" → "ksante" etc.)
              map[champ.name.toLowerCase().replace(/[^a-z0-9]/g, '')] = url;
            });
            setChampImgs(map);
          })
      )
      .catch(() => {}); // silently fail — icons are cosmetic
  }, []);

  const getImg = (name: string): string | null =>
    champImgs[name]
    ?? champImgs[name.toLowerCase().replace(/[^a-z0-9]/g, '')]
    ?? null;

  const downloadPrediction = async () => {
    if (!prediction || !teamA || !teamB) return;

    const W = 900, H = 520;
    const canvas = document.createElement('canvas');
    canvas.width = W * 2; canvas.height = H * 2;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);

    // Background
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, W, H);

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(59,130,246,0.06)';
    ctx.lineWidth = 1;
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // Header
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#3b82f6';
    ctx.fillText('POLYVERSE', 30, 36);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(' /ESPORTS', 97, 36);
    ctx.font = '9px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillText('polyverse.capital/esports', W - 30 - ctx.measureText('polyverse.capital/esports').width, 36);

    // Divider
    ctx.fillStyle = 'rgba(59,130,246,0.15)';
    ctx.fillRect(30, 44, W - 60, 1);

    // Team names
    const pA = Math.round(prediction.probA * 100);
    const pB = 100 - pA;
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#3b82f6';
    ctx.fillText(teamA, 30, 82);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '14px monospace';
    ctx.fillText('vs', W / 2 - 10, 82);
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#f97316';
    const tbW = ctx.measureText(teamB).width;
    ctx.fillText(teamB, W - 30 - tbW, 82);

    // Win probability bar
    const barX = 30, barY = 100, barW = W - 60, barH = 36;
    const blueW = (pA / 100) * barW;

    ctx.fillStyle = pA >= 60 ? '#22c55e' : pA >= 50 ? '#3b82f6' : '#f97316';
    ctx.beginPath();
    ctx.roundRect(barX, barY, blueW, barH, [6, 0, 0, 6]);
    ctx.fill();

    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.roundRect(barX + blueW, barY, barW - blueW, barH, [0, 6, 6, 0]);
    ctx.fill();

    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${pA}%`, barX + 12, barY + 24);
    const pbStr = `${pB}%`;
    ctx.fillText(pbStr, barX + barW - ctx.measureText(pbStr).width - 12, barY + 24);

    // Factor breakdown
    const factors = [
      { label: 'TEAM WIN RATE', a: Math.round(prediction.wrA * 100), b: Math.round(prediction.wrB * 100), weight: '30%' },
      { label: 'HEAD-TO-HEAD',  a: Math.round(prediction.h2hA * 100), b: Math.round(prediction.h2hB * 100), weight: '25%' },
      { label: 'CHAMP SCORE',   a: prediction.hasChamps ? Math.round(prediction.csA * 100) : null, b: prediction.hasChamps ? Math.round(prediction.csB * 100) : null, weight: '45%' },
    ];
    const colW = (W - 60) / 3;
    factors.forEach((f, i) => {
      const cx = 30 + i * colW + colW / 2;
      ctx.font = '8px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.textAlign = 'center';
      ctx.fillText(f.label, cx, 162);
      ctx.font = 'bold 13px monospace';
      if (f.a !== null) {
        ctx.fillStyle = '#3b82f6';
        ctx.fillText(`${f.a}%`, cx - 22, 180);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font = '10px monospace';
        ctx.fillText('vs', cx, 180);
        ctx.font = 'bold 13px monospace';
        ctx.fillStyle = '#f97316';
        ctx.fillText(`${f.b}%`, cx + 22, 180);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font = '9px monospace';
        ctx.fillText('—', cx, 180);
      }
      ctx.font = '8px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillText(`weight ${f.weight}`, cx, 193);
    });
    ctx.textAlign = 'left';

    // Divider
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(30, 206, W - 60, 1);

    // Champion picks — load images async
    const loadImg = (src: string): Promise<HTMLImageElement | null> =>
      new Promise(resolve => {
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });

    const iconSize = 36;
    const slotW = (W - 60) / 5;

    // Draw team labels
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#3b82f6';
    ctx.fillText(`${teamA} (BLUE)`, 30, 228);
    ctx.fillStyle = '#f97316';
    const tbLabel = `${teamB} (RED)`;
    ctx.fillText(tbLabel, 30, 360);

    // Draw champ icons + names for each team
    const drawTeamChamps = async (champs: string[], players: string[], yBase: number) => {
      for (let i = 0; i < 5; i++) {
        const champ = champs[i];
        const player = players[i];
        const x = 30 + i * slotW;

        // Icon box background
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.beginPath(); ctx.roundRect(x, yBase, slotW - 8, iconSize + 28, 4); ctx.fill();

        if (champ) {
          const imgUrl = getImg(champ);
          if (imgUrl) {
            const img = await loadImg(imgUrl);
            if (img) {
              ctx.save();
              ctx.beginPath(); ctx.roundRect(x + 2, yBase + 2, iconSize, iconSize, 4); ctx.clip();
              ctx.drawImage(img, x + 2, yBase + 2, iconSize, iconSize);
              ctx.restore();
            }
          }
          ctx.font = 'bold 8px monospace';
          ctx.fillStyle = '#ffffff';
          // truncate champion name
          const champLabel = champ.length > 10 ? champ.slice(0, 9) + '…' : champ;
          ctx.fillText(champLabel, x + 2, yBase + iconSize + 12);
        }
        if (player) {
          ctx.font = '7px monospace';
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          const playerLabel = player.length > 10 ? player.slice(0, 9) + '…' : player;
          ctx.fillText(playerLabel, x + 2, yBase + iconSize + 23);
        }
      }
    };

    await drawTeamChamps(champsA, rosterA, 234);
    await drawTeamChamps(champsB, rosterB, 366);

    // Footer
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(30, H - 30, W - 60, 1);
    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillText('polyverse.capital/esports · powered by commonstack ai', 30, H - 14);

    // Download
    const link = document.createElement('a');
    link.download = `${teamA}-vs-${teamB}-prediction.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setScanImg(reader.result as string); setScanError(null); setScanResult(null); };
    reader.readAsDataURL(file);
  };

  const scanWithGemini = async () => {
    if (!scanImg) return;
    setScanLoading(true); setScanError(null); setScanResult(null);
    try {
      const base64 = scanImg.split(',')[1];
      const mimeType = scanImg.split(';')[0].split(':')[1];

      const res = await fetch('/api/gemini-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(`${res.status}: ${t}`); }
      const parsed = await res.json();
      if (parsed.error) throw new Error(parsed.error);
      setScanResult(JSON.stringify(parsed));

      // Auto-populate from blue/red format
      if (parsed.blue?.length) {
        setRosterA(Array.from({ length: 5 }, (_, i) => parsed.blue[i]?.player ?? ''));
        setChampsA(Array.from({ length: 5 }, (_, i) => parsed.blue[i]?.champion ?? ''));
      }
      if (parsed.red?.length) {
        setRosterB(Array.from({ length: 5 }, (_, i) => parsed.red[i]?.player ?? ''));
        setChampsB(Array.from({ length: 5 }, (_, i) => parsed.red[i]?.champion ?? ''));
      }
    } catch (e: any) {
      setScanError(e.message ?? 'Unknown error');
    } finally {
      setScanLoading(false);
    }
  };

  // Reset roster when team changes
  useEffect(() => {
    setRosterA(Array(5).fill(''));
    setChampsA(Array(5).fill(''));
    if (db && teamA) {
      const players = (db.teamPlayers[teamA] ?? []).slice(0, 5);
      setRosterA(prev => prev.map((_, i) => players[i] ?? ''));
    }
  }, [teamA, db]);

  useEffect(() => {
    setRosterB(Array(5).fill(''));
    setChampsB(Array(5).fill(''));
    if (db && teamB) {
      const players = (db.teamPlayers[teamB] ?? []).slice(0, 5);
      setRosterB(prev => prev.map((_, i) => players[i] ?? ''));
    }
  }, [teamB, db]);

  const teamList = useMemo(() => db ? Object.keys(db.teams).sort() : [], [db]);
  const playerList = useMemo(() => db ? Object.keys(db.players).sort() : [], [db]);

  const h2hData = useMemo(() => {
    if (!db || !teamA || !teamB) return null;
    return getH2H(db, teamA, teamB);
  }, [db, teamA, teamB]);

  const prediction = useMemo(() => {
    if (!db || !teamA || !teamB) return null;
    return calcProb(db, synergies, teamA, teamB, champsA, champsB, rosterA, rosterB);
  }, [db, synergies, teamA, teamB, champsA, champsB, rosterA, rosterB]);

  const searchedPlayer = useMemo(() => {
    if (!db || !playerSearch) return null;
    return db.players[playerSearch] ?? null;
  }, [db, playerSearch]);

  if (loading) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center font-mono text-blue-400 text-sm">
      loading esports data…
    </div>
  );
  if (error) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center font-mono text-red-400 text-sm">
      error: {error}
    </div>
  );
  if (!db) return null;

  return (
    <div className="min-h-screen bg-[#050505] text-white font-mono">

      {/* Nav */}
      <div className="border-b border-white/5 px-6 py-3 flex items-center justify-between">
        <a href="/" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">← polyverse.capital</a>
        <span className="text-[10px] text-gray-600 tracking-widest">LOL ESPORTS ANALYTICS · 2025–2026</span>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">

        {/* ── Live Stream + AI Analysis ── */}
        <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 space-y-4">

          {/* Top bar: title + league + source controls */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-[10px] text-blue-400 tracking-widest">LIVE STREAM + AI ANALYSIS</div>
            <div className="flex items-center gap-2 flex-wrap">
              {LEAGUES.map(l => (
                <button key={l.id} onClick={() => setSelectedLeague(l.id)}
                  className={`px-2.5 py-1 rounded text-[10px] font-mono transition-colors ${
                    selectedLeague === l.id
                      ? 'bg-blue-500/20 border border-blue-500/40 text-blue-300'
                      : 'bg-white/5 border border-white/10 text-gray-500 hover:text-gray-300'
                  }`}>
                  {l.label}
                </button>
              ))}
              <div className="flex rounded overflow-hidden border border-white/10 ml-1">
                {(['twitch', 'youtube'] as const).map(src => (
                  <button key={src} onClick={() => setStreamSource(src)}
                    className={`px-2.5 py-1 text-[10px] font-mono transition-colors ${
                      streamSource === src ? 'bg-purple-500/20 text-purple-300' : 'bg-white/5 text-gray-500 hover:text-gray-300'
                    }`}>
                    {src === 'twitch' ? '🟣 Twitch' : '🔴 YouTube'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Side-by-side: stream left, stats right */}
          <div className="flex gap-4 items-stretch">

            {/* Stream embed — 65% width */}
            <div className="flex-[2] min-w-0">
              <div className="relative w-full rounded-xl overflow-hidden bg-black border border-white/10" style={{ paddingTop: '56.25%' }}>
                {streamSource === 'twitch' && twitchSrc ? (
                  <iframe
                    key={`twitch-${selectedLeague}`}
                    src={twitchSrc}
                    className="absolute inset-0 w-full h-full"
                    allowFullScreen
                    title={`${selectedLeague} live stream`}
                  />
                ) : streamSource === 'twitch' && !twitchSrc ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 text-sm space-y-2">
                    <span>No Twitch stream for {selectedLeague}</span>
                    <button onClick={() => setStreamSource('youtube')}
                      className="text-[11px] text-blue-400 hover:text-blue-300 underline">
                      Switch to YouTube
                    </button>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-6">
                    <div className="text-gray-400 text-sm">YouTube live streams cannot be embedded directly.</div>
                    <a href={youtubeSrc} target="_blank" rel="noopener noreferrer"
                      className="px-4 py-2 rounded-lg bg-red-600/20 border border-red-500/40 text-red-400 text-sm hover:bg-red-600/30 transition-colors font-mono">
                      ▶ Open {selectedLeague} on YouTube
                    </a>
                    <div className="text-[10px] text-gray-600">Open in a tab, then use "Start Analysis" to capture it</div>
                  </div>
                )}
              </div>

              {/* Analysis controls below stream */}
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {!captureActive ? (
                  <button onClick={startAnalysis}
                    className="px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/40 text-green-400 text-[10px] font-mono hover:bg-green-500/30 transition-colors">
                    ⬤ Start Analysis
                  </button>
                ) : (
                  <button onClick={stopAnalysis}
                    className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] font-mono hover:bg-red-500/30 transition-colors">
                    ■ Stop
                  </button>
                )}
                {captureActive && (
                  <div className="flex items-center gap-2 text-[10px] text-gray-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                    {analysisLoading ? 'Scanning…' : lastUpdated ? `Updated ${secondsAgo}s ago` : 'Waiting for first scan…'}
                  </div>
                )}
                {analysisError && <span className="text-[10px] text-red-400">{analysisError}</span>}
              </div>

              {/* ── Quick win-rate strip ── */}
              <div className="mt-3 bg-white/[0.02] border border-white/8 rounded-xl p-3 space-y-2">
                <div className="text-[9px] text-gray-600 tracking-widest">QUICK WIN RATE</div>
                <div className="flex gap-2">
                  <div className="flex-1 min-w-0">
                    <Autocomplete value={teamA} onChange={setTeamA} options={teamList} placeholder="Blue team…" />
                  </div>
                  <div className="flex items-center text-[10px] text-gray-600 px-1">vs</div>
                  <div className="flex-1 min-w-0">
                    <Autocomplete value={teamB} onChange={setTeamB} options={teamList} placeholder="Red team…" />
                  </div>
                </div>
                {prediction && teamA && teamB ? (
                  <div className="space-y-1.5">
                    <WinBar probA={prediction.probA} teamA={teamA} teamB={teamB} />
                    <div className="flex justify-between text-[9px] text-gray-600 font-mono">
                      {h2hData ? (
                        <span>H2H {h2hData.winsA}–{h2hData.winsB} ({h2hData.total}g)</span>
                      ) : <span>No H2H data</span>}
                      <span className="text-gray-700">
                        {Math.round(prediction.wrA * 100)}% · {Math.round(prediction.wrB * 100)}% overall WR
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[9px] text-gray-700 text-center py-1">Select both teams to see prediction</div>
                )}
              </div>
            </div>

            {/* Stats panel — 35% width, scrollable */}
            <div className="flex-[1] min-w-0 flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: 420 }}>

              {/* Hidden video for capture */}
              <video ref={captureVideoRef} muted playsInline className="hidden" />

              {!gameStats && !captureActive && (
                <div className="flex-1 flex items-center justify-center text-[10px] text-gray-700 text-center p-4">
                  Start Analysis to see live game stats here
                </div>
              )}

              {!gameStats && captureActive && (
                <div className="flex-1 flex items-center justify-center text-[10px] text-gray-600 text-center p-4">
                  <span className="animate-pulse">Waiting for scoreboard…</span>
                </div>
              )}

              {gameStats && (
                <>
                  {/* Team names + timer + share button */}
                  <div className="flex items-center justify-between text-[10px] font-mono border-b border-white/5 pb-2">
                    <span className="text-blue-400 font-bold">{gameStats.blueTeam || 'BLUE'}</span>
                    <span className="text-gray-600">⏱ {gameStats.gameTime || '—'}</span>
                    <span className="text-orange-400 font-bold">{gameStats.redTeam || 'RED'}</span>
                  </div>
                  <button onClick={downloadGameStats}
                    className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-[10px] font-mono hover:bg-white/10 hover:text-white transition-colors flex items-center justify-center gap-1.5">
                    📸 Save chart as image
                  </button>

                  {/* Stat bars */}
                  {[
                    { label: 'GOLD',    blue: gameStats.blue.gold,    red: gameStats.red.gold,    fmt: (v: number) => `${(v/1000).toFixed(1)}k` },
                    { label: 'KILLS',   blue: gameStats.blue.kills,   red: gameStats.red.kills,   fmt: (v: number) => String(v) },
                    { label: 'TOWERS',  blue: gameStats.blue.towers,  red: gameStats.red.towers,  fmt: (v: number) => String(v) },
                    { label: 'DRAGONS', blue: gameStats.blue.dragons, red: gameStats.red.dragons, fmt: (v: number) => String(v) },
                  ].map(({ label, blue, red, fmt }) => {
                    const total = blue + red || 1;
                    const blueW = Math.round((blue / total) * 100);
                    return (
                      <div key={label} className="space-y-0.5">
                        <div className="flex justify-between text-[9px] tracking-wider">
                          <span className="text-blue-400 font-mono">{fmt(blue)}</span>
                          <span className="text-gray-600">{label}</span>
                          <span className="text-orange-400 font-mono">{fmt(red)}</span>
                        </div>
                        <div className="flex h-1.5 rounded-full overflow-hidden bg-white/5">
                          <div className="bg-blue-500 transition-all" style={{ width: `${blueW}%` }} />
                          <div className="bg-orange-500 transition-all" style={{ width: `${100 - blueW}%` }} />
                        </div>
                      </div>
                    );
                  })}

                  {/* Charts */}
                  {statsHistory.length >= 2 && (
                    <div className="space-y-3 pt-2 border-t border-white/5">
                      <DiffChart data={goldDiff}   label="GOLD DIFF"   color="#3b82f6" />
                      <DiffChart data={killDiff}   label="KILL DIFF"   color="#22c55e" />
                      <DiffChart data={towerDiff}  label="TOWER DIFF"  color="#a855f7" />
                      <DiffChart data={dragonDiff} label="DRAGON DIFF" color="#f97316" />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
            POLYVERSE <span className="text-blue-400">/ESPORTS</span>
          </h1>
          <p className="text-gray-500 text-sm">Team matchup predictor · player champion stats</p>
          <div className="flex items-center justify-center gap-6 mt-4">
            {[
              { label: 'TEAMS', val: Object.keys(db.teams).length },
              { label: 'PLAYERS', val: Object.keys(db.players).length },
              { label: 'MATCHUPS', val: Object.keys(db.h2h).length },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="text-lg font-bold text-blue-400">{s.val.toLocaleString()}</div>
                <div className="text-[10px] text-gray-600 tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Matchup Predictor ── */}
        <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 space-y-6">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          <div className="flex items-center gap-3">
            <div className="text-[10px] text-blue-400 tracking-widest flex-1">MATCHUP PREDICTOR</div>
            <button onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-[10px] font-mono hover:bg-white/10 hover:text-white transition-colors flex items-center gap-1.5">
              📸 {scanImg ? 'change image' : 'upload image'}
            </button>
            <button onClick={scanWithGemini} disabled={!scanImg || scanLoading}
              className="px-3 py-1.5 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-400 text-[10px] font-mono hover:bg-blue-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5">
              {scanLoading
                ? <><span className="animate-spin inline-block w-2.5 h-2.5 border border-blue-400 border-t-transparent rounded-full" />scanning…</>
                : '✦ scan'}
            </button>
            {scanError && <span className="text-[10px] text-red-400">{scanError}</span>}
            {scanResult && !scanError && <span className="text-[10px] text-green-400">✓ populated</span>}
          </div>

          {/* Team selectors */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] text-gray-500 mb-1.5 tracking-wider">TEAM A</div>
              <Autocomplete value={teamA} onChange={setTeamA} options={teamList} placeholder="Search team…" />
              {teamA && db.teams[teamA] && (
                <div className="mt-1 text-[10px] text-gray-500">
                  Overall: <span className="text-green-400">{pctStr(db.teams[teamA].wins, db.teams[teamA].total)}</span>
                  {' '}({db.teams[teamA].wins}W–{db.teams[teamA].total - db.teams[teamA].wins}L · {db.teams[teamA].total}g)
                </div>
              )}
            </div>
            <div>
              <div className="text-[10px] text-gray-500 mb-1.5 tracking-wider">TEAM B</div>
              <Autocomplete value={teamB} onChange={setTeamB} options={teamList} placeholder="Search team…" />
              {teamB && db.teams[teamB] && (
                <div className="mt-1 text-[10px] text-gray-500">
                  Overall: <span className="text-orange-400">{pctStr(db.teams[teamB].wins, db.teams[teamB].total)}</span>
                  {' '}({db.teams[teamB].wins}W–{db.teams[teamB].total - db.teams[teamB].wins}L · {db.teams[teamB].total}g)
                </div>
              )}
            </div>
          </div>

          {/* H2H */}
          {teamA && teamB && (
            <div className="border border-white/5 rounded-xl p-4 bg-white/[0.02]">
              <div className="text-[10px] text-gray-600 tracking-wider mb-2">HEAD TO HEAD</div>
              {h2hData ? (
                <div className="flex items-center gap-4">
                  <span className="text-blue-400 font-bold">{teamA}</span>
                  <span className="text-green-400 font-bold text-lg">{h2hData.winsA}</span>
                  <span className="text-gray-600">–</span>
                  <span className="text-orange-400 font-bold text-lg">{h2hData.winsB}</span>
                  <span className="text-orange-400 font-bold">{teamB}</span>
                  <span className="text-gray-600 text-xs ml-auto">{h2hData.total} games played</span>
                </div>
              ) : (
                <div className="text-[10px] text-gray-600">No recorded head-to-head games between these teams</div>
              )}
            </div>
          )}

          {/* Rosters + Champ Picks */}
          {teamA && teamB && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Team A roster */}
              <div className="space-y-2">
                <div className="text-[10px] text-blue-400 tracking-wider mb-2">{teamA} · ROSTER</div>
                {POSITIONS.map((pos, i) => {
                  const players = db.teamPlayers[teamA] ?? [];
                  const playerOptions = players;
                  const selectedPlayer = rosterA[i];
                  const playerData = selectedPlayer ? db.players[selectedPlayer] : null;
                  return (
                    <div key={pos} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-gray-600 w-12 shrink-0">{pos}</span>
                        <Autocomplete
                          value={rosterA[i]}
                          onChange={v => {
                            const next = [...rosterA]; next[i] = v;
                            setRosterA(next);
                            const nc = [...champsA]; nc[i] = '';
                            setChampsA(nc);
                          }}
                          options={playerOptions}
                          placeholder="Player…"
                          className="flex-1"
                        />
                      </div>
                      {playerData && (
                        <div className="flex items-center gap-2 pl-2 sm:pl-14">
                          <ChampSelect
                            champs={playerData.champs}
                            value={champsA[i]}
                            onChange={v => { const nc = [...champsA]; nc[i] = v; setChampsA(nc); }}
                            getImg={getImg}
                          />
                          {champsA[i] && playerData.champs[champsA[i]] && (
                            <span className="text-[9px] text-green-400 shrink-0">
                              {pctStr(playerData.champs[champsA[i]].wins, playerData.champs[champsA[i]].total)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Team B roster */}
              <div className="space-y-2">
                <div className="text-[10px] text-orange-400 tracking-wider mb-2">{teamB} · ROSTER</div>
                {POSITIONS.map((pos, i) => {
                  const players = db.teamPlayers[teamB] ?? [];
                  const playerOptions = players;
                  const selectedPlayer = rosterB[i];
                  const playerData = selectedPlayer ? db.players[selectedPlayer] : null;
                  return (
                    <div key={pos} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-gray-600 w-12 shrink-0">{pos}</span>
                        <Autocomplete
                          value={rosterB[i]}
                          onChange={v => {
                            const next = [...rosterB]; next[i] = v;
                            setRosterB(next);
                            const nc = [...champsB]; nc[i] = '';
                            setChampsB(nc);
                          }}
                          options={playerOptions}
                          placeholder="Player…"
                          className="flex-1"
                        />
                      </div>
                      {playerData && (
                        <div className="flex items-center gap-2 pl-2 sm:pl-14">
                          <ChampSelect
                            champs={playerData.champs}
                            value={champsB[i]}
                            onChange={v => { const nc = [...champsB]; nc[i] = v; setChampsB(nc); }}
                            getImg={getImg}
                          />
                          {champsB[i] && playerData.champs[champsB[i]] && (
                            <span className="text-[9px] text-orange-400 shrink-0">
                              {pctStr(playerData.champs[champsB[i]].wins, playerData.champs[champsB[i]].total)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Prediction result */}
          {prediction && teamA && teamB && (
            <div className="border border-white/10 rounded-xl p-5 bg-white/[0.02] space-y-4">
              <div className="flex items-center gap-2 justify-end">
                <button onClick={downloadPrediction}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-[10px] font-mono hover:bg-white/10 hover:text-white transition-colors">
                  ↓ download
                </button>
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${teamA} vs ${teamB} — ${Math.round(prediction.probA * 100)}% / ${Math.round(prediction.probB * 100)}% win probability\n\npolyverse.capital/esports`)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-[10px] font-mono hover:bg-blue-400/20 hover:text-blue-300 transition-colors">
                  𝕏 share
                </a>
              </div>
              <WinBar probA={prediction.probA} teamA={teamA} teamB={teamB} />

              {/* Factor breakdown */}
              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-white/5">
                <div className="text-center">
                  <div className="text-[9px] text-gray-600 tracking-wider mb-1">TEAM WIN RATE</div>
                  <div className="flex justify-center gap-3 text-xs font-bold">
                    <span className="text-blue-400">{Math.round(prediction.wrA * 100)}%</span>
                    <span className="text-gray-600">vs</span>
                    <span className="text-orange-400">{Math.round(prediction.wrB * 100)}%</span>
                  </div>
                  <div className="text-[9px] text-gray-700 mt-0.5">30% weight</div>
                </div>
                <div className="text-center">
                  <div className="text-[9px] text-gray-600 tracking-wider mb-1">HEAD-TO-HEAD</div>
                  <div className="flex justify-center gap-3 text-xs font-bold">
                    <span className="text-blue-400">{Math.round(prediction.h2hA * 100)}%</span>
                    <span className="text-gray-600">vs</span>
                    <span className="text-orange-400">{Math.round(prediction.h2hB * 100)}%</span>
                  </div>
                  <div className="text-[9px] text-gray-700 mt-0.5">25% weight</div>
                </div>
                <div className="text-center">
                  <div className="text-[9px] text-gray-600 tracking-wider mb-1">CHAMP SCORE</div>
                  {prediction.hasChamps ? (
                    <div className="flex justify-center gap-3 text-xs font-bold">
                      <span className="text-blue-400">{Math.round(prediction.csA * 100)}%</span>
                      <span className="text-gray-600">vs</span>
                      <span className="text-orange-400">{Math.round(prediction.csB * 100)}%</span>
                    </div>
                  ) : (
                    <div className="text-[10px] text-gray-700">select champs above</div>
                  )}
                  <div className="text-[9px] text-gray-700 mt-0.5">45% weight</div>
                </div>
              </div>

              {/* Synergy Analysis */}
              {prediction.hasSynergy && (
                <div className="pt-3 border-t border-white/5 space-y-3">
                  <div className="text-[9px] text-purple-400 tracking-widest">SYNERGY ANALYSIS <span className="text-gray-700 ml-1">· additive bonus</span></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Team A synergies */}
                    <div>
                      <div className="text-[9px] text-blue-400 mb-1.5">{teamA}</div>
                      {prediction.synDataA.pairs.length > 0 ? (
                        <div className="space-y-1">
                          {prediction.synDataA.pairs.map(p => {
                            const wr = Math.round((p.wins / p.total) * 100);
                            const color = wr >= 60 ? '#a855f7' : wr >= 50 ? '#6366f1' : '#9ca3af';
                            return (
                              <div key={p.pair} className="flex items-center justify-between text-[10px] font-mono bg-white/[0.02] rounded px-2 py-1">
                                <span className="text-gray-400 truncate flex-1">{p.pair}</span>
                                <span className="ml-2 shrink-0 font-bold" style={{ color }}>{wr}%</span>
                                <span className="ml-1.5 text-gray-700 shrink-0">{p.total}g</span>
                              </div>
                            );
                          })}
                          <div className="text-[9px] mt-1" style={{ color: prediction.synDataA.bonus >= 0 ? '#a855f7' : '#9ca3af' }}>
                            avg synergy: {prediction.synDataA.bonus >= 0 ? '+' : ''}{(prediction.synDataA.bonus * 100).toFixed(1)}%
                          </div>
                        </div>
                      ) : (
                        <div className="text-[9px] text-gray-700">no synergy data for selected champs</div>
                      )}
                    </div>
                    {/* Team B synergies */}
                    <div>
                      <div className="text-[9px] text-orange-400 mb-1.5">{teamB}</div>
                      {prediction.synDataB.pairs.length > 0 ? (
                        <div className="space-y-1">
                          {prediction.synDataB.pairs.map(p => {
                            const wr = Math.round((p.wins / p.total) * 100);
                            const color = wr >= 60 ? '#a855f7' : wr >= 50 ? '#6366f1' : '#9ca3af';
                            return (
                              <div key={p.pair} className="flex items-center justify-between text-[10px] font-mono bg-white/[0.02] rounded px-2 py-1">
                                <span className="text-gray-400 truncate flex-1">{p.pair}</span>
                                <span className="ml-2 shrink-0 font-bold" style={{ color }}>{wr}%</span>
                                <span className="ml-1.5 text-gray-700 shrink-0">{p.total}g</span>
                              </div>
                            );
                          })}
                          <div className="text-[9px] mt-1" style={{ color: prediction.synDataB.bonus >= 0 ? '#a855f7' : '#9ca3af' }}>
                            avg synergy: {prediction.synDataB.bonus >= 0 ? '+' : ''}{(prediction.synDataB.bonus * 100).toFixed(1)}%
                          </div>
                        </div>
                      ) : (
                        <div className="text-[9px] text-gray-700">no synergy data for selected champs</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Player Champion Pool ── */}
        <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="text-[10px] text-blue-400 tracking-widest">PLAYER CHAMPION STATS</div>
          <Autocomplete
            value={playerSearch}
            onChange={setPlayerSearch}
            options={playerList}
            placeholder="Search player name…"
          />

          {searchedPlayer && (
            <div className="space-y-3">
              <div className="text-xs text-gray-500">
                Teams: <span className="text-gray-300">{searchedPlayer.teams.join(', ')}</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02]">
                      {['Champion', 'Games', 'Wins', 'Losses', 'Win Rate'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-[10px] text-blue-400 tracking-wider font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(searchedPlayer.champs)
                      .sort((a, b) => b[1].total - a[1].total)
                      .map(([champ, stat], i) => {
                        const wr = pct(stat.wins, stat.total);
                        const color = wr >= 0.6 ? '#22c55e' : wr >= 0.5 ? '#3b82f6' : wr >= 0.4 ? '#f97316' : '#ef4444';
                        return (
                          <tr key={champ} className={`border-b border-white/5 hover:bg-white/[0.03] ${i % 2 === 0 ? '' : 'bg-white/[0.015]'}`}>
                            <td className="px-4 py-2.5 font-bold text-white">
                              <div className="flex items-center gap-2">
                                {getImg(champ) && (
                                  <img src={getImg(champ)!} alt={champ} className="w-7 h-7 rounded-sm object-cover shrink-0" />
                                )}
                                {champ}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-gray-400">{stat.total}</td>
                            <td className="px-4 py-2.5 text-green-400">{stat.wins}</td>
                            <td className="px-4 py-2.5 text-red-400">{stat.total - stat.wins}</td>
                            <td className="px-4 py-2.5 font-bold" style={{ color }}>
                              {pctStr(stat.wins, stat.total)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── Team Browser ── */}
        <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="text-[10px] text-blue-400 tracking-widest">TEAM WIN RATES — ALL TEAMS</div>
          <div className="overflow-x-auto rounded-xl border border-white/10 max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0">
                <tr className="border-b border-white/10 bg-[#0d0d0d]">
                  {['Team', 'Games', 'Wins', 'Losses', 'Win Rate'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] text-blue-400 tracking-wider font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(db.teams)
                  .sort((a, b) => pct(b[1].wins, b[1].total) - pct(a[1].wins, a[1].total))
                  .map(([team, rec], i) => {
                    const wr = pct(rec.wins, rec.total);
                    const color = wr >= 0.65 ? '#22c55e' : wr >= 0.5 ? '#3b82f6' : wr >= 0.4 ? '#f97316' : '#ef4444';
                    return (
                      <tr key={team} className={`border-b border-white/5 hover:bg-white/[0.03] cursor-pointer ${i % 2 === 0 ? '' : 'bg-white/[0.015]'}`}
                        onClick={() => { if (!teamA) setTeamA(team); else if (!teamB) setTeamB(team); }}>
                        <td className="px-4 py-2 font-semibold text-white">{team}</td>
                        <td className="px-4 py-2 text-gray-400">{rec.total}</td>
                        <td className="px-4 py-2 text-green-400">{rec.wins}</td>
                        <td className="px-4 py-2 text-red-400">{rec.total - rec.wins}</td>
                        <td className="px-4 py-2 font-bold" style={{ color }}>{pctStr(rec.wins, rec.total)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <div className="text-[9px] text-gray-700">Click any row to select as Team A or B in the predictor above</div>
        </div>

        <div className="text-center pb-8">
          <a href="/" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-colors text-sm">
            ← Back to Polyverse
          </a>
        </div>
      </div>
    </div>
  );
}
