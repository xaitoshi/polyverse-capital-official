import React, { useState, useEffect, useRef, useMemo } from 'react';

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

// ── Helpers ────────────────────────────────────────────────────────────────────
const pct = (w: number, t: number) => t === 0 ? 0 : w / t;
const pctStr = (w: number, t: number) => t === 0 ? 'N/A' : `${Math.round((w / t) * 100)}%`;

function h2hKey(a: string, b: string) {
  return `${[a,b].sort().join('|||')}`;
}

function getH2H(db: EsportsDB, a: string, b: string) {
  const key = h2hKey(a, b);
  const rec = db.h2h[key];
  if (!rec) return null;
  const winsA = rec.t1 === a ? rec.wins1 : rec.total - rec.wins1;
  return { winsA, winsB: rec.total - winsA, total: rec.total };
}

// Win probability model
// Weights: team overall 30% | h2h 25% | champ scores 45%
function calcProb(
  db: EsportsDB,
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

  const wA = hasChamps ? 0.30 * wrA + 0.25 * h2hA + 0.45 * csA
                       : 0.55 * wrA + 0.45 * h2hA;
  const wB = hasChamps ? 0.30 * wrB + 0.25 * h2hB + 0.45 * csB
                       : 0.55 * wrB + 0.45 * h2hB;

  const total = wA + wB;
  return {
    probA: total === 0 ? 0.5 : wA / total,
    probB: total === 0 ? 0.5 : wB / total,
    wrA, wrB, h2hA, h2hB, csA, csB, hasChamps,
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

  // Gemini scan
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('pvs_gemini_key') ?? '');
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setScanImg(reader.result as string); setScanError(null); setScanResult(null); };
    reader.readAsDataURL(file);
  };

  const scanWithGemini = async () => {
    if (!scanImg || !geminiKey) return;
    setScanLoading(true); setScanError(null); setScanResult(null);
    try {
      const base64 = scanImg.split(',')[1];
      const mimeType = scanImg.split(';')[0].split(':')[1];
      const prompt = `You are analyzing a League of Legends esports champion pick/ban phase screenshot.
Extract the following and respond ONLY with valid JSON (no markdown, no explanation):
{
  "teamA": {
    "name": "team name or empty string",
    "players": [
      {"name": "player name or empty string", "champion": "exact champion name as in the game", "position": "Top"},
      {"name": "", "champion": "", "position": "Jungle"},
      {"name": "", "champion": "", "position": "Mid"},
      {"name": "", "champion": "", "position": "Bot"},
      {"name": "", "champion": "", "position": "Support"}
    ]
  },
  "teamB": {
    "name": "team name or empty string",
    "players": [
      {"name": "", "champion": "", "position": "Top"},
      {"name": "", "champion": "", "position": "Jungle"},
      {"name": "", "champion": "", "position": "Mid"},
      {"name": "", "champion": "", "position": "Bot"},
      {"name": "", "champion": "", "position": "Support"}
    ]
  }
}
Always return all 5 players for each team. Use empty strings for anything not visible. Champion names must be exact game names (e.g. "K'Sante", "Bel'Veth", "Aurelion Sol").`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: prompt }] }],
            generationConfig: { temperature: 0.1 },
          }),
        }
      );
      if (!res.ok) { const t = await res.text(); throw new Error(`Gemini ${res.status}: ${t}`); }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      // strip possible markdown fences
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      setScanResult(clean);

      // Auto-populate teams
      if (parsed.teamA?.name) setTeamA(parsed.teamA.name);
      if (parsed.teamB?.name) setTeamB(parsed.teamB.name);
      if (parsed.teamA?.players) {
        setRosterA(parsed.teamA.players.map((p: any) => p.name ?? ''));
        setChampsA(parsed.teamA.players.map((p: any) => p.champion ?? ''));
      }
      if (parsed.teamB?.players) {
        setRosterB(parsed.teamB.players.map((p: any) => p.name ?? ''));
        setChampsB(parsed.teamB.players.map((p: any) => p.champion ?? ''));
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
    return calcProb(db, teamA, teamB, champsA, champsB, rosterA, rosterB);
  }, [db, teamA, teamB, champsA, champsB, rosterA, rosterB]);

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

        {/* ── Gemini Scan ── */}
        <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-blue-400 tracking-widest">SCAN CHAMPION SELECT — powered by Gemini</div>
            <span className="text-[9px] text-gray-600">upload a screenshot to auto-fill the draft</span>
          </div>

          {/* API key */}
          <div className="flex items-center gap-3">
            <label className="text-[10px] text-gray-500 shrink-0 w-24">Gemini API Key</label>
            <input
              type="password"
              value={geminiKey}
              onChange={e => { setGeminiKey(e.target.value); localStorage.setItem('pvs_gemini_key', e.target.value); }}
              placeholder="AIza…"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-300 placeholder:text-gray-700 focus:outline-none focus:border-blue-500/50"
            />
          </div>

          {/* Upload area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border border-dashed border-white/20 rounded-xl p-6 text-center cursor-pointer hover:border-blue-500/40 hover:bg-blue-500/5 transition-all"
          >
            {scanImg ? (
              <img src={scanImg} alt="champion select screenshot" className="max-h-48 mx-auto rounded-lg object-contain" />
            ) : (
              <div className="space-y-2">
                <div className="text-3xl">📸</div>
                <div className="text-xs text-gray-500">Click to upload champion select screenshot</div>
                <div className="text-[10px] text-gray-700">PNG, JPG, WebP supported</div>
              </div>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />

          {/* Scan button */}
          <div className="flex items-center gap-3">
            <button
              onClick={scanWithGemini}
              disabled={!scanImg || !geminiKey || scanLoading}
              className="px-5 py-2 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-400 text-xs font-mono hover:bg-blue-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {scanLoading ? (
                <><span className="animate-spin inline-block w-3 h-3 border border-blue-400 border-t-transparent rounded-full" />analysing…</>
              ) : '✦ Scan with Gemini'}
            </button>
            {scanImg && (
              <button onClick={() => { setScanImg(null); setScanResult(null); setScanError(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">clear</button>
            )}
            {scanError && <span className="text-[10px] text-red-400">{scanError}</span>}
            {scanResult && !scanError && <span className="text-[10px] text-green-400">✓ Draft populated</span>}
          </div>
        </div>

        {/* ── Matchup Predictor ── */}
        <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 space-y-6">
          <div className="text-[10px] text-blue-400 tracking-widest">MATCHUP PREDICTOR</div>

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
            <div className="grid grid-cols-2 gap-6">
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
                        <div className="flex items-center gap-2 pl-14">
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
                        <div className="flex items-center gap-2 pl-14">
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
