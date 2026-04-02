import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const FREE_LIMIT = 3;

interface EarningsQuarter {
  actual: number | null;
  estimate: number | null;
  period: string;
  quarter: number;
  surprise: number | null;
  surprisePercent: number | null;
  symbol: string;
  year: number;
}

interface TickerResult {
  ticker: string;
  quarters: EarningsQuarter[];
  beatRate: number;
  avgSurprise: number;
  recentForm: string;
  score: number;
}

const backtest = [
  { n: 1,  date: '2026-03-25', ticker: 'CTAS', outcome: 'BEAT', result: 'WIN',  score: '8.8',  beatRate: '100%', recent: '3/4', avgSurp: '+1.5%',   est: '1.23',  actual: '1.24'  },
  { n: 2,  date: '2026-03-25', ticker: 'PAYX', outcome: 'BEAT', result: 'WIN',  score: '8.8',  beatRate: '100%', recent: '3/4', avgSurp: '+1.1%',   est: '1.68',  actual: '1.71'  },
  { n: 3,  date: '2026-03-19', ticker: 'FDX',  outcome: 'BEAT', result: 'WIN',  score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+8.6%',   est: '4.14',  actual: '5.25'  },
  { n: 4,  date: '2026-03-19', ticker: 'ACN',  outcome: 'BEAT', result: 'WIN',  score: '8.8',  beatRate: '100%', recent: '3/4', avgSurp: '+4.4%',   est: '2.86',  actual: '2.93'  },
  { n: 5,  date: '2026-03-18', ticker: 'FIVE', outcome: 'BEAT', result: 'WIN',  score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+81.8%',  est: '3.99',  actual: '4.31'  },
  { n: 6,  date: '2026-03-18', ticker: 'GIS',  outcome: 'MISS', result: 'LOSS', score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+6.1%',   est: '0.74',  actual: '0.64'  },
  { n: 7,  date: '2026-03-18', ticker: 'JBL',  outcome: 'BEAT', result: 'WIN',  score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+6.4%',   est: '2.39',  actual: '2.44'  },
  { n: 8,  date: '2026-03-18', ticker: 'MU',   outcome: 'BEAT', result: 'WIN',  score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+17.9%',  est: '8.64',  actual: '12.08' },
  { n: 9,  date: '2026-03-18', ticker: 'WSM',  outcome: 'BEAT', result: 'WIN',  score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+7.2%',   est: '2.89',  actual: '3.04'  },
  { n: 10, date: '2026-03-17', ticker: 'ESLT', outcome: 'BEAT', result: 'WIN',  score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+19.7%',  est: '3.23',  actual: '3.56'  },
  { n: 11, date: '2026-03-17', ticker: 'LULU', outcome: 'BEAT', result: 'WIN',  score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+8.7%',   est: '4.76',  actual: '5.01'  },
  { n: 12, date: '2026-03-16', ticker: 'DLTR', outcome: 'BEAT', result: 'WIN',  score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+39.8%',  est: '2.53',  actual: '2.56'  },
  { n: 13, date: '2026-03-12', ticker: 'DG',   outcome: 'BEAT', result: 'WIN',  score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+26.5%',  est: '1.61',  actual: '1.93'  },
  { n: 14, date: '2026-03-12', ticker: 'RBRK', outcome: 'BEAT', result: 'WIN',  score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+36.7%',  est: '-0.53', actual: '-0.37' },
  { n: 15, date: '2026-03-12', ticker: 'ULTA', outcome: 'BEAT', result: 'WIN',  score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+14.6%',  est: '8.00',  actual: '8.01'  },
  { n: 16, date: '2026-03-12', ticker: 'WPM',  outcome: 'BEAT', result: 'WIN',  score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+7.9%',   est: '0.93',  actual: '1.22'  },
  { n: 17, date: '2026-03-12', ticker: 'ADBE', outcome: 'MISS', result: 'LOSS', score: '8.8',  beatRate: '100%', recent: '3/4', avgSurp: '+2.6%',   est: '4.85',  actual: '4.83'  },
  { n: 18, date: '2026-03-10', ticker: 'FNV',  outcome: 'BEAT', result: 'WIN',  score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+8.0%',   est: '1.68',  actual: '1.85'  },
  { n: 19, date: '2026-03-10', ticker: 'ORCL', outcome: 'BEAT', result: 'WIN',  score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+19.8%',  est: '1.34',  actual: '1.43'  },
  { n: 20, date: '2026-03-09', ticker: 'CASY', outcome: 'BEAT', result: 'WIN',  score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+228.7%', est: '3.01',  actual: '3.49'  },
  { n: 21, date: '2026-03-05', ticker: 'BJ',   outcome: 'BEAT', result: 'WIN',  score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+11.5%',  est: '0.93',  actual: '0.96'  },
  { n: 22, date: '2026-03-05', ticker: 'BURL', outcome: 'BEAT', result: 'WIN',  score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+17.0%',  est: '4.70',  actual: '4.89'  },
  { n: 23, date: '2026-03-05', ticker: 'CNO',  outcome: 'BEAT', result: 'WIN',  score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+13.9%',  est: '0.53',  actual: '0.59'  },
  { n: 24, date: '2026-03-05', ticker: 'GWRE', outcome: 'BEAT', result: 'WIN',  score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+252.7%', est: '0.33',  actual: '0.72'  },
  { n: 25, date: '2026-03-05', ticker: 'IOT',  outcome: 'BEAT', result: 'WIN',  score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+81.9%',  est: '-0.01', actual: '0.04'  },
  { n: 26, date: '2026-03-05', ticker: 'JD',   outcome: 'BEAT', result: 'WIN',  score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+22.2%',  est: '-0.03', actual: '-0.02' },
  { n: 27, date: '2026-03-05', ticker: 'COO',  outcome: 'BEAT', result: 'WIN',  score: '8.8',  beatRate: '100%', recent: '3/4', avgSurp: '+3.2%',   est: '1.03',  actual: '1.10'  },
  { n: 28, date: '2026-03-05', ticker: 'COST', outcome: 'BEAT', result: 'WIN',  score: '8.8',  beatRate: '100%', recent: '3/4', avgSurp: '+1.2%',   est: '4.55',  actual: '4.58'  },
  { n: 29, date: '2026-03-05', ticker: 'KR',   outcome: 'BEAT', result: 'WIN',  score: '8.8',  beatRate: '100%', recent: '3/4', avgSurp: '+2.6%',   est: '1.20',  actual: '1.28'  },
  { n: 30, date: '2026-03-04', ticker: 'DY',   outcome: 'BEAT', result: 'WIN',  score: '10.0', beatRate: '100%', recent: '3/4', avgSurp: '+26.6%',  est: '1.91',  actual: '2.03'  },
];

function calcScore(beatRate: number, avgSurprise: number): number {
  const beatScore = beatRate >= 1.0 ? 5 : beatRate >= 0.75 ? 3.5 : beatRate >= 0.5 ? 2 : 0;
  const surpriseScore = avgSurprise >= 10 ? 5 : avgSurprise >= 5 ? 4 : avgSurprise >= 2 ? 3 : avgSurprise >= 0 ? 2 : 0;
  return Math.min(10, parseFloat((beatScore + surpriseScore).toFixed(1)));
}

function calcRecentForm(quarters: EarningsQuarter[]): string {
  const recent = quarters.slice(0, 4);
  const beats = recent.filter(q => q.actual !== null && q.estimate !== null && q.actual > q.estimate).length;
  return `${beats}/4`;
}

export default function EarnPage() {
  const { user } = useAuth();
  const [ticker, setTicker] = useState('');
  const [searchCount, setSearchCount] = useState<number | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [result, setResult] = useState<TickerResult | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  // Fetch count fresh from Supabase on mount — don't rely on cached profile
  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, settings')
        .eq('supabase_user_id', authUser.id)
        .single();

      if (profile) {
        const settings = (profile.settings ?? {}) as Record<string, unknown>;
        setSearchCount((settings.earn_search_count as number) ?? 0);
        setProfileId(profile.id);
      }
    };
    load();
  }, []);

  const handleSearch = async () => {
    const sym = ticker.trim().toUpperCase();
    if (!sym) return;

    const currentCount = searchCount ?? 0;
    if (currentCount >= FREE_LIMIT) {
      setShowPaywall(true);
      return;
    }

    setFetching(true);
    setError(null);
    setResult(null);

    try {
      const apiKey = process.env.FINNHUB_API_KEY;
      const res = await fetch(`https://finnhub.io/api/v1/stock/earnings?symbol=${sym}&token=${apiKey}`);
      const data: EarningsQuarter[] = await res.json();

      if (!Array.isArray(data) || data.length === 0) {
        setError(`No earnings data found for "${sym}". Check the ticker symbol.`);
        setFetching(false);
        return;
      }

      const valid = data.filter(q => q.actual !== null && q.estimate !== null);
      const beats = valid.filter(q => q.actual! > q.estimate!).length;
      const beatRate = valid.length > 0 ? beats / valid.length : 0;
      const avgSurprise = valid.length > 0
        ? valid.reduce((sum, q) => sum + (q.surprisePercent ?? 0), 0) / valid.length
        : 0;

      setResult({
        ticker: sym,
        quarters: data.slice(0, 8),
        beatRate,
        avgSurprise,
        recentForm: calcRecentForm(data),
        score: calcScore(beatRate, avgSurprise),
      });

      // Increment locally and persist to Supabase
      const newCount = currentCount + 1;
      setSearchCount(newCount);

      if (profileId) {
        // Fetch latest settings first to avoid overwriting other keys
        const { data: fresh } = await supabase
          .from('profiles')
          .select('settings')
          .eq('id', profileId)
          .single();

        const latestSettings = ((fresh?.settings ?? {}) as Record<string, unknown>);
        await supabase.from('profiles').update({
          settings: { ...latestSettings, earn_search_count: newCount },
        }).eq('id', profileId);
      }

      if (newCount >= FREE_LIMIT) setShowPaywall(true);

    } catch {
      setError('Failed to fetch data. Please try again.');
    }

    setFetching(false);
  };

  const remaining = FREE_LIMIT - (searchCount ?? 0);
  const atLimit = (searchCount ?? 0) >= FREE_LIMIT;

  return (
    <div className="min-h-screen bg-[#050505] text-white font-mono">
      {/* Nav */}
      <div className="border-b border-white/5 px-6 py-3 flex items-center justify-between">
        <a href="/" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">
          ← back
        </a>
        <span className="text-[10px] text-gray-600 tracking-widest">POLYHERMES AGENT</span>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
            POLYVERSE <span className="text-blue-400">/EARN</span>
          </h1>
          <p className="text-gray-500 text-xs">Earnings beat signal analyser</p>
        </div>

        {/* Search */}
        <div className="mb-8">
          <div className="flex gap-2 max-w-sm mx-auto">
            <input
              type="text"
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="Enter ticker (e.g. AAPL)"
              disabled={atLimit}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 disabled:opacity-40"
            />
            <button
              onClick={handleSearch}
              disabled={!ticker.trim() || fetching || atLimit}
              className="px-5 py-3 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-400 text-sm font-semibold hover:bg-blue-500/30 transition-colors disabled:opacity-40"
            >
              {fetching ? '…' : 'Analyse'}
            </button>
          </div>

          {/* Usage indicator */}
          {searchCount !== null && (
            <div className="flex justify-center mt-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] tracking-wider border ${
                atLimit
                  ? 'bg-red-500/10 border-red-500/20 text-red-400'
                  : remaining === 1
                  ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
                  : 'bg-white/[0.03] border-white/10 text-gray-500'
              }`}>
                <span className="flex gap-1">
                  {[...Array(FREE_LIMIT)].map((_, i) => (
                    <span key={i} className={`w-1.5 h-1.5 rounded-full ${i < (searchCount ?? 0) ? 'bg-current' : 'bg-white/10'}`} />
                  ))}
                </span>
                {atLimit ? 'FREE LIMIT REACHED' : `${remaining} FREE ${remaining === 1 ? 'SEARCH' : 'SEARCHES'} REMAINING`}
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="max-w-sm mx-auto mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center">
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mb-10 rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
            {/* Result header */}
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <span className="text-xl font-bold text-white">{result.ticker}</span>
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                  result.score >= 8 ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                  : result.score >= 6 ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
                  : 'bg-white/5 border-white/10 text-gray-400'
                }`}>
                  SCORE {result.score.toFixed(1)}
                </span>
              </div>
              <div className="flex items-center gap-5 text-xs">
                <div className="text-center">
                  <div className="text-white font-bold">{(result.beatRate * 100).toFixed(0)}%</div>
                  <div className="text-gray-600 text-[10px] mt-0.5">BEAT RATE</div>
                </div>
                <div className="w-px h-6 bg-white/10" />
                <div className="text-center">
                  <div className={`font-bold ${result.avgSurprise >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                    {result.avgSurprise >= 0 ? '+' : ''}{result.avgSurprise.toFixed(1)}%
                  </div>
                  <div className="text-gray-600 text-[10px] mt-0.5">AVG SURPRISE</div>
                </div>
                <div className="w-px h-6 bg-white/10" />
                <div className="text-center">
                  <div className="text-white font-bold">{result.recentForm}</div>
                  <div className="text-gray-600 text-[10px] mt-0.5">RECENT (4Q)</div>
                </div>
              </div>
            </div>

            {/* Quarters table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02]">
                    {['Period', 'Estimate', 'Actual', 'Surprise', 'Surprise %', 'Result'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-center text-[10px] text-blue-400 tracking-wider font-semibold whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.quarters.map((q, i) => {
                    const beat = q.actual !== null && q.estimate !== null && q.actual > q.estimate;
                    const miss = q.actual !== null && q.estimate !== null && q.actual < q.estimate;
                    return (
                      <tr key={i} className={`border-b border-white/5 hover:bg-white/[0.03] ${i % 2 === 0 ? '' : 'bg-white/[0.015]'}`}>
                        <td className="px-4 py-2.5 text-center text-gray-400">{q.period}</td>
                        <td className="px-4 py-2.5 text-center text-gray-400">{q.estimate?.toFixed(2) ?? '—'}</td>
                        <td className="px-4 py-2.5 text-center font-semibold text-white">{q.actual?.toFixed(2) ?? '—'}</td>
                        <td className="px-4 py-2.5 text-center text-gray-400">{q.surprise?.toFixed(2) ?? '—'}</td>
                        <td className={`px-4 py-2.5 text-center font-semibold ${beat ? 'text-blue-400' : miss ? 'text-red-400' : 'text-gray-400'}`}>
                          {q.surprisePercent != null ? `${q.surprisePercent >= 0 ? '+' : ''}${q.surprisePercent.toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {beat ? <span className="text-blue-400 font-bold">BEAT</span>
                            : miss ? <span className="text-red-400 font-bold">MISS</span>
                            : <span className="text-gray-600">IN LINE</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Paywall */}
        {showPaywall && (
          <div className="mb-10 max-w-sm mx-auto rounded-xl border border-blue-500/30 bg-blue-500/5 p-6 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto">
              <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <div className="text-white font-semibold text-sm">Free limit reached</div>
            <p className="text-gray-500 text-xs leading-relaxed">
              You've used all 3 free searches. Upgrade to Pro for unlimited earnings analysis.
            </p>
            <button className="w-full py-2.5 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-400 text-sm font-semibold hover:bg-blue-500/30 transition-colors">
              Upgrade to Pro
            </button>
            <button onClick={() => setShowPaywall(false)} className="text-[11px] text-gray-600 hover:text-gray-400">
              Dismiss
            </button>
          </div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-white/5" />
          <span className="text-[10px] text-gray-700 tracking-widest">BACKTEST — PAST 31 DAYS</span>
          <div className="flex-1 h-px bg-white/5" />
        </div>

        {/* Stats row */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex items-center gap-6 bg-white/[0.03] border border-white/10 rounded-xl px-8 py-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">54</div>
              <div className="text-[10px] text-gray-500 mt-0.5 tracking-wider">YES BETS</div>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">47</div>
              <div className="text-[10px] text-gray-500 mt-0.5 tracking-wider">YES WINS</div>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">87.0%</div>
              <div className="text-[10px] text-gray-500 mt-0.5 tracking-wider">WIN RATE</div>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <div className="text-2xl font-bold text-white">30</div>
              <div className="text-[10px] text-gray-500 mt-0.5 tracking-wider">TOP SIGNALS</div>
            </div>
          </div>
        </div>

        {/* Backtest Table */}
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02]">
                {['#','Date','Ticker','Outcome','Result','Score','BeatRate','Recent','AvgSurp','Est','Actual EPS'].map(h => (
                  <th key={h} className="px-3 py-3 text-center text-[10px] text-blue-400 tracking-wider font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {backtest.map((row, i) => {
                const isLoss = row.result === 'LOSS';
                return (
                  <tr key={row.n} className={`border-b border-white/5 transition-colors hover:bg-white/[0.03] ${i % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.015]'}`}>
                    <td className="px-3 py-2.5 text-center text-gray-500">{row.n}</td>
                    <td className="px-3 py-2.5 text-center text-gray-400">{row.date}</td>
                    <td className="px-3 py-2.5 text-center font-bold text-white">{row.ticker}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`font-semibold ${row.outcome === 'BEAT' ? 'text-blue-400' : 'text-red-400'}`}>{row.outcome}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`font-bold ${isLoss ? 'text-red-400' : 'text-blue-400'}`}>{row.result}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`font-bold ${parseFloat(row.score) >= 10 ? 'text-blue-400' : 'text-gray-300'}`}>{row.score}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-300">{row.beatRate}</td>
                    <td className="px-3 py-2.5 text-center text-gray-300">{row.recent}</td>
                    <td className="px-3 py-2.5 text-center text-blue-400">{row.avgSurp}</td>
                    <td className="px-3 py-2.5 text-center text-gray-400">{row.est}</td>
                    <td className="px-3 py-2.5 text-center font-semibold text-white">{row.actual}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-center text-[10px] text-gray-700 mt-6 tracking-wide">
          Filtered to YES predictions only. No NO-bet metrics included. Universe: past 31 days, market cap &ge; $100M.
        </p>

        <div className="text-center mt-10">
          <a href="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-colors text-sm">
            ← Back to Polyverse
          </a>
        </div>
      </div>
    </div>
  );
}
