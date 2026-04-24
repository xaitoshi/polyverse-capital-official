import { useState, useEffect, useCallback } from 'react';
import { ExternalLink, Search, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────
interface PolyMarket { id: string; question: string; outcomes: string[]; prices: string[]; volume: number }
interface PolyEvent  { id: string; title: string; slug: string; volume: number; markets: PolyMarket[] }
interface Transcript { label: string; date: string; content: string }
interface PhraseCount { count: number; snippets: string[] }

// ── Helpers ────────────────────────────────────────────────────────────────────
function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function countPhrase(content: string, phrase: string): PhraseCount {
  if (!phrase.trim()) return { count: 0, snippets: [] };
  const re = new RegExp(escapeRegex(phrase), 'gi');
  const count = (content.match(re) ?? []).length;
  const snippets: string[] = [];
  const snipRe = new RegExp(escapeRegex(phrase), 'gi');
  let m: RegExpExecArray | null;
  while ((m = snipRe.exec(content)) !== null && snippets.length < 3) {
    const s = Math.max(0, m.index - 90);
    const e = Math.min(content.length, m.index + phrase.length + 90);
    snippets.push(content.slice(s, e).replace(/\s+/g, ' ').trim());
  }
  return { count, snippets };
}

function highlightPhrase(text: string, phrase: string) {
  const parts = text.split(new RegExp(`(${escapeRegex(phrase)})`, 'gi'));
  return parts.map((p, i) =>
    p.toLowerCase() === phrase.toLowerCase()
      ? <mark key={i} className="bg-transparent text-blue-400 font-bold">{p}</mark>
      : <span key={i}>{p}</span>
  );
}

function extractPhrases(question: string): string[] {
  const out: string[] = [];
  // "mention X" — most common pattern
  const m1 = question.match(/\bmentions?\s+["']?([A-Za-z][^"'?,.\n(]{1,40}?)["']?\s*(?:\bin\b|\bon\b|\bduring\b|\?|$)/i);
  if (m1) out.push(m1[1].trim());
  // "beat/miss/exceed metric"
  const m2 = question.match(/\b(beat|miss|exceed|top|hit)\s+((?:EPS|earnings|revenue|sales|estimates?|expectations?)(?:\s+(?:estimates?|expectations?))?)/i);
  if (m2) out.push(m2[0].trim());
  // "raise/lower/cut guidance"
  const m3 = question.match(/\b(raise|lower|cut|increase|maintain|lift)\s+(guidance|forecast|outlook)/i);
  if (m3) out.push(m3[0].trim());
  // Surface any standalone high-value keywords present in question
  ['buyback', 'dividend', 'capex', 'margin', 'layoff', 'acquisition', 'tariff', 'China', 'AI', 'AGI'].forEach(kw => {
    if (new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i').test(question) && !out.some(o => o.toLowerCase() === kw.toLowerCase()))
      out.push(kw);
  });
  return [...new Set(out)].filter(p => p.length > 1).slice(0, 5);
}

function maxCount(transcripts: Transcript[], phrase: string) {
  return Math.max(1, ...transcripts.map(t => countPhrase(t.content, phrase).count));
}

const fmtVol = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`;

// ── Sub-components ─────────────────────────────────────────────────────────────
function PhraseRow({ phrase, transcripts, snippetsOpen, onToggle }: {
  phrase: string; transcripts: Transcript[]; snippetsOpen: boolean; onToggle: () => void
}) {
  const counts = transcripts.map(t => countPhrase(t.content, phrase));
  const total = counts.reduce((s, c) => s + c.count, 0);
  const peak = Math.max(1, ...counts.map(c => c.count));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-[10px] uppercase tracking-[0.2em] text-ink-dim shrink-0 w-20">PHRASE</span>
        <span className="phosphor text-xs font-bold">"{phrase}"</span>
        <span className="ml-auto text-[10px] text-ink-dim">{total} total</span>
        {total > 0 && (
          <button onClick={onToggle}
            className="text-[9px] uppercase tracking-wider text-ink-dim hover:text-blue-400 flex items-center gap-0.5 transition-colors">
            snippets {snippetsOpen ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
          </button>
        )}
      </div>

      {/* Per-quarter bars */}
      <div className="space-y-1 pl-2">
        {transcripts.map((t, i) => {
          const { count } = counts[i];
          const pct = (count / peak) * 100;
          const color = count === 0 ? 'bg-white/10' : count >= peak * 0.7 ? 'bg-blue-400' : 'bg-blue-400/60';
          return (
            <div key={t.label} className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-ink-dim w-14 shrink-0">{t.label}</span>
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
              </div>
              <span className={`text-[9px] font-mono w-6 text-right shrink-0 ${count === 0 ? 'text-ink-dim/40' : 'text-blue-400'}`}>
                {count}
              </span>
            </div>
          );
        })}
      </div>

      {/* Snippets */}
      {snippetsOpen && (
        <div className="pl-2 space-y-1.5 mt-1">
          {counts.flatMap((c, qi) =>
            c.snippets.map((snip, si) => (
              <div key={`${qi}-${si}`} className="text-[10px] text-ink-dim/70 leading-relaxed border-l border-blue-400/20 pl-3 italic">
                …{highlightPhrase(snip, phrase)}…
                <span className="not-italic ml-2 text-[9px] text-ink-dim/40">{transcripts[qi].label}</span>
              </div>
            ))
          )}
          {counts.every(c => c.snippets.length === 0) && (
            <div className="text-[10px] text-ink-dim/40 pl-3">no occurrences found</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Standalone transcript phrase search ────────────────────────────────────────
function TranscriptSearchPanel({ transcripts }: { transcripts: Transcript[] }) {
  const [phrase, setPhrase] = useState('');
  const [pinned, setPinned] = useState<string[]>([]);
  const [openSnippets, setOpenSnippets] = useState<Set<string>>(new Set());

  const active = phrase.trim();

  const pin = () => {
    if (active && !pinned.includes(active)) setPinned(p => [...p, active]);
    setPhrase('');
  };

  const toggleSnippet = (p: string) =>
    setOpenSnippets(s => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });

  return (
    <div className="ascii-panel rounded-sm overflow-hidden">
      <div className="ascii-panel-heading px-4 py-2.5 flex items-center gap-3">
        <span className="phosphor text-[10px] uppercase tracking-[0.25em]">◎ TRANSCRIPT PHRASE SEARCH</span>
        <span className="text-ink-dim/50 text-[9px]">{transcripts.length} quarters loaded</span>
      </div>
      <div className="p-4 space-y-4">
        {/* Input row */}
        <div className="flex items-center gap-2">
          <input value={phrase} onChange={e => setPhrase(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && pin()}
            placeholder="e.g. tariff, AI, buyback, cloud revenue_"
            className="flex-1 bg-transparent border-b border-blue-400/30 focus:border-blue-400 outline-none text-[11px] text-ink placeholder:text-ink-dim/30 pb-0.5 transition-colors" />
          <button onClick={pin} disabled={!active}
            className="text-[9px] uppercase tracking-wider border border-blue-400/30 px-2 py-1 text-ink-dim hover:text-blue-400 hover:border-blue-400/50 disabled:opacity-30 transition-colors rounded-sm shrink-0">
            PIN +
          </button>
        </div>

        {/* Live result as you type */}
        {active && (
          <PhraseRow phrase={active} transcripts={transcripts}
            snippetsOpen={openSnippets.has(active)} onToggle={() => toggleSnippet(active)} />
        )}

        {/* Pinned phrases */}
        {pinned.length > 0 && (
          <div className="space-y-4 border-t border-blue-400/10 pt-4">
            <div className="text-[9px] uppercase tracking-[0.25em] text-ink-dim">PINNED PHRASES</div>
            {pinned.map(p => (
              <div key={p} className="relative pr-5">
                <PhraseRow phrase={p} transcripts={transcripts}
                  snippetsOpen={openSnippets.has(p)} onToggle={() => toggleSnippet(p)} />
                <button onClick={() => setPinned(c => c.filter(x => x !== p))}
                  className="absolute top-0 right-0 text-ink-dim/40 hover:text-red-400 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {transcripts.length === 0 && (
          <div className="text-[10px] text-amber/60 border border-amber/20 px-3 py-2 rounded-sm">
            no transcripts loaded — check that FMP_KEY is set in Vercel env vars and redeploy
          </div>
        )}

        {transcripts.length > 0 && !active && pinned.length === 0 && (
          <div className="text-[10px] text-ink-dim/40">
            type a phrase — counts update live · press Enter or PIN to save for comparison
          </div>
        )}
      </div>
    </div>
  );
}

function MarketCard({ event, transcripts, hasTranscripts }: {
  event: PolyEvent; transcripts: Transcript[]; hasTranscripts: boolean
}) {
  const topMkt = event.markets[0];
  const yesPrice = topMkt ? parseFloat(topMkt.prices[0] ?? '0.5') : 0.5;
  const allPhrases = [...new Set(event.markets.flatMap(m => extractPhrases(m.question)))].slice(0, 6);
  const [customPhrases, setCustomPhrases] = useState<string[]>([]);
  const [newPhrase, setNewPhrase] = useState('');
  const [openSnippets, setOpenSnippets] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(true);

  const phrases = [...allPhrases, ...customPhrases];
  const polyUrl = event.slug ? `https://polymarket.com/event/${event.slug}` : 'https://polymarket.com';

  const addPhrase = () => {
    const p = newPhrase.trim();
    if (p && !phrases.includes(p)) { setCustomPhrases(c => [...c, p]); }
    setNewPhrase('');
  };

  const toggleSnippet = (phrase: string) =>
    setOpenSnippets(s => { const n = new Set(s); n.has(phrase) ? n.delete(phrase) : n.add(phrase); return n; });

  const bestCount = hasTranscripts && phrases.length > 0
    ? Math.max(...phrases.map(p => transcripts.reduce((s, t) => s + countPhrase(t.content, p).count, 0)))
    : null;

  return (
    <div className="ascii-panel rounded-sm overflow-hidden">
      {/* Card header */}
      <div className="ascii-panel-heading px-4 py-2.5 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.2em] text-ink-dim mb-0.5">
            {event.markets.length > 1 ? `${event.markets.length} MARKETS` : 'MARKET'}
          </div>
          <div className="text-xs text-ink leading-snug">{event.title}</div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="phosphor text-sm font-bold">{Math.round(yesPrice * 100)}%</div>
            <div className="text-[9px] text-ink-dim">YES</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-amber font-mono">{fmtVol(event.volume)}</div>
            <div className="text-[9px] text-ink-dim">VOL</div>
          </div>
          <a href={polyUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-ink-dim hover:text-blue-400 transition-colors border border-blue-400/20 hover:border-blue-400/50 px-2 py-1 rounded-sm">
            TRADE <ExternalLink className="w-2.5 h-2.5" />
          </a>
          <button onClick={() => setExpanded(v => !v)} className="text-ink-dim hover:text-blue-400 transition-colors">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* YES probability bar */}
      <div className="h-0.5 bg-white/5">
        <div className="h-full bg-blue-400/50" style={{ width: `${yesPrice * 100}%` }} />
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          {/* Individual markets if multiple */}
          {event.markets.length > 1 && (
            <div className="space-y-1">
              {event.markets.map(m => (
                <div key={m.id} className="flex items-center gap-2 text-[10px]">
                  <span className="text-ink-dim truncate flex-1">{m.question}</span>
                  <span className="phosphor shrink-0">{Math.round(parseFloat(m.prices[0] ?? '0.5') * 100)}%</span>
                </div>
              ))}
            </div>
          )}

          {/* Phrase analysis */}
          {phrases.length > 0 ? (
            <div className="space-y-4">
              {hasTranscripts ? (
                phrases.map(phrase => (
                  <PhraseRow key={phrase} phrase={phrase} transcripts={transcripts}
                    snippetsOpen={openSnippets.has(phrase)} onToggle={() => toggleSnippet(phrase)} />
                ))
              ) : (
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-ink-dim">EXTRACTED PHRASES</div>
                  <div className="flex flex-wrap gap-2">
                    {phrases.map(p => (
                      <span key={p} className="text-[10px] border border-blue-400/25 px-2 py-0.5 rounded-sm text-blue-400/80">"{p}"</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-[10px] text-ink-dim/50">no phrases extracted — add one below</div>
          )}

          {/* Add custom phrase */}
          <div className="flex items-center gap-2 pt-1 border-t border-blue-400/10">
            <span className="text-[9px] uppercase tracking-wider text-ink-dim shrink-0">+ ADD PHRASE</span>
            <input value={newPhrase} onChange={e => setNewPhrase(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addPhrase()}
              placeholder="e.g. tariff, agentic, buyback_"
              className="flex-1 bg-transparent border-b border-blue-400/20 focus:border-blue-400/50 outline-none text-[10px] text-ink placeholder:text-ink-dim/30 pb-0.5 transition-colors" />
            <button onClick={addPhrase} disabled={!newPhrase.trim()}
              className="text-blue-400/60 hover:text-blue-400 disabled:opacity-30 transition-colors">
              <Plus className="w-3 h-3" />
            </button>
            {customPhrases.map(p => (
              <button key={p} onClick={() => setCustomPhrases(c => c.filter(x => x !== p))}
                className="text-[9px] border border-blue-400/20 px-1.5 py-0.5 rounded-sm text-ink-dim hover:text-red-400 hover:border-red-400/30 flex items-center gap-1 transition-colors">
                {p} <X className="w-2 h-2" />
              </button>
            ))}
          </div>

          {bestCount !== null && bestCount > 0 && (
            <div className="text-[9px] text-green-400/70 flex items-center gap-1">
              ✓ top phrase mentioned {bestCount}× across {transcripts.length} transcripts
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function MentionsPage() {
  const [ticker, setTicker] = useState('');
  const [quarters, setQuarters] = useState(4);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [events, setEvents] = useState<PolyEvent[]>([]);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [error, setError] = useState('');
  const [submittedTicker, setSubmittedTicker] = useState('');

  const scan = useCallback(async () => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setPhase('loading');
    setError('');
    setEvents([]);
    setTranscripts([]);
    setSubmittedTicker(t);
    try {
      await Promise.all([
        fetch(`/api/mentions?action=markets&ticker=${t}`)
          .then(r => r.json())
          .then(d => { if (Array.isArray(d)) setEvents(d); }),
        fetch('/api/mentions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'transcripts', ticker: t, quarters }),
        })
          .then(r => r.json())
          .then(d => { if (Array.isArray(d)) setTranscripts(d); }),
      ]);
      setPhase('done');
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Unknown error');
      setPhase('error');
    }
  }, [ticker, quarters]);

  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') scan(); };

  return (
    <div className="min-h-screen bg-[#04070c] font-mono text-ink">

      {/* ── Terminal frame ─────────────────────────────────────────────────── */}
      <div className="ascii-panel crt-scanlines crt-flicker min-h-screen flex flex-col rounded-none border-0">

        {/* Header bar */}
        <header className="ascii-panel-heading flex items-center gap-3 px-4 py-2.5 text-[11px] uppercase tracking-[0.25em] shrink-0">
          <span className="phosphor">[ MENTIONS ]</span>
          <span className="text-ink-dim">{'//'}</span>
          <span className="phosphor-amber">POLYMARKET EARNINGS TRACKER</span>
          <span className="ml-auto flex items-center gap-3 text-ink-dim">
            <a href="/" className="border border-blue-400/30 px-2 py-1 text-[10px] hover:bg-blue-400/10 transition-colors">
              ← POLYVERSE
            </a>
            <span className="phosphor">● LIVE<span className="blink">_</span></span>
          </span>
        </header>

        <div className="flex-1 p-4 md:p-6 space-y-5 max-w-4xl mx-auto w-full">

          {/* ── Input row ────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <div className="text-[9px] uppercase tracking-[0.25em] text-ink-dim">TICKER</div>
              <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} onKeyDown={onKey}
                placeholder="AAPL_"
                className="w-24 bg-transparent border-b-2 border-blue-400/40 focus:border-blue-400 outline-none text-sm text-blue-400 font-bold tracking-wider placeholder:text-ink-dim/30 pb-0.5 uppercase transition-colors" />
            </div>

            <div className="space-y-1">
              <div className="text-[9px] uppercase tracking-[0.25em] text-ink-dim">QUARTERS</div>
              <select value={quarters} onChange={e => setQuarters(Number(e.target.value))}
                className="bg-[#04070c] border border-blue-400/25 text-ink text-[11px] px-2 py-1 rounded-sm focus:outline-none focus:border-blue-400/50">
                {[2, 3, 4].map(q => <option key={q} value={q}>{q}Q</option>)}
              </select>
            </div>

            <button onClick={scan} disabled={!ticker.trim() || phase === 'loading'}
              className="flex items-center gap-2 px-4 py-2 border border-blue-400/40 text-blue-400 text-[10px] uppercase tracking-[0.25em]
                         hover:bg-blue-400/10 hover:border-blue-400/70 disabled:opacity-40 disabled:cursor-not-allowed transition-all rounded-sm">
              {phase === 'loading'
                ? <><span className="w-2.5 h-2.5 border border-blue-400 border-t-transparent rounded-full animate-spin" />SCANNING<span className="blink">_</span></>
                : <><Search className="w-3 h-3" />SCAN</>}
            </button>
          </div>

          {/* ── Status / errors ──────────────────────────────────────────── */}
          {phase === 'error' && (
            <div className="text-[11px] text-red-400 border border-red-400/20 px-3 py-2 rounded-sm">
              ERROR: {error}
            </div>
          )}

          {/* ── Results ──────────────────────────────────────────────────── */}
          {phase === 'done' && (
            <>
              {/* Stats row */}
              <div className="flex items-center gap-6 text-[10px] uppercase tracking-[0.2em]">
                <span className="text-ink-dim">TICKER</span>
                <span className="phosphor font-bold text-sm">{submittedTicker}</span>
                <span className="text-ink-dim ml-4">MARKETS</span>
                <span className="phosphor">{events.length}</span>
                {transcripts.length > 0 && <>
                  <span className="text-ink-dim ml-4">TRANSCRIPTS</span>
                  <span className="phosphor">{transcripts.length}</span>
                </>}
              </div>

              {/* Transcript summary strip */}
              {transcripts.length > 0 && (
                <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide text-[10px]">
                  <span className="text-ink-dim uppercase tracking-[0.2em] shrink-0">LOADED</span>
                  {transcripts.map(t => (
                    <span key={t.label} className="border border-blue-400/20 px-2 py-0.5 rounded-sm text-blue-400/70 shrink-0">
                      {t.label} · {(t.content.length / 1000).toFixed(0)}k chars
                    </span>
                  ))}
                </div>
              )}

              {/* Standalone transcript search — always shown after scan */}
              <TranscriptSearchPanel transcripts={transcripts} />

              {/* Market cards */}
              {events.length === 0 ? (
                <div className="text-center py-16 space-y-2">
                  <div className="text-ink-dim text-[11px] uppercase tracking-[0.3em]">no active markets found</div>
                  <div className="text-ink-dim/40 text-[10px]">
                    {submittedTicker} may not have upcoming earnings markets on Polymarket yet
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-[9px] uppercase tracking-[0.3em] text-ink-dim">
                    › LIVE POLYMARKET MARKETS · {events.length} found
                  </div>
                  {events.map(event => (
                    <MarketCard key={event.id} event={event}
                      transcripts={transcripts} hasTranscripts={transcripts.length > 0} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Idle state ───────────────────────────────────────────────── */}
          {phase === 'idle' && (
            <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
              <div className="text-[11px] uppercase tracking-[0.3em] text-ink-dim">awaiting ticker</div>
              <div className="phosphor text-sm">◉ ENTER A TICKER TO SCAN<span className="blink">_</span></div>
              <p className="text-[11px] text-ink-dim/60 max-w-sm leading-relaxed">
                Finds live Polymarket earnings markets, extracts bet phrases, then counts how often each
                phrase appeared in previous earnings call transcripts.
              </p>
              <div className="grid grid-cols-3 gap-3 mt-4 text-[10px] text-ink-dim/50">
                {['AAPL', 'NVDA', 'TSLA', 'META', 'MSFT', 'AMZN'].map(t => (
                  <button key={t} onClick={() => { setTicker(t); }}
                    className="border border-blue-400/10 px-3 py-1.5 hover:border-blue-400/30 hover:text-blue-400 transition-colors rounded-sm">
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
