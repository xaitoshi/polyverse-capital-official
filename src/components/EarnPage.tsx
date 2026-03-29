import React, { useState, useEffect } from 'react';
import { Globe2, TrendingUp, ChevronRight, ExternalLink, Trophy, Target, BarChart3, Zap } from 'lucide-react';
import PolyEarnPage from './PolyEarnPage';

// ── Polyhermes agent backtest — Mar 4–25 2026 (YES bets only) ─────────────────
const POLYHERMES_STATS = { bets: 54, wins: 47, winRate: 87.0, period: 'Mar 4–25, 2026' };
const POLYHERMES_ROWS = [
  { n:1,  date:'2026-03-25', t:'CTAS', o:'BEAT', r:'WIN',  s:8.8,  br:'100%', rc:'3/4', as:'+1.5%',   est:1.23,  act:1.24  },
  { n:2,  date:'2026-03-25', t:'PAYX', o:'BEAT', r:'WIN',  s:8.8,  br:'100%', rc:'3/4', as:'+1.1%',   est:1.68,  act:1.71  },
  { n:3,  date:'2026-03-19', t:'FDX',  o:'BEAT', r:'WIN',  s:10.0, br:'100%', rc:'3/4', as:'+8.6%',   est:4.14,  act:5.25  },
  { n:4,  date:'2026-03-19', t:'ACN',  o:'BEAT', r:'WIN',  s:8.8,  br:'100%', rc:'3/4', as:'+4.4%',   est:2.86,  act:2.93  },
  { n:5,  date:'2026-03-18', t:'FIVE', o:'BEAT', r:'WIN',  s:10.0, br:'100%', rc:'3/4', as:'+81.8%',  est:3.99,  act:4.31  },
  { n:6,  date:'2026-03-18', t:'GIS',  o:'MISS', r:'LOSS', s:10.0, br:'100%', rc:'3/4', as:'+6.1%',   est:0.74,  act:0.64  },
  { n:7,  date:'2026-03-18', t:'JBL',  o:'BEAT', r:'WIN',  s:10.0, br:'100%', rc:'3/4', as:'+6.4%',   est:2.39,  act:2.44  },
  { n:8,  date:'2026-03-18', t:'MU',   o:'BEAT', r:'WIN',  s:10.0, br:'100%', rc:'3/4', as:'+17.9%',  est:8.64,  act:12.08 },
  { n:9,  date:'2026-03-18', t:'WSM',  o:'BEAT', r:'WIN',  s:10.0, br:'100%', rc:'3/4', as:'+7.2%',   est:2.89,  act:3.04  },
  { n:10, date:'2026-03-17', t:'ESLT', o:'BEAT', r:'WIN',  s:10.0, br:'100%', rc:'3/4', as:'+19.7%',  est:3.23,  act:3.56  },
  { n:11, date:'2026-03-17', t:'LULU', o:'BEAT', r:'WIN',  s:10.0, br:'100%', rc:'3/4', as:'+8.7%',   est:4.76,  act:5.01  },
  { n:12, date:'2026-03-16', t:'DLTR', o:'BEAT', r:'WIN',  s:10.0, br:'100%', rc:'3/4', as:'+39.8%',  est:2.53,  act:2.56  },
  { n:13, date:'2026-03-12', t:'DG',   o:'BEAT', r:'WIN',  s:10.0, br:'100%', rc:'3/4', as:'+26.5%',  est:1.61,  act:1.93  },
  { n:14, date:'2026-03-12', t:'RBRK', o:'BEAT', r:'WIN',  s:8.8,  br:'100%', rc:'3/4', as:'+36.7%',  est:-0.53, act:-0.37 },
  { n:15, date:'2026-03-12', t:'ULTA', o:'BEAT', r:'WIN',  s:10.0, br:'100%', rc:'3/4', as:'+14.6%',  est:8.00,  act:8.01  },
  { n:16, date:'2026-03-12', t:'WPM',  o:'BEAT', r:'WIN',  s:10.0, br:'100%', rc:'3/4', as:'+7.9%',   est:0.93,  act:1.22  },
  { n:17, date:'2026-03-12', t:'ADBE', o:'MISS', r:'LOSS', s:8.8,  br:'100%', rc:'3/4', as:'+2.6%',   est:4.85,  act:4.83  },
  { n:18, date:'2026-03-10', t:'FNV',  o:'BEAT', r:'WIN',  s:10.0, br:'100%', rc:'3/4', as:'+8.0%',   est:1.68,  act:1.85  },
  { n:19, date:'2026-03-10', t:'ORCL', o:'BEAT', r:'WIN',  s:10.0, br:'100%', rc:'3/4', as:'+19.8%',  est:1.34,  act:1.43  },
  { n:20, date:'2026-03-09', t:'CASY', o:'BEAT', r:'WIN',  s:10.0, br:'100%', rc:'3/4', as:'+228.7%', est:3.01,  act:3.49  },
  { n:21, date:'2026-03-05', t:'BJ',   o:'BEAT', r:'WIN',  s:10.0, br:'100%', rc:'3/4', as:'+11.5%',  est:0.93,  act:0.96  },
  { n:22, date:'2026-03-05', t:'BURL', o:'BEAT', r:'WIN',  s:10.0, br:'100%', rc:'3/4', as:'+17.0%',  est:4.70,  act:4.89  },
  { n:23, date:'2026-03-05', t:'CNO',  o:'BEAT', r:'WIN',  s:10.0, br:'100%', rc:'3/4', as:'+13.9%',  est:0.53,  act:0.59  },
  { n:24, date:'2026-03-05', t:'GWRE', o:'BEAT', r:'WIN',  s:10.0, br:'100%', rc:'3/4', as:'+252.7%', est:0.33,  act:0.72  },
  { n:25, date:'2026-03-05', t:'IOT',  o:'BEAT', r:'WIN',  s:10.0, br:'100%', rc:'3/4', as:'+81.9%',  est:-0.01, act:0.04  },
  { n:26, date:'2026-03-05', t:'JD',   o:'BEAT', r:'WIN',  s:10.0, br:'100%', rc:'3/4', as:'+22.2%',  est:-0.03, act:-0.02 },
  { n:27, date:'2026-03-05', t:'COO',  o:'BEAT', r:'WIN',  s:8.8,  br:'100%', rc:'3/4', as:'+3.2%',   est:1.03,  act:1.10  },
  { n:28, date:'2026-03-05', t:'COST', o:'BEAT', r:'WIN',  s:8.8,  br:'100%', rc:'3/4', as:'+1.2%',   est:4.55,  act:4.58  },
  { n:29, date:'2026-03-05', t:'KR',   o:'BEAT', r:'WIN',  s:8.8,  br:'100%', rc:'3/4', as:'+2.6%',   est:1.20,  act:1.28  },
  { n:30, date:'2026-03-04', t:'DY',   o:'BEAT', r:'WIN',  s:10.0, br:'100%', rc:'3/4', as:'+26.6%',  est:1.91,  act:2.03  },
] as const;

