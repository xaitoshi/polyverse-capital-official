import React from 'react';

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

export default function EarnPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white font-mono">
      {/* Nav */}
      <div className="border-b border-white/5 px-6 py-3 flex items-center justify-between">
        <a href="/" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">
          ← polyverse.capital
        </a>
        <span className="text-[10px] text-gray-600 tracking-widest">POLYHERMES AGENT</span>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
            POLYVERSE <span className="text-blue-400">/EARN</span>
          </h1>
          <p className="text-gray-400 text-sm mb-6">YES Bets Only Backtest &mdash; Past 31 Days</p>

          {/* Stats row */}
          <div className="inline-flex items-center gap-6 bg-white/[0.03] border border-white/10 rounded-xl px-8 py-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">54</div>
              <div className="text-[10px] text-gray-500 mt-0.5 tracking-wider">YES BETS</div>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">47</div>
              <div className="text-[10px] text-gray-500 mt-0.5 tracking-wider">YES WINS</div>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">87.0%</div>
              <div className="text-[10px] text-gray-500 mt-0.5 tracking-wider">WIN RATE</div>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">30</div>
              <div className="text-[10px] text-gray-500 mt-0.5 tracking-wider">TOP SIGNALS</div>
            </div>
          </div>
        </div>

        {/* Table */}
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
                  <tr
                    key={row.n}
                    className={`border-b border-white/5 transition-colors hover:bg-white/[0.03] ${
                      i % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.015]'
                    }`}
                  >
                    <td className="px-3 py-2.5 text-center text-gray-500">{row.n}</td>
                    <td className="px-3 py-2.5 text-center text-gray-400">{row.date}</td>
                    <td className="px-3 py-2.5 text-center font-bold text-white">{row.ticker}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`font-semibold ${row.outcome === 'BEAT' ? 'text-blue-400' : 'text-red-400'}`}>
                        {row.outcome}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`font-bold ${isLoss ? 'text-red-400' : 'text-green-400'}`}>
                        {row.result}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`font-bold ${parseFloat(row.score) >= 10 ? 'text-green-400' : 'text-blue-300'}`}>
                        {row.score}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-300">{row.beatRate}</td>
                    <td className="px-3 py-2.5 text-center text-gray-300">{row.recent}</td>
                    <td className="px-3 py-2.5 text-center text-green-400">{row.avgSurp}</td>
                    <td className="px-3 py-2.5 text-center text-gray-400">{row.est}</td>
                    <td className="px-3 py-2.5 text-center font-semibold text-white">{row.actual}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer note */}
        <p className="text-center text-[10px] text-gray-600 mt-6 tracking-wide">
          Filtered to YES predictions only. No NO-bet metrics included. Universe: past 31 days, market cap &ge; $100M.
        </p>

        {/* Back CTA */}
        <div className="text-center mt-12">
          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 transition-colors text-sm"
          >
            ← Back to Polyverse
          </a>
        </div>
      </div>
    </div>
  );
}
