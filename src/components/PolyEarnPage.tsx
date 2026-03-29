import React, { useState, useEffect, useRef } from 'react';
import { X, TrendingUp, TrendingDown, Minus, Loader2, Calendar, Clock, BarChart3, ExternalLink, Plus, Search, Trash2, Zap, ChevronUp, ChevronDown, Camera, CheckSquare } from 'lucide-react';
import { analyzeCustomTickers, getPolymarketEarningsTickers, fetchUpcomingEarnings, fetchPolymarketEarnings, fetchProAnalysisList, EarningsAnalysis, ProAnalysis, OptionsIVData } from '../services/earningsService';
import { exportCardsAsImage } from '../utils/exportCards';

interface PolyEarnPageProps {
  onClose: () => void;
}

type ViewMode = 'calendar' | 'custom' | 'pro';

const WATCHLIST_KEY = 'polyearn_watchlist';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getCached<T>(key: string): T | null {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    const { data, timestamp, date } = JSON.parse(stored);
    if (date !== todayStr()) return null; // stale if day changed
    if (Date.now() - timestamp > CACHE_TTL_MS) return null;
    return data as T;
  } catch { return null; }
}

function setCache<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now(), date: todayStr() }));
  } catch { /* ignore quota errors */ }
}

function loadWatchlist(): string[] {
  try {
    const stored = localStorage.getItem(WATCHLIST_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return [];
}

function saveWatchlist(tickers: string[]) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(tickers));
}

type FilterTab = 'this_week' | 'next_week' | 'all';

function toLocalDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getWeekRange(offset: number): { from: string; to: string } {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return {
    from: toLocalDateStr(monday),
    to: toLocalDateStr(friday),
  };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatHour(hour: string): string {
  switch (hour) {
    case 'bmo': return 'Before Market Open';
    case 'amc': return 'After Market Close';
    case 'dmh': return 'During Market Hours';
    default: return 'Time TBD';
  }
}

function formatMarketCap(mc?: number): string {
  if (!mc) return '';
  if (mc >= 1000) return `$${(mc / 1000).toFixed(1)}T`;
  if (mc >= 1) return `$${mc.toFixed(0)}B`;
  return `$${(mc * 1000).toFixed(0)}M`;
}

function PredictionBadge({ prediction, confidence }: { prediction: 'BEAT' | 'MISS' | 'MEET' | null; confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null }) {
  if (!prediction) return null;

  const colors = {
    BEAT: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
    MISS: 'bg-red-500/20 text-red-400 border-red-500/40',
    MEET: 'bg-gray-500/20 text-gray-400 border-gray-500/40',
  };

  const confColors = {
    HIGH: 'text-yellow-400',
    MEDIUM: 'text-gray-400',
    LOW: 'text-gray-600',
  };

  const Icon = prediction === 'BEAT' ? TrendingUp : prediction === 'MISS' ? TrendingDown : Minus;

  return (
    <div className="flex items-center gap-2">
      <span className={`px-2 py-0.5 rounded border text-xs font-mono flex items-center gap-1 ${colors[prediction]}`}>
        <Icon className="w-3 h-3" />
        {prediction}
      </span>
      {confidence && (
        <span className={`text-[10px] font-mono ${confColors[confidence]}`}>
          {confidence}
        </span>
      )}
    </div>
  );
}

function PolymarketBadge({ yesPct, volume, slug }: { yesPct: number; volume: number; slug: string }) {
  const formatVol = (v: number) => {
    if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
    return `$${Math.round(v)}`;
  };

  return (
    <a
      href={`https://polymarket.com/event/${slug}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
    >
      <span className="text-[10px] font-mono text-blue-400/70 uppercase">Poly</span>
      <span className={`text-xs font-mono font-bold ${yesPct >= 50 ? 'text-blue-400' : 'text-red-400'}`}>
        {yesPct.toFixed(0)}%
      </span>
      <span className="text-[10px] font-mono text-gray-600">{formatVol(volume)}</span>
      <ExternalLink className="w-2.5 h-2.5 text-blue-400/50" />
    </a>
  );
}

function BeatRateBar({ beatRate, total }: { beatRate: number; total: number }) {
  if (total === 0) return <span className="text-gray-600 text-xs font-mono">No history</span>;
  const width = Math.max(2, Math.min(100, beatRate));

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            beatRate >= 70 ? 'bg-blue-500' : beatRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
          }`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-xs font-mono text-gray-400 w-12 text-right">{beatRate.toFixed(0)}%</span>
    </div>
  );
}

function EarningsCard({ analysis, onRemove, shareMode, selected, onToggleSelect, onRef }: {
  analysis: EarningsAnalysis;
  onRemove?: () => void;
  shareMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onRef?: (el: HTMLDivElement | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      ref={onRef}
      className={`relative bg-black/40 border rounded-lg p-4 transition-colors cursor-pointer ${
        shareMode
          ? selected
            ? 'border-pink-500/60 ring-1 ring-pink-500/40'
            : 'border-blue-500/15 hover:border-pink-500/30'
          : 'border-blue-500/15 hover:border-blue-500/40'
      }`}
      onClick={() => shareMode ? onToggleSelect?.() : setExpanded(!expanded)}
    >
      {shareMode && (
        <div className={`absolute top-2 right-2 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
          selected ? 'bg-pink-500 border-pink-500' : 'border-gray-600 bg-black/60'
        }`}>
          {selected && <span className="text-white text-[10px] font-bold">✓</span>}
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {analysis.logo ? (
            <img
              src={analysis.logo}
              alt={analysis.symbol}
              className="w-10 h-10 rounded-lg bg-gray-800 border border-gray-700 object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
              <span className="text-sm font-bold text-gray-500">{analysis.symbol.charAt(0)}</span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-blue-400 font-mono">{analysis.symbol}</span>
              <span className="text-sm text-gray-300 truncate">{analysis.name !== analysis.symbol ? analysis.name : ''}</span>
              {onRemove && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(); }}
                  className="text-gray-700 hover:text-red-400 transition-colors ml-1"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              {analysis.date && (
                <span className="text-[10px] text-gray-500 font-mono">{formatDate(analysis.date)}</span>
              )}
              {analysis.industry && (
                <span className="text-[10px] text-gray-600 font-mono">{analysis.industry}</span>
              )}
              {analysis.marketCap && (
                <span className="text-[10px] text-gray-600 font-mono">{formatMarketCap(analysis.marketCap)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <PredictionBadge prediction={analysis.prediction} confidence={analysis.confidence} />
          {analysis.polymarket && (
            <PolymarketBadge
              yesPct={analysis.polymarket.yesPct}
              volume={analysis.polymarket.volume}
              slug={analysis.polymarket.slug}
            />
          )}
          {analysis.epsEstimate != null && (
            <span className="text-xs font-mono text-gray-500">
              Est: ${analysis.epsEstimate.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-mono text-gray-600 uppercase tracking-wider">Beat Rate</span>
          <span className="text-[10px] font-mono text-gray-500">
            {analysis.beatCount}B / {analysis.missCount}M / {analysis.meetCount}E of {analysis.history.length}Q
          </span>
        </div>
        <BeatRateBar beatRate={analysis.beatRate} total={analysis.history.length} />
      </div>

      {analysis.avgSurprisePct !== 0 && analysis.history.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[10px] font-mono text-gray-600">Avg Surprise:</span>
          <span className={`text-xs font-mono ${analysis.avgSurprisePct >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
            {analysis.avgSurprisePct >= 0 ? '+' : ''}{analysis.avgSurprisePct.toFixed(1)}%
          </span>
        </div>
      )}

      {analysis.polymarket && analysis.prediction && (
        <div className="mt-2 flex items-center gap-3 px-2 py-1.5 rounded bg-gray-900/50 border border-gray-800">
          <span className="text-[10px] font-mono text-gray-600 uppercase tracking-wider shrink-0">AI vs Market</span>
          <div className="flex items-center gap-2 flex-1">
            <span className={`text-xs font-mono font-bold ${analysis.prediction === 'BEAT' ? 'text-blue-400' : analysis.prediction === 'MISS' ? 'text-red-400' : 'text-gray-400'}`}>
              {analysis.prediction === 'BEAT' ? 'BEAT' : analysis.prediction === 'MISS' ? 'MISS' : 'MEET'}
            </span>
            <span className="text-[10px] text-gray-600">vs</span>
            <span className={`text-xs font-mono font-bold ${analysis.polymarket.yesPct >= 50 ? 'text-blue-400' : 'text-orange-400'}`}>
              {analysis.polymarket.yesPct.toFixed(0)}% beat
            </span>
            {(() => {
              const aiSaysBeat = analysis.prediction === 'BEAT';
              const marketSaysBeat = analysis.polymarket.yesPct >= 50;
              const aligned = aiSaysBeat === marketSaysBeat;
              return (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${aligned ? 'text-blue-400 bg-blue-500/10' : 'text-orange-400 bg-orange-500/10'}`}>
                  {aligned ? 'ALIGNED' : 'DIVERGENT'}
                </span>
              );
            })()}
          </div>
        </div>
      )}

      {analysis.reasoning && (
        <p className={`mt-2 text-xs text-gray-500 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
          {analysis.reasoning}
        </p>
      )}

      {expanded && analysis.history.length > 0 && (
        <div className="mt-3 pt-3 border-t border-blue-500/10">
          <span className="text-[10px] font-mono text-gray-600 uppercase tracking-wider mb-2 block">
            Earnings History (Last {analysis.history.length} Quarters)
          </span>
          <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
            {analysis.history.map((q, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-gray-600 w-24">{q.period}</span>
                <span className="text-gray-400 w-16 text-right">A: {q.actual.toFixed(2)}</span>
                <span className="text-gray-500 w-16 text-right">E: {q.estimate.toFixed(2)}</span>
                <span className={`w-20 text-right ${q.surprise > 0.005 ? 'text-blue-400' : q.surprise < -0.005 ? 'text-red-400' : 'text-gray-500'}`}>
                  {q.surprise >= 0 ? '+' : ''}{q.surprise.toFixed(2)} ({q.surprisePct >= 0 ? '+' : ''}{q.surprisePct.toFixed(1)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pro Tab Components ────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  // score: -2 to +2
  const pct = ((score + 2) / 4) * 100;
  const color = score >= 1 ? 'bg-blue-500' : score <= -1 ? 'bg-red-500' : 'bg-yellow-500';
  return (
    <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function TrendDots({ trend }: { trend: ('beat' | 'miss' | 'meet')[] }) {
  return (
    <div className="flex gap-1">
      {trend.map((t, i) => (
        <span
          key={i}
          title={t}
          className={`w-2.5 h-2.5 rounded-full ${t === 'beat' ? 'bg-blue-400' : t === 'miss' ? 'bg-red-400' : 'bg-gray-600'}`}
        />
      ))}
    </div>
  );
}

function ProCard({ analysis, shareMode, selected, onToggleSelect, onRef }: {
  analysis: ProAnalysis;
  shareMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onRef?: (el: HTMLDivElement | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const signalColors = {
    BULLISH: { bg: 'bg-blue-500/15', border: 'border-blue-500/40', text: 'text-blue-400', badge: 'bg-blue-500/20 border-blue-500/40' },
    BEARISH: { bg: 'bg-red-500/15',   border: 'border-red-500/40',   text: 'text-red-400',   badge: 'bg-red-500/20 border-red-500/40' },
    NEUTRAL: { bg: 'bg-gray-500/10',  border: 'border-gray-600/40',  text: 'text-gray-400',  badge: 'bg-gray-700/40 border-gray-600/40' },
  }[analysis.signal];

  const scoreDisplay = analysis.signalScore > 0 ? `+${analysis.signalScore}` : `${analysis.signalScore}`;

  return (
    <div
      ref={onRef}
      className={`relative border rounded-xl p-4 cursor-pointer transition-all bg-black/50 ${
        shareMode
          ? selected
            ? 'border-pink-500/60 ring-1 ring-pink-500/40 hover:bg-black/70'
            : `${signalColors.border} hover:border-pink-500/30 hover:bg-black/70`
          : `${signalColors.border} hover:bg-black/70`
      }`}
      onClick={() => shareMode ? onToggleSelect?.() : setExpanded(!expanded)}
    >
      {shareMode && (
        <div className={`absolute top-2 right-2 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
          selected ? 'bg-pink-500 border-pink-500' : 'border-gray-600 bg-black/60'
        }`}>
          {selected && <span className="text-white text-[10px] font-bold">✓</span>}
        </div>
      )}
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          {analysis.logo ? (
            <img src={analysis.logo} alt={analysis.symbol} className="w-10 h-10 rounded-lg bg-gray-800 border border-gray-700 object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
              <span className="text-sm font-bold text-gray-500">{analysis.symbol.charAt(0)}</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white font-mono">{analysis.symbol}</span>
            <span className="text-gray-400 text-sm truncate">{analysis.name !== analysis.symbol ? analysis.name : ''}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {analysis.date && (
              <span className="text-[11px] font-mono text-gray-500">
                {formatDate(analysis.date)}{analysis.hour ? ` · ${formatHour(analysis.hour)}` : ''}
              </span>
            )}
            {analysis.epsEstimate != null && (
              <span className="text-[11px] font-mono text-gray-600">EPS est. ${analysis.epsEstimate.toFixed(2)}</span>
            )}
          </div>
        </div>
        {/* Beat score badge */}
        <div className={`flex-shrink-0 px-3 py-1.5 rounded-lg border text-center ${signalColors.badge}`}>
          <div className="text-[9px] text-gray-500 font-mono uppercase tracking-wider">Beat</div>
          <div className={`text-lg font-black font-mono leading-tight ${signalColors.text}`}>{analysis.beatScore}</div>
          <div className="text-[9px] text-gray-600 font-mono">/10</div>
        </div>
      </div>

      {/* Action row — purely score-based */}
      <div className={`mt-3 px-3 py-2.5 rounded-lg border flex items-center gap-3 flex-wrap ${
        analysis.marketAction === 'BUY_YES'         ? 'bg-blue-500/10 border-blue-500/30'
        : analysis.marketAction === 'MAYBE_BUY_YES' ? 'bg-blue-500/5 border-blue-500/20'
        : analysis.marketAction === 'MAYBE_BUY_NO'  ? 'bg-red-500/5 border-red-500/20'
        : 'bg-red-500/10 border-red-500/30'
      }`}>
        <span className={`text-xs font-black font-mono px-2.5 py-1 rounded ${
          analysis.marketAction === 'BUY_YES'         ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
          : analysis.marketAction === 'MAYBE_BUY_YES' ? 'bg-blue-500/10 text-blue-400/70 border border-blue-500/25'
          : analysis.marketAction === 'MAYBE_BUY_NO'  ? 'bg-red-500/10 text-red-400/70 border border-red-500/25'
          : 'bg-red-500/20 text-red-300 border border-red-500/40'
        }`}>
          {analysis.marketAction === 'BUY_YES'         ? '▲ BUY YES'
           : analysis.marketAction === 'MAYBE_BUY_YES' ? '△ MAYBE BUY YES'
           : analysis.marketAction === 'MAYBE_BUY_NO'  ? '▽ MAYBE BUY NO'
           : '▼ BUY NO'}
        </span>
        <span className="text-[11px] font-mono text-gray-600">score {analysis.beatScore}/10</span>
        {analysis.polymarket && (
          <span className="ml-auto text-[11px] font-mono">
            <span className="text-gray-600">Poly </span>
            <span className={`font-bold ${analysis.polymarket.yesPct >= 50 ? 'text-blue-400' : 'text-red-400'}`}>
              {analysis.polymarket.yesPct.toFixed(0)}% YES
            </span>
          </span>
        )}
      </div>

      {/* Quick metrics row */}
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        {analysis.polymarket && (
          <a
            href={`https://polymarket.com/event/${analysis.polymarket.slug}`}
            target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1 text-[10px] font-mono text-blue-400/50 hover:text-blue-400 transition-colors"
          >
            <ExternalLink className="w-2.5 h-2.5" />
            Polymarket
            <span className="text-gray-600 ml-0.5">${analysis.polymarket.volume >= 1000 ? `${(analysis.polymarket.volume / 1000).toFixed(0)}K` : Math.round(analysis.polymarket.volume)} vol</span>
          </a>
        )}
        <div className="flex items-center gap-1">
          {analysis.recentTrend.length > 0 && <TrendDots trend={analysis.recentTrend} />}
          {analysis.history.length > 0 && (
            <span className="text-[10px] font-mono text-gray-600 ml-1">
              {analysis.beatRate.toFixed(0)}% beat rate
            </span>
          )}
        </div>
        {analysis.revenueGrowthTTM !== null && (
          <span className={`text-[10px] font-mono ${analysis.revenueGrowthTTM >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
            Rev {analysis.revenueGrowthTTM >= 0 ? '+' : ''}{analysis.revenueGrowthTTM.toFixed(1)}% YoY
          </span>
        )}
        {analysis.shortInterestPct !== null && analysis.shortInterestPct > 5 && (
          <span className="text-[10px] font-mono text-orange-500">
            {analysis.shortInterestPct.toFixed(1)}% short
          </span>
        )}
        {analysis.optionsIV?.atmIV != null && (
          <span className={`text-[10px] font-mono ${
            analysis.optionsIV.atmIV < 30 ? 'text-blue-600'
            : analysis.optionsIV.atmIV < 50 ? 'text-yellow-600'
            : 'text-red-600'
          }`}>
            IV {analysis.optionsIV.atmIV.toFixed(0)}%
            {analysis.optionsIV.putSkew != null && (
              <span className="text-gray-600 ml-0.5">
                skew {analysis.optionsIV.putSkew >= 0 ? '+' : ''}{analysis.optionsIV.putSkew.toFixed(1)}%
              </span>
            )}
          </span>
        )}
        {analysis.sectorReturns && (
          <span className={`text-[10px] font-mono ${analysis.sectorReturns.d30 >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
            {analysis.sectorEtf} {analysis.sectorReturns.d30 >= 0 ? '+' : ''}{analysis.sectorReturns.d30.toFixed(1)}%
          </span>
        )}
        <div className="ml-auto text-gray-700">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </div>

      {/* Expanded: signal factors */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-800 space-y-3">
          <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider">Signal Breakdown</p>
          {analysis.signalFactors.map(f => (
            <div key={f.label} className="flex items-center gap-3">
              <span className="text-[11px] font-mono text-gray-500 w-28 flex-shrink-0">{f.label}</span>
              <ScoreBar score={f.score} />
              <span className={`text-[11px] font-mono w-14 text-right flex-shrink-0 ${f.score > 0 ? 'text-blue-400' : f.score < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                {f.value}
              </span>
              <span className={`text-[11px] font-bold font-mono w-8 text-right flex-shrink-0 ${f.score > 0 ? 'text-blue-400' : f.score < 0 ? 'text-red-400' : 'text-gray-600'}`}>
                {f.score > 0 ? `+${f.score}` : f.score}
              </span>
            </div>
          ))}

          {/* Additional data grid */}
          <div className="mt-3 pt-3 border-t border-gray-800/60 grid grid-cols-2 gap-x-6 gap-y-2">
            {analysis.epsEstimateAvg !== null && (
              <>
                <div>
                  <p className="text-[9px] font-mono text-gray-600 uppercase tracking-wider">Consensus EPS Est.</p>
                  <p className="text-[11px] font-mono text-gray-300">
                    ${analysis.epsEstimateAvg.toFixed(2)}
                    {analysis.epsEstimateHigh !== null && analysis.epsEstimateLow !== null && (
                      <span className="text-gray-600 ml-1">(${analysis.epsEstimateLow.toFixed(2)}–${analysis.epsEstimateHigh.toFixed(2)})</span>
                    )}
                  </p>
                </div>
              </>
            )}
            {analysis.analystBuyPct !== null && (
              <div>
                <p className="text-[9px] font-mono text-gray-600 uppercase tracking-wider">Analyst Consensus</p>
                <p className="text-[11px] font-mono text-gray-300">
                  {analysis.analystBuy}B / {analysis.analystHold}H / {analysis.analystSell}S
                  <span className={`ml-1 ${analysis.analystBuyPct >= 60 ? 'text-blue-400' : analysis.analystBuyPct < 40 ? 'text-red-400' : 'text-gray-500'}`}>
                    ({analysis.analystBuyPct.toFixed(0)}% buy)
                  </span>
                </p>
              </div>
            )}
            {analysis.insiderNetValue !== null && (
              <div>
                <p className="text-[9px] font-mono text-gray-600 uppercase tracking-wider">Insider Activity (90d)</p>
                <p className={`text-[11px] font-mono ${analysis.insiderNetValue >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                  {analysis.insiderNetValue >= 0 ? '+' : ''}${(analysis.insiderNetValue / 1000).toFixed(0)}K net {analysis.insiderNetValue >= 0 ? 'buy' : 'sell'}
                  {analysis.insiderNetShares !== null && (
                    <span className="text-gray-600 ml-1">({analysis.insiderNetShares >= 0 ? '+' : ''}{analysis.insiderNetShares.toLocaleString()} shares)</span>
                  )}
                </p>
              </div>
            )}
            {analysis.shortInterestPct !== null && (
              <div>
                <p className="text-[9px] font-mono text-gray-600 uppercase tracking-wider">Short Interest</p>
                <p className={`text-[11px] font-mono ${analysis.shortInterestPct > 15 ? 'text-red-400' : analysis.shortInterestPct > 8 ? 'text-orange-400' : 'text-gray-400'}`}>
                  {analysis.shortInterestPct.toFixed(1)}% of float
                </p>
              </div>
            )}
            {analysis.peRatio !== null && (
              <div>
                <p className="text-[9px] font-mono text-gray-600 uppercase tracking-wider">P/E Ratio (TTM)</p>
                <p className="text-[11px] font-mono text-gray-300">{analysis.peRatio.toFixed(1)}x</p>
              </div>
            )}
            {analysis.optionsIV && (
              <div className="col-span-2 grid grid-cols-2 gap-x-6 gap-y-2 pt-2 border-t border-gray-800/40">
                {analysis.optionsIV.atmIV != null && (
                  <div>
                    <p className="text-[9px] font-mono text-gray-600 uppercase tracking-wider">ATM Implied Volatility</p>
                    <p className={`text-[11px] font-mono font-bold ${
                      analysis.optionsIV.atmIV < 30 ? 'text-blue-400'
                      : analysis.optionsIV.atmIV < 50 ? 'text-yellow-400'
                      : analysis.optionsIV.atmIV < 70 ? 'text-orange-400'
                      : 'text-red-400'
                    }`}>
                      {analysis.optionsIV.atmIV.toFixed(1)}%
                      <span className="text-gray-600 font-normal ml-1 text-[9px]">
                        (C: {analysis.optionsIV.callIV?.toFixed(1) ?? '—'}% / P: {analysis.optionsIV.putIV?.toFixed(1) ?? '—'}%)
                      </span>
                    </p>
                    <p className="text-[10px] text-gray-500 mt-1 leading-snug">
                      {analysis.optionsIV.atmIV < 30
                        ? 'Low IV — market expects a calm earnings move; options are cheap relative to history.'
                        : analysis.optionsIV.atmIV < 50
                        ? 'Moderate IV — options are pricing in a meaningful move but uncertainty is contained.'
                        : analysis.optionsIV.atmIV < 70
                        ? 'Elevated IV — market is bracing for a large swing around earnings.'
                        : 'Very high IV — extreme uncertainty priced in; risk of a sharp move in either direction.'}
                    </p>
                  </div>
                )}
                {analysis.optionsIV.putSkew != null && (
                  <div>
                    <p className="text-[9px] font-mono text-gray-600 uppercase tracking-wider">Put Skew (OTM put − ATM call)</p>
                    <p className={`text-[11px] font-mono font-bold ${
                      analysis.optionsIV.putSkew < -1 ? 'text-blue-400'
                      : analysis.optionsIV.putSkew < 2 ? 'text-gray-300'
                      : analysis.optionsIV.putSkew < 6 ? 'text-yellow-400'
                      : analysis.optionsIV.putSkew < 12 ? 'text-orange-400'
                      : 'text-red-400'
                    }`}>
                      {analysis.optionsIV.putSkew >= 0 ? '+' : ''}{analysis.optionsIV.putSkew.toFixed(1)}%
                      <span className="text-gray-600 font-normal ml-1 text-[9px]">
                        {analysis.optionsIV.putSkew < -1 ? 'call skew' : analysis.optionsIV.putSkew < 2 ? 'neutral' : analysis.optionsIV.putSkew < 6 ? 'mild put skew' : analysis.optionsIV.putSkew < 12 ? 'elevated put skew' : 'high put skew'}
                      </span>
                    </p>
                    <p className="text-[10px] text-gray-500 mt-1 leading-snug">
                      {analysis.optionsIV.putSkew < -1
                        ? 'Calls are more expensive than puts — traders are positioning for upside or a short squeeze.'
                        : analysis.optionsIV.putSkew < 2
                        ? 'Skew is neutral — no strong directional bias from the options market heading into earnings.'
                        : analysis.optionsIV.putSkew < 6
                        ? 'Mild downside protection being bought — some hedging activity but not alarm-level fear.'
                        : analysis.optionsIV.putSkew < 12
                        ? 'Elevated put buying — market is paying a clear premium to hedge against a downside miss.'
                        : 'Heavy put buying relative to calls — options market is pricing in meaningful downside risk.'}
                    </p>
                    {analysis.optionsIV.nearExpiry && (
                      <p className="text-[9px] font-mono text-gray-600 mt-0.5">Expiry: {analysis.optionsIV.nearExpiry}</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {analysis.revenueGrowthTTM !== null && (
              <div>
                <p className="text-[9px] font-mono text-gray-600 uppercase tracking-wider">Revenue Growth</p>
                <p className={`text-[11px] font-mono ${analysis.revenueGrowthTTM >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                  {analysis.revenueGrowthTTM >= 0 ? '+' : ''}{analysis.revenueGrowthTTM.toFixed(1)}% TTM YoY
                </p>
              </div>
            )}
            <div>
              <p className="text-[9px] font-mono text-gray-600 uppercase tracking-wider">Sector ETF ({analysis.sectorEtf})</p>
              {analysis.sectorReturns ? (
                <div className="flex gap-3 mt-0.5">
                  <span className={`text-[11px] font-mono ${analysis.sectorReturns.d30 >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                    30d: {analysis.sectorReturns.d30 >= 0 ? '+' : ''}{analysis.sectorReturns.d30.toFixed(2)}%
                  </span>
                  <span className={`text-[11px] font-mono ${analysis.sectorReturns.d60 >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                    60d: {analysis.sectorReturns.d60 >= 0 ? '+' : ''}{analysis.sectorReturns.d60.toFixed(2)}%
                  </span>
                </div>
              ) : (
                <p className="text-[11px] font-mono text-gray-600">N/A</p>
              )}
              {analysis.industry && <p className="text-[10px] font-mono text-gray-600 mt-0.5">{analysis.industry}</p>}
            </div>
          </div>

          {analysis.history.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-800/60">
              <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider mb-2">EPS History (Last {Math.min(analysis.history.length, 8)} Quarters)</p>
              <div className="space-y-1 max-h-36 overflow-y-auto custom-scrollbar">
                {analysis.history.slice(0, 8).map((q, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-gray-600 w-24">{q.period}</span>
                    <span className="text-gray-400 w-16 text-right">A: {q.actual.toFixed(2)}</span>
                    <span className="text-gray-500 w-16 text-right">E: {q.estimate.toFixed(2)}</span>
                    <span className={`w-20 text-right ${q.surprise > 0.005 ? 'text-blue-400' : q.surprise < -0.005 ? 'text-red-400' : 'text-gray-500'}`}>
                      {q.surprise >= 0 ? '+' : ''}{q.surprisePct.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="bg-black/40 border border-blue-500/10 rounded-lg p-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-800" />
            <div className="flex-1">
              <div className="h-4 w-24 bg-gray-800 rounded mb-2" />
              <div className="h-3 w-40 bg-gray-800/60 rounded" />
            </div>
            <div className="h-5 w-16 bg-gray-800 rounded" />
          </div>
          <div className="mt-3 h-2 bg-gray-800 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export default function PolyEarnPage({ onClose }: PolyEarnPageProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('custom');
  const [earnings, setEarnings] = useState<EarningsAnalysis[]>([]);
  const [proData, setProData] = useState<ProAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterTab>('this_week');
  const [proSort, setProSort] = useState<'signal' | 'date' | 'poly'>('signal');
  const [proSearch, setProSearch] = useState('');
  const [proTickerLoading, setProTickerLoading] = useState(false);

  const addProTicker = async (raw: string) => {
    const symbol = raw.trim().toUpperCase();
    if (!symbol || !/^[A-Z]{1,6}$/.test(symbol)) return;
    if (proData.some(a => a.symbol === symbol)) return; // already loaded
    setProTickerLoading(true);
    try {
      const calendar = await fetchUpcomingEarnings(); // uses cached data
      const calendarMap = new Map(calendar.map(e => [e.symbol, e]));
      const results = await fetchProAnalysisList([symbol], calendarMap);
      if (results.length > 0) {
        setProData(prev => prev.some(a => a.symbol === symbol) ? prev : [...prev, ...results]);
      }
    } catch { /* ignore */ } finally {
      setProTickerLoading(false);
    }
  };

  // Share / export state
  const [shareMode, setShareMode] = useState(false);
  const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());

  const toggleSelect = (symbol: string) => {
    setSelectedSymbols(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol); else next.add(symbol);
      return next;
    });
  };

  const handleExport = async () => {
    const elements: HTMLElement[] = [];
    for (const symbol of selectedSymbols) {
      const el = cardRefs.current.get(symbol);
      if (el) elements.push(el);
    }
    if (elements.length === 0) return;
    setExporting(true);
    try {
      await exportCardsAsImage(elements);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExporting(false);
    }
  };

  // Custom ticker input
  const [watchlist, setWatchlist] = useState<string[]>(loadWatchlist);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Load data when mode or watchlist changes
  useEffect(() => {
    let mounted = true;

    if (viewMode === 'calendar') {
      const cached = getCached<EarningsAnalysis[]>('polyearn_calendar');
      if (cached) { setEarnings(cached); setLoading(false); return; }
      setLoading(true);
      (async () => {
        try {
          const [raw, polyTickers] = await Promise.all([
            fetchUpcomingEarnings(),
            getPolymarketEarningsTickers(),
          ]);
          if (!mounted) return;

          const polySet = new Set(polyTickers);
          const candidates = raw
            .filter(e => e.date && polySet.has(e.symbol))
            .sort((a, b) => a.date.localeCompare(b.date));

          const results = await Promise.all(candidates.map(async e => {
            const polymarket = await fetchPolymarketEarnings(e.symbol);
            return {
              ...e,
              polymarket: polymarket || undefined,
              history: [],
              beatCount: 0,
              missCount: 0,
              meetCount: 0,
              beatRate: 0,
              avgSurprisePct: 0,
              prediction: null,
              confidence: null,
              reasoning: '',
            } as EarningsAnalysis;
          }));

          if (mounted) {
            setCache('polyearn_calendar', results);
            setEarnings(results);
            setLoading(false);
          }
        } catch {
          if (mounted) setLoading(false);
        }
      })();
    } else if (viewMode === 'pro') {
      const cached = getCached<ProAnalysis[]>('polyearn_pro_v2');
      if (cached) { setProData(cached); setLoading(false); return; }
      setLoading(true);
      setProData([]);
      (async () => {
        try {
          const [raw, polyTickers] = await Promise.all([
            fetchUpcomingEarnings(),
            getPolymarketEarningsTickers(),
          ]);
          if (!mounted) return;

          const polySet = new Set(polyTickers);
          const calendarMap = new Map(raw.filter(e => polySet.has(e.symbol)).map(e => [e.symbol, e]));
          const symbols = [...calendarMap.keys()];

          let finalPro: ProAnalysis[] = [];
          await fetchProAnalysisList(symbols, calendarMap, partial => {
            finalPro = [...partial];
            if (mounted) setProData(finalPro);
          });
          if (mounted) {
            setCache('polyearn_pro_v2', finalPro);
            setLoading(false);
          }
        } catch {
          if (mounted) setLoading(false);
        }
      })();
    } else if (viewMode === 'custom' && watchlist.length > 0) {
      const cacheKey = `polyearn_custom_${[...watchlist].sort().join(',')}`;
      const cached = getCached<EarningsAnalysis[]>(cacheKey);
      if (cached) { setEarnings(cached); setLoading(false); return; }
      setLoading(true);
      analyzeCustomTickers(watchlist).then(data => {
        if (mounted) {
          setCache(cacheKey, data);
          setEarnings(data);
          setLoading(false);
        }
      }).catch(() => { if (mounted) setLoading(false); });
    } else {
      setEarnings([]);
    }

    return () => { mounted = false; };
  }, [viewMode, watchlist]);

  const addTicker = (raw: string) => {
    // Support comma/space separated input
    const tickers = raw.toUpperCase().split(/[\s,]+/).filter(t => /^[A-Z]{1,5}$/.test(t));
    if (tickers.length === 0) return;
    const updated = [...new Set([...watchlist, ...tickers])];
    setWatchlist(updated);
    saveWatchlist(updated);
    setInputValue('');
  };

  const removeTicker = (symbol: string) => {
    const updated = watchlist.filter(t => t !== symbol);
    setWatchlist(updated);
    saveWatchlist(updated);
    setEarnings(prev => prev.filter(e => e.symbol !== symbol));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      addTicker(inputValue.trim());
    }
  };

  // Calendar mode filtering
  const thisWeek = getWeekRange(0);
  const nextWeek = getWeekRange(1);

  const displayed = viewMode === 'calendar'
    ? earnings.filter(e => {
        if (filter === 'this_week') return e.date >= thisWeek.from && e.date <= thisWeek.to;
        if (filter === 'next_week') return e.date >= nextWeek.from && e.date <= nextWeek.to;
        return true;
      })
    : earnings;

  // Group by date for calendar mode
  const grouped = new Map<string, EarningsAnalysis[]>();
  for (const e of displayed) {
    const key = e.date || 'unknown';
    const existing = grouped.get(key) || [];
    existing.push(e);
    grouped.set(key, existing);
  }
  const sortedDates = [...grouped.keys()].sort();

  const beatCount = displayed.filter(e => e.prediction === 'BEAT').length;
  const missCount = displayed.filter(e => e.prediction === 'MISS').length;
  const polyCount = displayed.filter(e => e.polymarket).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-5xl bg-[#0a0a0a] border border-blue-500/30 sm:rounded-xl shadow-[0_0_40px_rgba(0,255,0,0.1)] flex flex-col h-[95dvh] sm:max-h-[90vh] rounded-t-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:p-6 border-b border-blue-500/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              <h2 className="text-2xl font-bold text-white tracking-tight">PolyEarn</h2>
              <a
                href="https://polyverse.capital/earn"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 transition-colors"
              >
                go deeper ↗
              </a>
            </div>
            <p className="text-gray-500 text-sm font-mono">AI predictions + Polymarket odds</p>
            <p className="text-gray-600 text-[10px] font-mono mt-1">powered by <span className="text-gray-500">commonstack ai</span></p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setShareMode(s => !s); setSelectedSymbols(new Set()); }}
              title="Select cards to export as image"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors border ${
                shareMode
                  ? 'bg-pink-500/20 border-pink-500/50 text-pink-400'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              {shareMode ? 'Selecting…' : 'Share'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-blue-400 transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Mode toggle + controls */}
        <div className="p-6 pb-0 space-y-3">
          {/* View mode toggle */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('custom')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                  viewMode === 'custom'
                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/50'
                    : 'bg-transparent text-gray-400 border-gray-700 hover:border-blue-500/30 hover:text-gray-200'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5" />
                  Custom
                </span>
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                  viewMode === 'calendar'
                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/50'
                    : 'bg-transparent text-gray-400 border-gray-700 hover:border-blue-500/30 hover:text-gray-200'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Calendar
                </span>
              </button>
              <button
                onClick={() => setViewMode('pro')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                  viewMode === 'pro'
                    ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
                    : 'bg-transparent text-gray-400 border-gray-700 hover:border-yellow-500/30 hover:text-gray-200'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  Pro
                </span>
              </button>
            </div>

            {!loading && displayed.length > 0 && (
              <div className="flex items-center gap-4 text-xs font-mono">
                <span className="text-gray-500">{displayed.length} companies</span>
                {beatCount > 0 && <span className="text-blue-400">{beatCount} beats</span>}
                {missCount > 0 && <span className="text-red-400">{missCount} misses</span>}
                {polyCount > 0 && <span className="text-blue-400">{polyCount} on Poly</span>}
              </div>
            )}
          </div>

          {/* Custom ticker input */}
          {viewMode === 'custom' && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value.toUpperCase())}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter tickers (e.g. COST, AVGO, BBWI)"
                    className="w-full px-4 py-2 bg-black/60 border border-blue-500/20 rounded-lg text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <button
                  onClick={() => inputValue.trim() && addTicker(inputValue.trim())}
                  className="px-4 py-2 bg-blue-500/20 border border-blue-500/40 rounded-lg text-blue-400 text-sm font-mono hover:bg-blue-500/30 transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
                <button
                  onClick={async () => {
                    const tickers = await getPolymarketEarningsTickers();
                    if (tickers.length > 0) {
                      const updated = [...new Set([...watchlist, ...tickers])];
                      setWatchlist(updated);
                      saveWatchlist(updated);
                    }
                  }}
                  className="px-4 py-2 bg-blue-500/20 border border-blue-500/40 rounded-lg text-blue-400 text-sm font-mono hover:bg-blue-500/30 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  Polymarket
                </button>
              </div>

              {/* Ticker chips */}
              {watchlist.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {watchlist.map(ticker => (
                    <span
                      key={ticker}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 rounded text-xs font-mono text-blue-400"
                    >
                      {ticker}
                      <button
                        onClick={() => removeTicker(ticker)}
                        className="text-blue-500/50 hover:text-red-400 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {watchlist.length > 0 && (
                    <button
                      onClick={() => { setWatchlist([]); saveWatchlist([]); setEarnings([]); }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-red-500/60 hover:text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" /> Clear all
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Pro sort + search controls */}
          {viewMode === 'pro' && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600 pointer-events-none" />
                  <input
                    type="text"
                    value={proSearch}
                    onChange={e => setProSearch(e.target.value.toUpperCase())}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const sym = proSearch.trim().toUpperCase();
                        if (/^[A-Z]{1,6}$/.test(sym) && !proData.some(a => a.symbol === sym)) {
                          addProTicker(sym);
                        }
                      }
                    }}
                    placeholder="Search or add ticker…"
                    className="pl-8 pr-7 py-1.5 bg-black/60 border border-yellow-500/20 rounded-lg text-xs font-mono text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50 w-52"
                  />
                  {proSearch && (
                    <button
                      onClick={() => setProSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {/* Show Add button when search looks like a ticker not yet in list */}
                {/^[A-Z]{1,6}$/.test(proSearch) && !proData.some(a => a.symbol === proSearch) && (
                  <button
                    onClick={() => addProTicker(proSearch)}
                    disabled={proTickerLoading}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 rounded-lg text-xs font-mono hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
                  >
                    {proTickerLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    {proTickerLoading ? '' : 'Add'}
                  </button>
                )}
                {proData.length > 0 && (
                  <button
                    onClick={() => { setProData([]); localStorage.removeItem('polyearn_pro_v2'); localStorage.removeItem('polyearn_pro'); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400/70 rounded-lg text-xs font-mono hover:bg-red-500/20 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" /> Clear all
                  </button>
                )}
              </div>
              <span className="text-[11px] font-mono text-gray-600">Sort:</span>
              {([
                { key: 'signal', label: 'Signal Score' },
                { key: 'date',   label: 'Date' },
                { key: 'poly',   label: 'Poly Odds' },
              ] as const).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setProSort(opt.key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                    proSort === opt.key
                      ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
                      : 'bg-transparent text-gray-500 border-gray-700 hover:text-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Calendar filter tabs */}
          {viewMode === 'calendar' && (
            <div className="flex gap-2">
              {([
                { key: 'this_week', label: 'This Week' },
                { key: 'next_week', label: 'Next Week' },
                { key: 'all', label: 'All Upcoming' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                    filter === tab.key
                      ? 'bg-blue-500/20 text-blue-400 border-blue-500/50'
                      : 'bg-transparent text-gray-400 border-gray-700 hover:border-blue-500/30 hover:text-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {viewMode === 'pro' ? (
            // Pro mode
            (() => {
              const sorted = [...proData]
              .filter(a => !proSearch || a.symbol.includes(proSearch) || a.name.toUpperCase().includes(proSearch))
              .sort((a, b) => {
                if (proSort === 'signal') return b.signalScore - a.signalScore;
                if (proSort === 'date')   return a.date.localeCompare(b.date);
                if (proSort === 'poly') {
                  const ap = a.polymarket?.yesPct ?? -1;
                  const bp = b.polymarket?.yesPct ?? -1;
                  return bp - ap;
                }
                return 0;
              });
              return (
                <>
                  {loading && (
                    <div className="flex items-center gap-2 text-yellow-400/70 font-mono text-sm mb-4">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {proData.length === 0
                        ? 'Fetching Polymarket tickers & sector data…'
                        : `Loading indicators… (${proData.length} loaded, rate-paced to stay under Finnhub limit)`}
                    </div>
                  )}
                  {!loading && proData.length === 0 && !proTickerLoading && (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <Zap className="w-8 h-8 text-gray-700" />
                      <p className="text-gray-500 font-mono text-sm">No Polymarket earnings found.</p>
                      <p className="text-gray-600 text-xs font-mono">Type a ticker above and press Enter to add it manually.</p>
                    </div>
                  )}
                  {proTickerLoading && (
                    <div className="flex items-center gap-2 text-yellow-400/70 font-mono text-xs mb-3">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Fetching {proSearch} pro analysis…
                    </div>
                  )}
                  {/* Search returned no results but has items overall */}
                  {!loading && proData.length > 0 && sorted.length === 0 && proSearch && (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      {/^[A-Z]{1,6}$/.test(proSearch) ? (
                        <>
                          <p className="text-gray-500 font-mono text-sm">{proSearch} not in loaded list.</p>
                          <button
                            onClick={() => addProTicker(proSearch)}
                            disabled={proTickerLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 rounded-lg text-sm font-mono hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
                          >
                            {proTickerLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            Add {proSearch} to Pro
                          </button>
                        </>
                      ) : (
                        <p className="text-gray-500 font-mono text-sm">No results for "{proSearch}".</p>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {sorted.map(a => (
                      <ProCard
                        key={a.symbol}
                        analysis={a}
                        shareMode={shareMode}
                        selected={selectedSymbols.has(a.symbol)}
                        onToggleSelect={() => toggleSelect(a.symbol)}
                        onRef={el => { if (el) cardRefs.current.set(a.symbol, el); else cardRefs.current.delete(a.symbol); }}
                      />
                    ))}
                  </div>
                </>
              );
            })()
          ) : loading ? (
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-2 text-blue-400/70 font-mono text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                {viewMode === 'custom' ? 'Analyzing tickers...' : 'Loading earnings data...'}
              </div>
              <LoadingSkeleton />
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              {viewMode === 'custom' ? (
                <>
                  <Search className="w-8 h-8 text-gray-700" />
                  <p className="text-gray-500 font-mono text-sm">Add tickers above to get started.</p>
                  <p className="text-gray-600 text-xs font-mono">e.g. COST, AVGO, BBWI, GPRO, VSCO</p>
                </>
              ) : (
                <>
                  <Calendar className="w-8 h-8 text-gray-700" />
                  <p className="text-gray-500 font-mono text-sm">No upcoming earnings found for this period.</p>
                  <p className="text-gray-600 text-xs font-mono">Try selecting a different time range.</p>
                </>
              )}
            </div>
          ) : viewMode === 'custom' ? (
            // Custom mode: flat grid
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {displayed.map(analysis => (
                <EarningsCard
                  key={analysis.symbol}
                  analysis={analysis}
                  onRemove={shareMode ? undefined : () => removeTicker(analysis.symbol)}
                  shareMode={shareMode}
                  selected={selectedSymbols.has(analysis.symbol)}
                  onToggleSelect={() => toggleSelect(analysis.symbol)}
                  onRef={el => { if (el) cardRefs.current.set(analysis.symbol, el); else cardRefs.current.delete(analysis.symbol); }}
                />
              ))}
            </div>
          ) : (
            // Calendar mode: grouped by date
            <div className="space-y-6">
              {sortedDates.map(date => {
                const dayEarnings = grouped.get(date)!;
                const hourOrder = { bmo: 0, dmh: 1, amc: 2, '': 3 };
                dayEarnings.sort((a, b) => (hourOrder[a.hour as keyof typeof hourOrder] ?? 3) - (hourOrder[b.hour as keyof typeof hourOrder] ?? 3));

                const hourGroups = new Map<string, EarningsAnalysis[]>();
                for (const e of dayEarnings) {
                  const h = e.hour || 'tbd';
                  const existing = hourGroups.get(h) || [];
                  existing.push(e);
                  hourGroups.set(h, existing);
                }

                return (
                  <div key={date}>
                    <div className="flex items-center gap-2 mb-3">
                      <Calendar className="w-4 h-4 text-blue-500/60" />
                      <h3 className="text-sm font-bold text-white font-mono">
                        {date !== 'unknown' ? formatDate(date) : 'Date TBD'}
                      </h3>
                      <span className="text-[10px] text-gray-600 font-mono">{dayEarnings.length} companies</span>
                    </div>

                    {[...hourGroups.entries()].map(([hour, items]) => (
                      <div key={hour} className="mb-4">
                        <div className="flex items-center gap-2 mb-2 ml-6">
                          <Clock className="w-3 h-3 text-gray-600" />
                          <span className="text-[10px] font-mono text-gray-600 uppercase tracking-wider">
                            {formatHour(hour === 'tbd' ? '' : hour)}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 ml-6">
                          {items.map(analysis => (
                            <EarningsCard
                              key={analysis.symbol}
                              analysis={analysis}
                              shareMode={shareMode}
                              selected={selectedSymbols.has(analysis.symbol)}
                              onToggleSelect={() => toggleSelect(analysis.symbol)}
                              onRef={el => { if (el) cardRefs.current.set(analysis.symbol, el); else cardRefs.current.delete(analysis.symbol); }}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Floating export bar */}
        {shareMode && selectedSymbols.size > 0 && (
          <div className="border-t border-pink-500/20 bg-[#0a0a0a] px-6 py-3 flex items-center justify-between">
            <span className="text-sm font-mono text-pink-300">
              {selectedSymbols.size} card{selectedSymbols.size !== 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedSymbols(new Set())}
                className="text-xs font-mono text-gray-500 hover:text-gray-300 transition-colors"
              >
                Clear
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-pink-500/20 border border-pink-500/50 text-pink-400 rounded-lg text-sm font-mono hover:bg-pink-500/30 transition-colors disabled:opacity-50"
              >
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                {exporting ? 'Rendering…' : 'Export PNG'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