type Tab = 'signals' | 'backtest';

export default function EarnPage() {
  const [tab, setTab] = useState<Tab>('signals');

  useEffect(() => {
    document.title = 'Polyverse /Earn — Earnings Beat Signals';
  }, []);

  return (
    <div className="min-h-screen bg-black text-white font-mono flex flex-col">

      {/* Star field */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 80 }, (_, i) => (
          <div key={i} className="absolute rounded-full bg-white" style={{
            top: `${(i * 137.5) % 100}%`,
            left: `${(i * 97.3) % 100}%`,
            width: i % 7 === 0 ? 2 : 1,
            height: i % 7 === 0 ? 2 : 1,
            opacity: 0.1 + (i % 5) * 0.06,
          }} />
        ))}
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 md:px-10 py-4 border-b border-white/5">
        <a href="/" className="flex items-center gap-2">
          <Globe2 className="w-5 h-5 text-blue-400" />
          <span className="text-blue-400 font-bold tracking-wider text-sm">POLYVERSE CAPITAL</span>
        </a>
        <div className="flex items-center gap-3">
          <span className="text-gray-600 text-xs">/</span>
          <span className="text-white/70 text-xs font-bold tracking-wider">EARN</span>
          <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-blue-400 transition-colors">
            Polymarket <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </nav>

      {/* Hero */}
      <div className="relative z-10 px-6 md:px-10 pt-10 pb-8 border-b border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[11px] text-green-400/80 tracking-widest uppercase">Live Signals Active</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white mb-2">
            POLYVERSE <span className="text-blue-400">/EARN</span>
          </h1>
          <p className="text-gray-400 text-sm max-w-lg mb-8">
            AI-powered earnings beat prediction signals. Multi-factor analysis across beat rate, analyst consensus, insider activity, revenue momentum, and options market data.
          </p>

          {/* Performance stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="w-3.5 h-3.5 text-green-400" />
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Win Rate</span>
              </div>
              <div className="text-2xl font-black text-green-400">{POLYHERMES_STATS.winRate}%</div>
              <div className="text-[10px] text-gray-600 mt-0.5">{POLYHERMES_STATS.period}</div>
            </div>
            <div className="bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">YES Bets</span>
              </div>
              <div className="text-2xl font-black text-white">{POLYHERMES_STATS.bets}</div>
              <div className="text-[10px] text-gray-600 mt-0.5">Signals generated</div>
            </div>
            <div className="bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Wins</span>
              </div>
              <div className="text-2xl font-black text-white">{POLYHERMES_STATS.wins}</div>
              <div className="text-[10px] text-gray-600 mt-0.5">Correct predictions</div>
            </div>
            <div className="bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Losses</span>
              </div>
              <div className="text-2xl font-black text-red-400">{POLYHERMES_STATS.bets - POLYHERMES_STATS.wins}</div>
              <div className="text-[10px] text-gray-600 mt-0.5">Missed signals</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="relative z-10 px-6 md:px-10 border-b border-white/5">
        <div className="max-w-5xl mx-auto flex gap-1 pt-3">
          <button onClick={() => setTab('signals')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold transition-all rounded-t-lg ${
              tab === 'signals' ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/5' : 'text-gray-500 hover:text-gray-300'
            }`}>
            <TrendingUp className="w-4 h-4" /> Live Signals
          </button>
          <button onClick={() => setTab('backtest')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold transition-all rounded-t-lg ${
              tab === 'backtest' ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/5' : 'text-gray-500 hover:text-gray-300'
            }`}>
            <BarChart3 className="w-4 h-4" /> Backtest Results
            <span className="text-[10px] bg-green-500/20 text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded-full">
              87% win rate
            </span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1">

        {/* Live Signals */}
        {tab === 'signals' && (
          <div className="relative" style={{ minHeight: '80vh' }}>
            <PolyEarnPage onClose={() => {}} />
          </div>
        )}

        {/* Backtest Results */}
        {tab === 'backtest' && (
          <div className="px-4 md:px-10 py-8">
            <div className="max-w-6xl mx-auto">

              {/* Stats header */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-6 text-sm text-gray-400">
                <span><span className="text-white font-bold">YES bets:</span> {POLYHERMES_STATS.bets}</span>
                <span className="text-gray-700">|</span>
                <span><span className="text-white font-bold">YES wins:</span> {POLYHERMES_STATS.wins}</span>
                <span className="text-gray-700">|</span>
                <span>
                  <span className="text-white font-bold">YES win rate:</span>{' '}
                  <span className="text-green-400 font-black">{POLYHERMES_STATS.winRate}%</span>
                </span>
                <span className="text-gray-700">|</span>
                <span className="text-gray-500">Top {POLYHERMES_ROWS.length} YES signals shown</span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-white/8 bg-white/[0.02]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/8">
                      {['#','Date','Ticker','Outcome','Result','Score','BeatRate','Recent','AvgSurp','Est','Actual EPS'].map(col => (
                        <th key={col} className="px-3 py-3 text-left text-blue-400/80 font-bold tracking-wider whitespace-nowrap">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {POLYHERMES_ROWS.map((row, i) => (
                      <tr key={row.n} className={`border-b border-white/4 hover:bg-white/[0.03] transition-colors ${i % 2 === 1 ? 'bg-white/[0.01]' : ''}`}>
                        <td className="px-3 py-2.5 text-gray-600">{row.n}</td>
                        <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{row.date}</td>
                        <td className="px-3 py-2.5 font-bold text-white tracking-wider">{row.t}</td>
                        <td className="px-3 py-2.5">
                          <span className={`font-bold ${row.o === 'BEAT' ? 'text-cyan-400' : 'text-orange-400'}`}>{row.o}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`font-black px-2 py-0.5 rounded text-[11px] ${row.r === 'WIN' ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
                            {row.r}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`font-bold ${row.s === 10.0 ? 'text-green-400' : 'text-blue-400'}`}>{row.s.toFixed(1)}</span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-300">{row.br}</td>
                        <td className="px-3 py-2.5 text-gray-400">{row.rc}</td>
                        <td className="px-3 py-2.5 text-green-400/80">{row.as}</td>
                        <td className="px-3 py-2.5 text-gray-400">{row.est.toFixed(2)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`font-bold ${row.act > row.est ? 'text-green-400' : 'text-red-400'}`}>{row.act.toFixed(2)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-center text-gray-600 text-[11px] mt-6">
                Filtered to YES predictions only. No NO-bet metrics included. Universe: past 31 days, market cap ≥ $100M.
              </p>

              {/* Accuracy bar */}
              <div className="mt-8 max-w-md mx-auto">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] text-gray-500">Signal accuracy</span>
                  <span className="ml-auto text-[11px] text-green-400 font-bold">{POLYHERMES_STATS.winRate}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-green-500 to-green-400" style={{ width: `${POLYHERMES_STATS.winRate}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                  <span>{POLYHERMES_STATS.wins} wins</span>
                  <span>{POLYHERMES_STATS.bets - POLYHERMES_STATS.wins} losses</span>
                </div>
              </div>

              <div className="mt-10 text-center">
                <button onClick={() => setTab('signals')}
                  className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 text-blue-400 px-6 py-3 rounded-xl text-sm font-bold hover:bg-blue-500/20 transition-colors">
                  View Live Signals <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 px-6 md:px-10 py-5 text-center">
        <div className="flex items-center justify-center gap-2 text-gray-700 text-[11px] tracking-widest">
          <Globe2 className="w-3 h-3" />
          POLYVERSE CAPITAL &nbsp;·&nbsp; NOT FINANCIAL ADVICE &nbsp;·&nbsp; FOR INFORMATIONAL USE ONLY
        </div>
      </footer>
    </div>
  );
}
