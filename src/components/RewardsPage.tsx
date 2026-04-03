import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import {
  type RewardsMarket,
  calculateRiskAverseScore,
  getDaysUntilResolution,
  formatDaysLeft,
  daysColor,
  scoreColor,
  estimateDailyYield,
} from '../lib/rewardsScoring';

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchRewardsMarkets(): Promise<RewardsMarket[]> {
  // Fetch CLOB rewards markets (authoritative for reward fields)
  const clobRes = await fetch('/api/clob/rewards/markets/multi');
  const clobData = await clobRes.json();
  const rawMarkets: RewardsMarket[] = (clobData.data ?? []).filter(
    (m: RewardsMarket) => m.rewards_config && m.rewards_config.length > 0,
  );

  // Fetch Gamma API for correct end dates (CLOB end_dates are often wrong)
  const gammaRes = await fetch(
    '/api/polymarket/markets?active=true&closed=false&limit=500&order=volume&ascending=false',
  );
  const gammaData = await gammaRes.json();
  const gammaMap: Record<string, string> = {};
  if (Array.isArray(gammaData)) {
    for (const m of gammaData) {
      if (m.slug && m.endDate) gammaMap[m.slug] = m.endDate;
    }
  }

  // Merge and score
  return rawMarkets.map(m => {
    const endDate = gammaMap[m.market_slug] ?? m.end_date;
    const days = getDaysUntilResolution(endDate);
    const enriched: RewardsMarket = { ...m, resolved_end_date: endDate, daysUntilResolution: days };
    const { score, breakdown } = calculateRiskAverseScore(enriched);
    return { ...enriched, riskScore: score, scoreBreakdown: breakdown };
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBadge({ score, breakdown }: { score: number; breakdown: NonNullable<RewardsMarket['scoreBreakdown']> }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-block" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <span className={`inline-flex items-center justify-center w-10 h-7 rounded-lg border text-xs font-bold cursor-default ${scoreColor(score)}`}>
        {score}
      </span>
      {show && (
        <div className="absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-52 bg-[#0d0d0d] border border-white/10 rounded-xl p-3 shadow-xl text-[10px] space-y-1.5">
          <div className="text-gray-400 font-semibold tracking-wider mb-2">SCORE BREAKDOWN</div>
          {[
            { label: 'Daily Rate', val: breakdown.dailyRate, max: 25 },
            { label: 'Spread Width', val: breakdown.spreadWidth, max: 20 },
            { label: 'Time Until Resolution', val: breakdown.daysUntilResolution, max: 30 },
            { label: 'Min Size (Inverse)', val: breakdown.minSizeInverse, max: 10 },
            { label: 'Low Competition', val: breakdown.lowCompetitiveness, max: 15 },
          ].map(({ label, val, max }) => (
            <div key={label}>
              <div className="flex justify-between mb-0.5">
                <span className="text-gray-500">{label}</span>
                <span className="text-gray-300 font-mono">{val}/{max}</span>
              </div>
              <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full bg-blue-500/60" style={{ width: `${(val / max) * 100}%` }} />
              </div>
            </div>
          ))}
          {breakdown.penalty < 0 && (
            <div className="flex justify-between text-red-400 pt-1 border-t border-white/5">
              <span>Short duration penalty</span>
              <span>{breakdown.penalty}</span>
            </div>
          )}
          <div className="flex justify-between text-white font-semibold pt-1 border-t border-white/10">
            <span>Total</span>
            <span>{breakdown.total}/100</span>
          </div>
          <div className="text-gray-700 pt-1 leading-tight">
            Longer resolution time = more days for your orders to earn before market closes.
          </div>
        </div>
      )}
    </div>
  );
}

function LPSimulator({ market }: { market: RewardsMarket }) {
  const [capital, setCapital] = useState(1000);
  const [spread, setSpread] = useState(market.rewards_max_spread / 2);

  const dailyRate = market.rewards_config.reduce((s, r) => s + r.rate_per_day, 0);
  const spreadOk = spread <= market.rewards_max_spread && capital >= market.rewards_min_size;
  const estimatedDaily = spreadOk ? estimateDailyYield(market, capital) : 0;
  const days = market.daysUntilResolution ?? 0;
  const totalEstimated = estimatedDaily * days;
  const annualizedPct = capital > 0 && estimatedDaily > 0
    ? ((estimatedDaily * 365) / capital) * 100
    : 0;

  return (
    <div className="space-y-4 bg-white/[0.02] rounded-xl border border-white/8 p-4">
      <div className="text-xs text-blue-400 font-semibold tracking-wider">LP SIMULATOR</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-gray-500 tracking-wider block mb-1">CAPITAL ($)</label>
          <input
            type="number"
            value={capital}
            onChange={e => setCapital(Number(e.target.value))}
            min={market.rewards_min_size}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500/50"
          />
          {capital < market.rewards_min_size && (
            <p className="text-[10px] text-red-400 mt-1">Min: ${market.rewards_min_size}</p>
          )}
        </div>
        <div>
          <label className="text-[10px] text-gray-500 tracking-wider block mb-1">
            TARGET SPREAD (≤{market.rewards_max_spread}%)
          </label>
          <input
            type="number"
            value={spread}
            onChange={e => setSpread(Number(e.target.value))}
            step={0.1}
            min={0.1}
            max={market.rewards_max_spread}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500/50"
          />
          {spread > market.rewards_max_spread && (
            <p className="text-[10px] text-red-400 mt-1">Exceeds max spread — orders won't score</p>
          )}
        </div>
      </div>
      {spreadOk ? (
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3 text-center">
            <div className="text-sm font-bold text-blue-400 font-mono">${estimatedDaily.toFixed(3)}</div>
            <div className="text-[10px] text-gray-600 mt-0.5">Est. daily</div>
          </div>
          <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3 text-center">
            <div className="text-sm font-bold text-white font-mono">${totalEstimated.toFixed(2)}</div>
            <div className="text-[10px] text-gray-600 mt-0.5">Over {Math.floor(days)}d</div>
          </div>
          <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3 text-center">
            <div className="text-sm font-bold text-blue-400 font-mono">{annualizedPct.toFixed(1)}%</div>
            <div className="text-[10px] text-gray-600 mt-0.5">Ann. yield</div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-gray-600 text-center py-2">Fix inputs above to see projection</div>
      )}
      <p className="text-[10px] text-gray-700 leading-relaxed">
        Estimates assume your capital is fully deployed within the qualifying spread for the full duration.
        Rewards paid daily ~midnight UTC. Inventory risk and competition still apply.
        Competitiveness metric: {market.market_competitiveness.toLocaleString()}.
      </p>
    </div>
  );
}

function MarketModal({ market, onClose, onLogJournal }: {
  market: RewardsMarket;
  onClose: () => void;
  onLogJournal: (m: RewardsMarket) => void;
}) {
  const dailyRate = market.rewards_config.reduce((s, r) => s + r.rate_per_day, 0);
  const yesPrice = market.tokens.find(t => t.outcome === 'Yes')?.price;
  const noPrice = market.tokens.find(t => t.outcome === 'No')?.price;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <img src={market.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 mt-0.5" />
              <div>
                <h2 className="text-white font-semibold text-sm leading-snug">{market.question}</h2>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className={`text-[10px] font-mono ${daysColor(market.daysUntilResolution ?? 0)}`}>
                    {formatDaysLeft(market.daysUntilResolution ?? 0)} left
                  </span>
                  <span className="text-gray-700">·</span>
                  <span className="text-[10px] text-gray-500 font-mono">${dailyRate}/day</span>
                  <span className="text-gray-700">·</span>
                  <span className="text-[10px] text-gray-500 font-mono">spread ≤{market.rewards_max_spread}%</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-600 hover:text-gray-400 shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Market stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'YES Price', val: yesPrice != null ? `${(yesPrice * 100).toFixed(1)}¢` : '—' },
              { label: 'NO Price', val: noPrice != null ? `${(noPrice * 100).toFixed(1)}¢` : '—' },
              { label: 'Min Size', val: `$${market.rewards_min_size}` },
              { label: 'Current Spread', val: `${(market.spread * 100).toFixed(2)}%` },
            ].map(({ label, val }) => (
              <div key={label} className="bg-white/[0.03] border border-white/8 rounded-xl p-3 text-center">
                <div className="text-sm font-bold text-white font-mono">{val}</div>
                <div className="text-[10px] text-gray-600 mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Risk score */}
          {market.scoreBreakdown && (
            <div className="bg-white/[0.02] border border-white/8 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500 tracking-wider">RISK-AVERSE SCORE</span>
                <span className={`text-lg font-bold font-mono ${scoreColor(market.riskScore ?? 0).split(' ')[0]}`}>
                  {market.riskScore}/100
                </span>
              </div>
              <div className="space-y-1.5">
                {[
                  { label: 'Daily Rate', val: market.scoreBreakdown.dailyRate, max: 25 },
                  { label: 'Spread Width', val: market.scoreBreakdown.spreadWidth, max: 20 },
                  { label: 'Time Until Resolution', val: market.scoreBreakdown.daysUntilResolution, max: 30 },
                  { label: 'Min Size (Accessibility)', val: market.scoreBreakdown.minSizeInverse, max: 10 },
                  { label: 'Low Competition', val: market.scoreBreakdown.lowCompetitiveness, max: 15 },
                ].map(({ label, val, max }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-[10px] text-gray-500 w-40 shrink-0">{label}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500/50" style={{ width: `${(val / max) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono w-10 text-right">{val}/{max}</span>
                  </div>
                ))}
                {market.scoreBreakdown.penalty < 0 && (
                  <div className="flex items-center gap-3 text-red-400">
                    <span className="text-[10px] w-40 shrink-0">Short duration penalty</span>
                    <div className="flex-1" />
                    <span className="text-[10px] font-mono w-10 text-right">{market.scoreBreakdown.penalty}</span>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-gray-700 pt-1">
                Longer resolution time = more time for your limit orders to earn rewards before the market closes.
              </p>
            </div>
          )}

          {/* LP Simulator */}
          <LPSimulator market={market} />

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <a
              href={`https://polymarket.com/event/${market.event_slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400 text-xs text-center hover:border-white/20 hover:text-white transition-colors"
            >
              View on Polymarket ↗
            </a>
            <button
              onClick={() => { onLogJournal(market); onClose(); }}
              className="flex-1 py-2.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 text-xs font-semibold hover:bg-blue-500/25 transition-colors"
            >
              + Log to Journal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogJournalModal({ market, onClose, onSave }: {
  market: RewardsMarket;
  onClose: () => void;
  onSave: (entry: LPJournalEntry) => void;
}) {
  const dailyRate = market.rewards_config.reduce((s, r) => s + r.rate_per_day, 0);
  const [capital, setCapital] = useState(1000);
  const [targetSpread, setTargetSpread] = useState(market.rewards_max_spread / 2);
  const [notes, setNotes] = useState('');

  const days = market.daysUntilResolution ?? 0;
  const estimatedDaily = estimateDailyYield(market, capital);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-white/8 flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Log LP Position</span>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-xs text-gray-400 leading-snug">{market.question}</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 tracking-wider block mb-1">CAPITAL ($)</label>
              <input type="number" value={capital} onChange={e => setCapital(Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500/50" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 tracking-wider block mb-1">TARGET SPREAD (%)</label>
              <input type="number" value={targetSpread} onChange={e => setTargetSpread(Number(e.target.value))}
                step={0.1} max={market.rewards_max_spread}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500/50" />
            </div>
          </div>
          <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3 flex items-center justify-between">
            <span className="text-xs text-gray-500">Est. daily reward</span>
            <span className="text-sm font-bold text-blue-400 font-mono">${estimatedDaily.toFixed(3)}</span>
          </div>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Notes (optional)..."
            rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-700 font-mono focus:outline-none focus:border-blue-500/50 resize-none"
          />
          <button
            onClick={() => {
              onSave({
                market: market.question,
                conditionId: market.condition_id,
                capital,
                targetSpread,
                expectedDays: Math.floor(days),
                dailyRate,
                estimatedDaily,
                loggedAt: new Date().toISOString(),
                notes,
              });
              onClose();
            }}
            className="w-full py-2.5 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-400 font-semibold text-sm hover:bg-blue-500/30 transition-colors"
          >
            Save Position
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── LP Journal (localStorage) ────────────────────────────────────────────────

export interface LPJournalEntry {
  market: string;
  conditionId: string;
  capital: number;
  targetSpread: number;
  expectedDays: number;
  dailyRate: number;
  estimatedDaily: number;
  loggedAt: string;
  notes: string;
}

const LP_JOURNAL_KEY = 'klvs_lp_journal';
function loadLPJournal(): LPJournalEntry[] {
  try { return JSON.parse(localStorage.getItem(LP_JOURNAL_KEY) ?? '[]'); }
  catch { return []; }
}
function saveLPJournal(entries: LPJournalEntry[]) {
  localStorage.setItem(LP_JOURNAL_KEY, JSON.stringify(entries));
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type SortKey = 'riskScore' | 'dailyRate' | 'daysUntilResolution' | 'rewards_min_size' | 'market_competitiveness';

export default function RewardsPage() {
  const { user } = useAuth();

  const { data: markets = [], isLoading, isError, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ['rewards-markets'],
    queryFn: fetchRewardsMarkets,
    staleTime: 3 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const [search, setSearch] = useState('');
  const [minDays, setMinDays] = useState(0);
  const [minRate, setMinRate] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('riskScore');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<RewardsMarket | null>(null);
  const [logTarget, setLogTarget] = useState<RewardsMarket | null>(null);
  const [lpJournal, setLPJournal] = useState<LPJournalEntry[]>(loadLPJournal);
  const [showJournal, setShowJournal] = useState(false);

  const saveEntry = (entry: LPJournalEntry) => {
    const updated = [entry, ...lpJournal];
    setLPJournal(updated);
    saveLPJournal(updated);
  };

  const removeEntry = (idx: number) => {
    const updated = lpJournal.filter((_, i) => i !== idx);
    setLPJournal(updated);
    saveLPJournal(updated);
  };

  const setSweetSpot = () => {
    setMinDays(7);
    setMinRate(1);
    setSortKey('riskScore');
    setSortAsc(false);
    setSearch('');
  };

  const filtered = useMemo(() => {
    return markets
      .filter(m => {
        const rate = m.rewards_config.reduce((s, r) => s + r.rate_per_day, 0);
        const q = search.toLowerCase();
        return (
          (m.daysUntilResolution ?? 0) >= minDays &&
          rate >= minRate &&
          (!q || m.question.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        let va: number, vb: number;
        if (sortKey === 'riskScore') { va = a.riskScore ?? 0; vb = b.riskScore ?? 0; }
        else if (sortKey === 'dailyRate') {
          va = a.rewards_config.reduce((s, r) => s + r.rate_per_day, 0);
          vb = b.rewards_config.reduce((s, r) => s + r.rate_per_day, 0);
        }
        else if (sortKey === 'daysUntilResolution') { va = a.daysUntilResolution ?? 0; vb = b.daysUntilResolution ?? 0; }
        else if (sortKey === 'rewards_min_size') { va = a.rewards_min_size; vb = b.rewards_min_size; }
        else { va = a.market_competitiveness; vb = b.market_competitiveness; }
        return sortAsc ? va - vb : vb - va;
      });
  }, [markets, search, minDays, minRate, sortKey, sortAsc]);

  const totalDailyPool = markets.reduce((s, m) => s + m.rewards_config.reduce((r, c) => r + c.rate_per_day, 0), 0);
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : null;

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <th
      className="px-3 py-3 text-center text-[10px] text-blue-400 tracking-wider font-semibold whitespace-nowrap cursor-pointer hover:text-blue-300 select-none"
      onClick={() => { if (sortKey === k) setSortAsc(v => !v); else { setSortKey(k); setSortAsc(false); } }}
    >
      {label} {sortKey === k ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  );

  return (
    <div className="min-h-screen bg-[#050505] text-white font-mono">
      {/* Nav */}
      <div className="border-b border-white/5 px-6 py-3 flex items-center justify-between">
        <a href="/" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">← back</a>
        <span className="text-[10px] text-gray-600 tracking-widest">POLYVERSE / REWARDS</span>
        <button
          onClick={() => setShowJournal(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-xs text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          LP Journal {lpJournal.length > 0 && <span className="text-blue-400">({lpJournal.length})</span>}
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">

        {/* Hero stats */}
        <div className="space-y-2">
          <h1 className="text-xl font-bold tracking-tight">
            Liquidity Rewards <span className="text-blue-400">Scout</span>
          </h1>
          <p className="text-gray-600 text-xs max-w-lg">
            Find the best risk-adjusted markets for LP rewards. Sorted by Risk-Averse Score — higher = more time to earn before resolution, less competition, easier spread requirements.
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Active Reward Markets', val: isLoading ? '…' : markets.length.toString() },
            { label: 'Total Pool / Day', val: isLoading ? '…' : `$${totalDailyPool.toFixed(2)}`, accent: true },
            { label: 'Avg Score (filtered)', val: isLoading ? '…' : filtered.length > 0 ? (filtered.reduce((s, m) => s + (m.riskScore ?? 0), 0) / filtered.length).toFixed(0) : '—' },
            { label: 'High Score (≥70)', val: isLoading ? '…' : filtered.filter(m => (m.riskScore ?? 0) >= 70).length.toString() },
          ].map(({ label, val, accent }) => (
            <div key={label} className="bg-white/[0.03] border border-white/8 rounded-xl p-4">
              <div className={`text-xl font-bold font-mono ${accent ? 'text-blue-400' : 'text-white'}`}>{val}</div>
              <div className="text-[10px] text-gray-600 mt-0.5 tracking-wider">{label.toUpperCase()}</div>
            </div>
          ))}
        </div>

        {/* LP Journal */}
        {showJournal && (
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="px-4 py-3 bg-white/[0.02] border-b border-white/8 flex items-center justify-between">
              <span className="text-xs font-semibold text-white">My LP Positions</span>
              <span className="text-[10px] text-gray-600">Stored locally</span>
            </div>
            {lpJournal.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-700 text-xs">
                No positions logged yet. Click a market row → "Log to Journal".
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {lpJournal.map((e, i) => (
                  <div key={i} className="px-4 py-3 flex items-start justify-between gap-4 hover:bg-white/[0.02]">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-white truncate">{e.market}</div>
                      <div className="text-[10px] text-gray-600 mt-0.5">
                        ${e.capital} @ ≤{e.targetSpread}% spread · ${e.dailyRate}/day pool · est. ${e.estimatedDaily.toFixed(3)}/day · {e.expectedDays}d duration
                      </div>
                      {e.notes && <div className="text-[10px] text-gray-700 mt-0.5 italic">{e.notes}</div>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[10px] text-gray-700">{new Date(e.loggedAt).toLocaleDateString()}</span>
                      <button onClick={() => removeEntry(i)} className="text-gray-700 hover:text-red-400 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search markets…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-gray-700 focus:outline-none focus:border-blue-500/50 w-52"
          />
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-gray-600">Min days:</label>
            <select
              value={minDays}
              onChange={e => setMinDays(Number(e.target.value))}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50"
            >
              {[0, 1, 3, 7, 14, 30, 60, 90].map(d => (
                <option key={d} value={d} className="bg-[#0a0a0a]">{d === 0 ? 'Any' : `>${d}d`}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-gray-600">Min rate:</label>
            <select
              value={minRate}
              onChange={e => setMinRate(Number(e.target.value))}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50"
            >
              {[0, 0.1, 1, 3, 5, 10].map(r => (
                <option key={r} value={r} className="bg-[#0a0a0a]">{r === 0 ? 'Any' : `≥$${r}/day`}</option>
              ))}
            </select>
          </div>
          <button
            onClick={setSweetSpot}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 text-[10px] font-semibold hover:bg-blue-500/25 transition-colors"
          >
            ✦ Sweet Spot
          </button>
          <button
            onClick={() => { setSearch(''); setMinDays(0); setMinRate(0); }}
            className="px-3 py-2 rounded-lg border border-white/10 text-gray-600 text-[10px] hover:text-gray-400 transition-colors"
          >
            Clear
          </button>
          <div className="ml-auto flex items-center gap-2">
            {lastUpdated && <span className="text-[10px] text-gray-700">Updated {lastUpdated}</span>}
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-1.5 rounded-lg border border-white/8 text-gray-600 hover:text-gray-400 transition-colors disabled:opacity-40"
            >
              <svg className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Results count */}
        <div className="text-[10px] text-gray-700">
          Showing {filtered.length} of {markets.length} reward markets
        </div>

        {/* Table */}
        {isError ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center text-red-400 text-sm">
            Failed to load rewards data. <button onClick={() => refetch()} className="underline">Retry</button>
          </div>
        ) : isLoading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-white/[0.02] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 overflow-hidden overflow-x-auto">
            <table className="w-full text-xs min-w-[900px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02]">
                  <th className="px-3 py-3 text-left text-[10px] text-blue-400 tracking-wider font-semibold">Market</th>
                  <th className="px-3 py-3 text-center text-[10px] text-blue-400 tracking-wider font-semibold whitespace-nowrap">YES / NO</th>
                  <SortHeader label="$/Day" k="dailyRate" />
                  <th className="px-3 py-3 text-center text-[10px] text-blue-400 tracking-wider font-semibold whitespace-nowrap">Max Spread</th>
                  <SortHeader label="Min Size" k="rewards_min_size" />
                  <SortHeader label="Competition" k="market_competitiveness" />
                  <SortHeader label="Time Left" k="daysUntilResolution" />
                  <SortHeader label="Score" k="riskScore" />
                  <th className="px-3 py-3 text-center text-[10px] text-blue-400 tracking-wider font-semibold whitespace-nowrap">Est. $1k/day</th>
                  <th className="px-3 py-3 text-center text-[10px] text-blue-400 tracking-wider font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => {
                  const dailyRate = m.rewards_config.reduce((s, r) => s + r.rate_per_day, 0);
                  const yesPrice = m.tokens.find(t => t.outcome === 'Yes')?.price;
                  const noPrice = m.tokens.find(t => t.outcome === 'No')?.price;
                  const yieldPer1k = estimateDailyYield(m, 1000);
                  return (
                    <tr
                      key={m.condition_id}
                      className={`border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors ${i % 2 === 0 ? '' : 'bg-white/[0.015]'}`}
                      onClick={() => setSelectedMarket(m)}
                    >
                      <td className="px-3 py-3 max-w-[220px]">
                        <div className="flex items-start gap-2">
                          <img src={m.image} alt="" className="w-5 h-5 rounded mt-0.5 object-cover shrink-0" />
                          <span className="text-gray-300 text-[11px] leading-snug line-clamp-2">{m.question}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-blue-400 font-mono text-[11px]">
                          {yesPrice != null ? `${(yesPrice * 100).toFixed(0)}¢` : '—'}
                        </span>
                        <span className="text-gray-700 mx-1">/</span>
                        <span className="text-gray-400 font-mono text-[11px]">
                          {noPrice != null ? `${(noPrice * 100).toFixed(0)}¢` : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-bold font-mono ${dailyRate >= 10 ? 'text-blue-400' : dailyRate >= 3 ? 'text-gray-300' : 'text-gray-500'}`}>
                          ${dailyRate}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-gray-400 font-mono">≤{m.rewards_max_spread}%</td>
                      <td className="px-3 py-3 text-center text-gray-400 font-mono">${m.rewards_min_size}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-mono text-[11px] ${m.market_competitiveness === 0 ? 'text-blue-400' : m.market_competitiveness < 1000 ? 'text-gray-300' : 'text-gray-500'}`}>
                          {m.market_competitiveness === 0 ? 'None' : m.market_competitiveness.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-mono text-[11px] ${daysColor(m.daysUntilResolution ?? 0)}`}>
                          {formatDaysLeft(m.daysUntilResolution ?? 0)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {m.scoreBreakdown && (
                          <ScoreBadge score={m.riskScore ?? 0} breakdown={m.scoreBreakdown} />
                        )}
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-[11px] text-blue-400">
                        ${yieldPer1k.toFixed(3)}
                      </td>
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setLogTarget(m)}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] hover:bg-blue-500/20 transition-colors whitespace-nowrap"
                        >
                          + Log
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-gray-700 text-xs">
                      No markets match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Disclaimer */}
        <div className="rounded-xl border border-white/5 bg-white/[0.015] px-4 py-3 text-[10px] text-gray-700 leading-relaxed space-y-1">
          <p><span className="text-gray-500 font-semibold">Disclaimer:</span> Longer time until resolution = more time for your limit orders to earn rewards before the market closes. This is the primary factor in the Risk-Averse Score.</p>
          <p>Rewards paid daily ~midnight UTC. Yield estimates assume capital is fully deployed within the qualifying spread for the full duration. Inventory risk, market movement, and competition all apply. Estimates only — not financial advice.</p>
          <p>End dates sourced from Gamma API where available. Market competitiveness reflects total capital currently scoring in this market.</p>
        </div>

      </div>

      {/* Modals */}
      {selectedMarket && (
        <MarketModal
          market={selectedMarket}
          onClose={() => setSelectedMarket(null)}
          onLogJournal={m => { setSelectedMarket(null); setLogTarget(m); }}
        />
      )}
      {logTarget && (
        <LogJournalModal
          market={logTarget}
          onClose={() => setLogTarget(null)}
          onSave={saveEntry}
        />
      )}
    </div>
  );
}
