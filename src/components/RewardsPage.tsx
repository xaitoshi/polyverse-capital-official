import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabase, type LPJournalRow } from '../lib/supabase';
import {
  type RewardsMarket,
  type BookYieldResult,
  calculateRiskAverseScore,
  getDaysUntilResolution,
  formatDaysLeft,
  daysColor,
  scoreColor,
  estimateDailyYield,
  estimateDailyYieldFromBook,
} from '../lib/rewardsScoring';

// ─── Order book helpers ───────────────────────────────────────────────────────

interface BookDepth { yes: number; no: number }

async function fetchQualifyingDepth(market: RewardsMarket): Promise<BookDepth> {
  const yesToken = market.tokens.find(t => t.outcome === 'Yes');
  const noToken  = market.tokens.find(t => t.outcome === 'No');
  if (!yesToken || !noToken) return { yes: 0, no: 0 };

  const s = market.rewards_max_spread / 100;

  async function sideDepth(tokenId: string, price: number): Promise<number> {
    try {
      const res  = await fetch(`/api/clob/book?token_id=${tokenId}`);
      if (!res.ok) return 0;
      const data = await res.json();
      const minP = price * (1 - s);
      return (data.bids ?? [])
        .filter((b: { price: string }) => parseFloat(b.price) >= minP)
        .reduce((sum: number, b: { price: string; size: string }) =>
          sum + parseFloat(b.price) * parseFloat(b.size), 0);
    } catch { return 0; }
  }

  const [yes, no] = await Promise.all([
    sideDepth(yesToken.token_id, yesToken.price),
    sideDepth(noToken.token_id,  noToken.price),
  ]);
  return { yes, no };
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchRewardsMarkets(): Promise<RewardsMarket[]> {
  // Use server-side aggregator that paginates ALL CLOB pages + merges Gamma dates
  const res = await fetch('/api/rewards-markets');
  if (!res.ok) throw new Error(`Failed to fetch rewards: ${res.status}`);
  const { data } = await res.json();

  return (data as RewardsMarket[]).map(m => {
    const { score, breakdown } = calculateRiskAverseScore(m);
    return { ...m, riskScore: score, scoreBreakdown: breakdown };
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

function LPSimulator({ market, bookDepth, bookLoading }: {
  market: RewardsMarket;
  bookDepth: BookDepth | null;
  bookLoading: boolean;
}) {
  const [capital, setCapital] = useState(1000);
  // splitRatio: fraction of capital going to YES bids (default 50/50)
  const [splitRatio, setSplitRatio] = useState(0.5);

  const dailyRate = market.rewards_config.reduce((s, r) => s + r.rate_per_day, 0);
  const days = market.daysUntilResolution ?? 0;
  const valid = capital >= market.rewards_min_size;

  const yesPrice = market.tokens.find(t => t.outcome === 'Yes')?.price ?? 0.5;
  const noPrice  = market.tokens.find(t => t.outcome === 'No')?.price  ?? 0.5;

  const result: BookYieldResult | null = valid && bookDepth
    ? estimateDailyYieldFromBook(dailyRate, capital, splitRatio, bookDepth.yes, bookDepth.no)
    : null;

  const annualizedPct = result && capital > 0
    ? (result.daily * 365 / capital) * 100
    : 0;

  return (
    <div className="space-y-4 bg-white/[0.02] rounded-xl border border-white/8 p-4">
      <div className="text-xs text-blue-400 font-semibold tracking-wider">LP SIMULATOR</div>

      {/* Book depth row */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: `YES (${(yesPrice * 100).toFixed(1)}¢) book depth`, val: bookDepth?.yes, loading: bookLoading },
          { label: `NO (${(noPrice * 100).toFixed(1)}¢) book depth`,   val: bookDepth?.no,  loading: bookLoading },
        ].map(({ label, val, loading }) => (
          <div key={label} className="bg-white/[0.03] border border-white/8 rounded-lg px-3 py-2">
            <div className="text-[9px] text-gray-600 tracking-wider mb-0.5">{label}</div>
            <div className="text-xs font-mono text-gray-300">
              {loading ? <span className="animate-pulse text-gray-700">loading…</span>
                : val != null ? `$${val.toLocaleString(undefined, { maximumFractionDigits: 0 })} qualifying`
                : '—'}
            </div>
          </div>
        ))}
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-gray-500 tracking-wider block mb-1">YOUR CAPITAL ($)</label>
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
            YES / NO SPLIT ({Math.round(splitRatio * 100)}% / {Math.round((1 - splitRatio) * 100)}%)
          </label>
          <input
            type="range"
            min={0} max={1} step={0.05}
            value={splitRatio}
            onChange={e => setSplitRatio(Number(e.target.value))}
            className="w-full mt-2 accent-blue-500"
          />
          <div className="flex justify-between text-[9px] text-gray-700 mt-0.5">
            <span>${Math.round(capital * splitRatio)} YES</span>
            <span>${Math.round(capital * (1 - splitRatio))} NO</span>
          </div>
        </div>
      </div>

      {/* Results */}
      {result ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3 text-center">
              <div className="text-sm font-bold text-blue-400 font-mono">${result.daily.toFixed(3)}</div>
              <div className="text-[10px] text-gray-600 mt-0.5">Est. daily</div>
            </div>
            <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3 text-center">
              <div className="text-sm font-bold text-white font-mono">${(result.daily * days).toFixed(2)}</div>
              <div className="text-[10px] text-gray-600 mt-0.5">Over {Math.floor(days)}d</div>
            </div>
            <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3 text-center">
              <div className="text-sm font-bold text-blue-400 font-mono">{annualizedPct.toFixed(1)}%</div>
              <div className="text-[10px] text-gray-600 mt-0.5">Ann. yield</div>
            </div>
          </div>

          {/* Share breakdown */}
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            {[
              { label: 'Your YES share', share: result.yesShare, depth: result.yesBookDepth, cap: result.yesCapital, color: 'text-blue-400' },
              { label: 'Your NO share',  share: result.noShare,  depth: result.noBookDepth,  cap: result.noCapital,  color: 'text-gray-300' },
            ].map(({ label, share, depth, cap, color }) => (
              <div key={label} className="bg-white/[0.02] border border-white/5 rounded-lg px-3 py-2 space-y-0.5">
                <div className="text-gray-600">{label}</div>
                <div className={`font-bold font-mono ${color}`}>{(share * 100).toFixed(2)}%</div>
                <div className="text-gray-700">
                  ${cap.toLocaleString(undefined, { maximumFractionDigits: 0 })} vs ${depth.toLocaleString(undefined, { maximumFractionDigits: 0 })} on book
                </div>
              </div>
            ))}
          </div>
        </>
      ) : bookLoading ? (
        <div className="text-[10px] text-gray-700 text-center py-2 animate-pulse">Fetching order book…</div>
      ) : (
        <div className="text-[10px] text-gray-600 text-center py-2">Fix inputs above to see projection</div>
      )}

      <p className="text-[10px] text-gray-700 leading-relaxed">
        Book depth = sum of qualifying bids within the {market.rewards_max_spread}% spread range on each side.
        Rewards split 50/50 between YES and NO sides. Your share = your capital / (book depth + your capital) per side.
        Paid daily ~midnight UTC.
      </p>
    </div>
  );
}

interface AIRecommendation {
  yes_bid: string;
  no_bid: string;
  order_size: string;
  yes_rationale: string;
  no_rationale: string;
  size_rationale: string;
  summary: string;
}

function MarketModal({ market, onClose, onLogJournal }: {
  market: RewardsMarket;
  onClose: () => void;
  onLogJournal: (m: RewardsMarket) => void;
}) {
  const dailyRate = market.rewards_config.reduce((s, r) => s + r.rate_per_day, 0);
  const yesPrice = market.tokens.find(t => t.outcome === 'Yes')?.price;
  const noPrice = market.tokens.find(t => t.outcome === 'No')?.price;

  const [bookDepth, setBookDepth] = useState<BookDepth | null>(null);
  const [bookLoading, setBookLoading] = useState(true);

  const [aiRec, setAiRec] = useState<AIRecommendation | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    setBookLoading(true);
    setBookDepth(null);
    fetchQualifyingDepth(market)
      .then(setBookDepth)
      .finally(() => setBookLoading(false));

    setAiLoading(true);
    setAiError(null);
    setAiRec(null);
    fetch('/api/lp-recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ market }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setAiRec(data);
      })
      .catch(e => setAiError(e.message ?? 'Failed to generate recommendation'))
      .finally(() => setAiLoading(false));
  }, [market.condition_id]);

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
          <LPSimulator market={market} bookDepth={bookDepth} bookLoading={bookLoading} />

          {/* AI Recommendation */}
          <div className="space-y-3 bg-white/[0.02] rounded-xl border border-white/8 p-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-blue-400 font-semibold tracking-wider">ORDER RECOMMENDATION</span>
            </div>
            {aiLoading ? (
              <div className="space-y-2 pt-1">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-8 rounded-lg bg-white/[0.03] animate-pulse" />
                ))}
              </div>
            ) : aiError ? (
              <p className="text-[11px] text-red-400/70">{aiError}</p>
            ) : aiRec ? (
              <div className="space-y-3">
                <p className="text-[11px] text-gray-400 leading-relaxed italic">"{aiRec.summary}"</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'YES Bid', val: aiRec.yes_bid, rationale: aiRec.yes_rationale, color: 'text-blue-400' },
                    { label: 'NO Bid', val: aiRec.no_bid, rationale: aiRec.no_rationale, color: 'text-gray-300' },
                    { label: 'Order Size', val: aiRec.order_size, rationale: aiRec.size_rationale, color: 'text-green-400' },
                  ].map(({ label, val, rationale, color }) => (
                    <div key={label} className="bg-white/[0.03] border border-white/8 rounded-xl p-3 space-y-1.5">
                      <div className="text-[9px] text-gray-600 tracking-wider">{label}</div>
                      <div className={`text-sm font-bold font-mono ${color}`}>{val}</div>
                      <div className="text-[9px] text-gray-600 leading-tight">{rationale}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

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

// ─── LP Journal (Supabase, per user) ─────────────────────────────────────────

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

async function fetchJournal(profileId: string): Promise<LPJournalRow[]> {
  const { data, error } = await supabase
    .from('lp_journal')
    .select('*')
    .eq('profile_id', profileId)
    .order('logged_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function insertJournalEntry(profileId: string, entry: LPJournalEntry): Promise<void> {
  const { error } = await supabase.from('lp_journal').insert({
    profile_id: profileId,
    market: entry.market,
    condition_id: entry.conditionId,
    capital: entry.capital,
    target_spread: entry.targetSpread,
    expected_days: entry.expectedDays,
    daily_rate: entry.dailyRate,
    estimated_daily: entry.estimatedDaily,
    notes: entry.notes,
    logged_at: entry.loggedAt,
  });
  if (error) throw error;
}

async function deleteJournalEntry(id: string): Promise<void> {
  const { error } = await supabase.from('lp_journal').delete().eq('id', id);
  if (error) throw error;
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
  const [showJournal, setShowJournal] = useState(false);

  const profileId = user?.profile?.id ?? null;
  const queryClient = useQueryClient();

  const { data: lpJournal = [] } = useQuery({
    queryKey: ['lp-journal', profileId],
    queryFn: () => fetchJournal(profileId!),
    enabled: !!profileId,
  });

  const addMutation = useMutation({
    mutationFn: (entry: LPJournalEntry) => insertJournalEntry(profileId!, entry),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lp-journal', profileId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteJournalEntry(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lp-journal', profileId] }),
  });

  const saveEntry = (entry: LPJournalEntry) => addMutation.mutate(entry);
  const removeEntry = (id: string) => deleteMutation.mutate(id);

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
    <div className="min-h-screen bg-[#04070c] text-ink font-mono">
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
          {!profileId && <span className="text-gray-700 ml-1">(sign in)</span>}
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
            {!profileId ? (
              <div className="px-4 py-8 text-center text-gray-700 text-xs">
                Sign in to save LP positions to your account.
              </div>
            ) : lpJournal.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-700 text-xs">
                No positions logged yet. Click a market row → "Log to Journal".
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {lpJournal.map(e => (
                  <div key={e.id} className="px-4 py-3 flex items-start justify-between gap-4 hover:bg-white/[0.02]">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-white truncate">{e.market}</div>
                      <div className="text-[10px] text-gray-600 mt-0.5">
                        ${e.capital} @ ≤{e.target_spread}% spread · ${e.daily_rate}/day pool · est. ${e.estimated_daily.toFixed(3)}/day · {e.expected_days}d duration
                      </div>
                      {e.notes && <div className="text-[10px] text-gray-700 mt-0.5 italic">{e.notes}</div>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[10px] text-gray-700">{new Date(e.logged_at).toLocaleDateString()}</span>
                      <button onClick={() => removeEntry(e.id)} className="text-gray-700 hover:text-red-400 transition-colors">
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
                          disabled={!profileId}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] hover:bg-blue-500/20 transition-colors whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed"
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
