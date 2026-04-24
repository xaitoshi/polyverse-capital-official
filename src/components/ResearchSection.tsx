import React, { useState, useCallback, useEffect } from 'react';
import { BookOpen, Clock, ArrowUpRight, Search, X, Loader2, ExternalLink, Brain, Trophy } from 'lucide-react';
import { analyzeAccountStrategy, getAccountOneLiner } from '../services/geminiService';
import TradeJournal from './TradeJournal';
import {
  fetchPolyActivity,
  fetchPolyPositions,
  fetchPolyProfile,
  PolyTrade,
  PolyPosition,
  PolyProfile,
} from '../services/polymarketUserService';
import { getArticles, Article } from '../data/articlesData';

const TAG_COLORS: Record<string, string> = {
  Macro:    'text-blue-400 bg-blue-400/10 border-blue-400/30',
  Earnings: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  Crypto:   'text-purple-400 bg-purple-400/10 border-purple-400/30',
  Tech:     'text-cyan-400 bg-cyan-400/10 border-cyan-400/30',
  Equities: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  Options:  'text-orange-400 bg-orange-400/10 border-orange-400/30',
  Strategy: 'text-pink-400 bg-pink-400/10 border-pink-400/30',
};

function Tag({ label }: { label: string }) {
  return (
    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${TAG_COLORS[label] ?? 'text-gray-400 bg-gray-400/10 border-gray-400/30'}`}>
      {label}
    </span>
  );
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Wallet tracker ───────────────────────────────────────────────────────────

const SAVED_WALLETS_KEY = 'pvrs_saved_wallets';
const ONELINERS_KEY = 'pvrs_oneliners';

function getSavedAddresses(): string[] {
  try { return JSON.parse(localStorage.getItem(SAVED_WALLETS_KEY) || '[]'); } catch { return []; }
}
function saveAddresses(addresses: string[]) {
  localStorage.setItem(SAVED_WALLETS_KEY, JSON.stringify(addresses));
}
function getCachedOneLiner(address: string): string {
  try { return JSON.parse(localStorage.getItem(ONELINERS_KEY) || '{}')[address.toLowerCase()] || ''; } catch { return ''; }
}
function cacheOneLiner(address: string, text: string) {
  try {
    const all = JSON.parse(localStorage.getItem(ONELINERS_KEY) || '{}');
    all[address.toLowerCase()] = text;
    localStorage.setItem(ONELINERS_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

function calcWinRate(positions: PolyPosition[]): { wins: number; total: number; pct: number } {
  const closed = positions.filter(p => p.closed);
  const wins = closed.filter(p => p.cashPnl > 0).length;
  return { wins, total: closed.length, pct: closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0 };
}

interface TrackedAccount {
  address: string;
  profile: PolyProfile | null;
  trades: PolyTrade[];
  positions: PolyPosition[];
  oneLiner: string;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function AccountCard({ account, onRemove }: { account: TrackedAccount; onRemove: () => void }) {
  const [tab, setTab] = useState<'activity' | 'positions' | 'strategy'>('positions');
  const [strategyText, setStrategyText] = useState<string>('');
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [strategyFetched, setStrategyFetched] = useState(false);

  async function loadStrategy() {
    if (strategyFetched) return;
    setStrategyLoading(true);
    try {
      const result = await analyzeAccountStrategy(account.trades, account.positions);
      setStrategyText(result);
    } catch {
      setStrategyText('Failed to analyze strategy. Please try again.');
    } finally {
      setStrategyLoading(false);
      setStrategyFetched(true);
    }
  }

  const totalPnl = account.positions.reduce((s, p) => s + p.cashPnl, 0);
  const openCount = account.positions.filter(p => !p.closed).length;
  const winRate = calcWinRate(account.positions);

  return (
    <div className="border border-blue-500/20 rounded-lg overflow-hidden mb-4">
      {/* Header */}
      <div className="px-5 py-4 bg-blue-500/5 border-b border-blue-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {account.profile?.pfpUrl || account.profile?.profileImage ? (
              <img src={account.profile.pfpUrl ?? account.profile.profileImage} className="w-8 h-8 rounded-full border border-blue-500/30" alt="" />
            ) : (
              <div className="w-8 h-8 rounded-full border border-blue-500/30 bg-blue-500/10 flex items-center justify-center text-blue-400 text-xs font-mono">
                {account.address.slice(2, 4).toUpperCase()}
              </div>
            )}
            <div>
              <div className="text-sm font-bold text-blue-400 font-mono">
                {account.profile?.displayName ?? shortAddr(account.address)}
              </div>
              <div className="text-[10px] text-gray-500 font-mono">{shortAddr(account.address)}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className={`text-sm font-mono font-bold ${totalPnl >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                {totalPnl >= 0 ? '+' : ''}${fmt(totalPnl)}
              </div>
              <div className="text-[10px] text-gray-500">unrealised P&L</div>
            </div>
            <div className="text-right hidden sm:block">
              <div className="text-sm font-mono font-bold text-yellow-400">{openCount}</div>
              <div className="text-[10px] text-gray-500">open positions</div>
            </div>
            {winRate.total > 0 && (
              <div className="text-right hidden sm:block">
                <div className={`text-sm font-mono font-bold flex items-center gap-1 justify-end ${winRate.pct >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                  <Trophy className="w-3 h-3" />{winRate.pct}%
                </div>
                <div className="text-[10px] text-gray-500">win rate ({winRate.wins}/{winRate.total})</div>
              </div>
            )}
            <a
              href={`https://polymarket.com/profile/${account.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-blue-400 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button onClick={onRemove} className="text-gray-600 hover:text-red-400 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {account.oneLiner && (
          <div className="mt-2.5 ml-11 text-[11px] text-gray-400 font-mono italic border-l-2 border-blue-500/20 pl-3">
            {account.oneLiner}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-blue-500/20">
        {(['positions', 'activity'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 text-xs font-mono transition-colors ${tab === t ? 'text-blue-400 border-b-2 border-blue-400 -mb-px' : 'text-gray-500 hover:text-blue-400'}`}
          >
            {t.toUpperCase()}
          </button>
        ))}
        <button
          onClick={() => { setTab('strategy'); loadStrategy(); }}
          className={`px-5 py-2 text-xs font-mono transition-colors flex items-center gap-1.5 ${tab === 'strategy' ? 'text-blue-400 border-b-2 border-blue-400 -mb-px' : 'text-gray-500 hover:text-blue-400'}`}
        >
          <Brain className="w-3 h-3" /> STRATEGY
        </button>
      </div>

      {/* Positions */}
      {tab === 'positions' && (
        <div className="overflow-x-auto">
          {account.positions.length === 0 ? (
            <div className="px-5 py-6 text-xs text-gray-600 font-mono text-center">No open positions found</div>
          ) : (
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-gray-600 border-b border-blue-500/10">
                  <th className="text-left px-4 py-2 font-normal">MARKET</th>
                  <th className="text-left px-4 py-2 font-normal">OUTCOME</th>
                  <th className="text-right px-4 py-2 font-normal">SHARES</th>
                  <th className="text-right px-4 py-2 font-normal">AVG</th>
                  <th className="text-right px-4 py-2 font-normal">CURRENT</th>
                  <th className="text-right px-4 py-2 font-normal">P&L</th>
                  <th className="text-right px-4 py-2 font-normal">%</th>
                </tr>
              </thead>
              <tbody>
                {account.positions.map((p, i) => (
                  <tr key={p.conditionId + p.outcome} className={`border-b border-blue-500/10 last:border-0 ${i % 2 ? 'bg-white/[0.02]' : ''}`}>
                    <td className="px-4 py-2.5 text-gray-200 max-w-xs truncate">{p.title}</td>
                    <td className="px-4 py-2.5">
                      <span className={p.outcome.toLowerCase() === 'yes' ? 'text-blue-400' : 'text-red-400'}>{p.outcome.toUpperCase()}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-300">{fmt(p.size)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">{(p.avgPrice * 100).toFixed(1)}¢</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">${fmt(p.currentValue)}</td>
                    <td className={`px-4 py-2.5 text-right font-bold ${p.cashPnl >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                      {p.cashPnl >= 0 ? '+' : ''}${fmt(p.cashPnl)}
                    </td>
                    <td className={`px-4 py-2.5 text-right ${p.percentPnl >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                      {p.percentPnl >= 0 ? '+' : ''}{p.percentPnl.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Activity */}
      {tab === 'activity' && (
        <div className="overflow-x-auto">
          {account.trades.length === 0 ? (
            <div className="px-5 py-6 text-xs text-gray-600 font-mono text-center">No recent activity found</div>
          ) : (
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-gray-600 border-b border-blue-500/10">
                  <th className="text-left px-4 py-2 font-normal">DATE</th>
                  <th className="text-left px-4 py-2 font-normal">MARKET</th>
                  <th className="text-left px-4 py-2 font-normal">SIDE</th>
                  <th className="text-left px-4 py-2 font-normal">OUTCOME</th>
                  <th className="text-right px-4 py-2 font-normal">PRICE</th>
                  <th className="text-right px-4 py-2 font-normal">USDC</th>
                </tr>
              </thead>
              <tbody>
                {account.trades.slice(0, 30).map((t, i) => (
                  <tr key={t.id} className={`border-b border-blue-500/10 last:border-0 ${i % 2 ? 'bg-white/[0.02]' : ''}`}>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(t.timestamp)}</td>
                    <td className="px-4 py-2.5 text-gray-200 max-w-xs truncate">{t.title}</td>
                    <td className={`px-4 py-2.5 ${t.type === 'BUY' ? 'text-blue-400' : 'text-red-400'}`}>{t.type}</td>
                    <td className={`px-4 py-2.5 ${t.outcome.toLowerCase() === 'yes' ? 'text-blue-400' : 'text-red-400'}`}>{t.outcome.toUpperCase()}</td>
                    <td className="px-4 py-2.5 text-right text-gray-300">{(t.price * 100).toFixed(1)}¢</td>
                    <td className="px-4 py-2.5 text-right text-gray-300">${fmt(t.usdcSize)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Strategy */}
      {tab === 'strategy' && (
        <div className="px-5 py-5">
          {strategyLoading ? (
            <div className="flex items-center gap-3 text-xs text-gray-500 font-mono">
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
              Analyzing trading patterns...
            </div>
          ) : strategyText ? (
            <div className="text-xs text-gray-300 font-mono leading-relaxed whitespace-pre-wrap">{strategyText}</div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <Brain className="w-6 h-6 text-blue-500/40" />
              <p className="text-xs text-gray-500 font-mono">Click to analyze this account's trading strategy using AI</p>
              <button
                onClick={loadStrategy}
                className="px-4 py-2 text-xs font-mono bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded hover:bg-blue-500/20 transition-colors"
              >
                ANALYZE STRATEGY
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ResearchSection() {
  const [input, setInput] = useState('');
  const [accounts, setAccounts] = useState<TrackedAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAddr, setLoadingAddr] = useState<string>('');
  const [error, setError] = useState('');
  const [articles, setArticles] = useState<Article[]>(() => getArticles());

  // Refresh articles when admin saves
  useEffect(() => {
    const onStorage = () => setArticles(getArticles());
    window.addEventListener('klvs_articles_updated', onStorage);
    return () => window.removeEventListener('klvs_articles_updated', onStorage);
  }, []);

  // On mount: reload all saved wallets
  useEffect(() => {
    const saved = getSavedAddresses();
    if (saved.length === 0) return;
    saved.forEach(address => fetchAndAdd(address, false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchAndAdd(address: string, saveToStorage: boolean) {
    setLoadingAddr(address);
    try {
      const [profile, trades, positions] = await Promise.all([
        fetchPolyProfile(address),
        fetchPolyActivity(address, 50),
        fetchPolyPositions(address),
      ]);
      // Get 1-liner from cache or generate it
      let oneLiner = getCachedOneLiner(address);
      const newAccount: TrackedAccount = { address, profile, trades, positions, oneLiner };
      setAccounts(prev => {
        const exists = prev.some(a => a.address.toLowerCase() === address.toLowerCase());
        return exists ? prev : [...prev, newAccount];
      });
      if (saveToStorage) {
        const saved = getSavedAddresses();
        if (!saved.map(s => s.toLowerCase()).includes(address.toLowerCase())) {
          saveAddresses([...saved, address]);
        }
      }
      // Generate 1-liner in background if not cached
      if (!oneLiner) {
        getAccountOneLiner(trades, positions).then(text => {
          cacheOneLiner(address, text);
          setAccounts(prev => prev.map(a =>
            a.address.toLowerCase() === address.toLowerCase() ? { ...a, oneLiner: text } : a
          ));
        }).catch(() => {});
      }
    } catch (e: any) {
      if (saveToStorage) setError(e.message ?? 'Failed to fetch account');
    } finally {
      setLoadingAddr('');
    }
  }

  const addAccount = useCallback(async () => {
    const address = input.trim();
    if (!address) return;
    if (accounts.some(a => a.address.toLowerCase() === address.toLowerCase())) {
      setError('Account already tracked');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await fetchAndAdd(address, true);
      setInput('');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, accounts]);

  const removeAccount = (address: string) => {
    setAccounts(prev => prev.filter(a => a.address !== address));
    const saved = getSavedAddresses().filter(a => a.toLowerCase() !== address.toLowerCase());
    saveAddresses(saved);
  };

  return (
    <div className="bg-[#04070c] text-ink font-mono">
      <div className="border-t border-blue-500/20" />

      {/* ── Trade tracker ── */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <h2 className="text-blue-400 font-bold tracking-wider text-lg mb-2">// POLYMARKET ACCOUNT TRACKER AND ANALYSER</h2>
        <p className="text-gray-500 text-xs mb-6">Enter any Polymarket wallet address to track their positions and trade activity.</p>

        {/* Input */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-blue-500/40" />
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addAccount()}
              placeholder="0x… wallet address"
              className="w-full bg-black/40 border border-blue-500/30 rounded pl-9 pr-4 py-2.5 text-sm text-blue-50 placeholder:text-gray-600 focus:outline-none focus:border-blue-500/60"
            />
          </div>
          <button
            onClick={addAccount}
            disabled={loading || !input.trim()}
            className="px-5 py-2.5 text-sm bg-blue-500/10 border border-blue-500/40 text-blue-400 rounded hover:bg-blue-500/20 transition-colors disabled:opacity-40 flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? 'Loading…' : 'Track'}
          </button>
        </div>

        {error && <p className="text-red-400 text-xs mb-4 font-mono">{error}</p>}

        {loadingAddr && (
          <div className="flex items-center gap-2 text-xs text-gray-500 font-mono mb-4">
            <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
            Loading {shortAddr(loadingAddr)}…
          </div>
        )}

        {accounts.length === 0 && !loading && !loadingAddr && (
          <div className="border border-blue-500/10 rounded-lg p-8 text-center text-gray-600 text-xs">
            No accounts tracked yet. Add a Polymarket wallet address above.
          </div>
        )}

        {accounts.map(acc => (
          <AccountCard key={acc.address} account={acc} onRemove={() => removeAccount(acc.address)} />
        ))}
      </div>

      {/* ── Trade Journal ── */}
      <TradeJournal />

      {/* ── Articles ── */}
      <div className="border-t border-blue-500/20">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <h2 className="text-blue-400 font-bold tracking-wider text-lg mb-8">// RESEARCH &amp; ARTICLES</h2>

          {articles.filter(a => a.featured).map(a => (
            <div key={a.id} className="border border-blue-500/30 rounded-lg p-6 mb-6 bg-blue-500/5 hover:bg-blue-500/[0.08] transition-colors cursor-pointer group">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded border text-blue-400 bg-blue-400/10 border-blue-400/30">FEATURED</span>
                    <Tag label={a.tag} />
                  </div>
                  <h3 className="text-white font-bold text-xl tracking-wide leading-snug mb-3 group-hover:text-blue-400 transition-colors">{a.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed mb-4">{a.excerpt}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-600">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{a.date}</span>
                    <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{a.readTime}</span>
                  </div>
                </div>
                <ArrowUpRight className="w-5 h-5 text-blue-500/40 group-hover:text-blue-400 transition-colors shrink-0 mt-1" />
              </div>
            </div>
          ))}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {articles.filter(a => !a.featured).map(a => (
              <div key={a.id} className="border border-blue-500/20 rounded-lg p-5 hover:border-blue-500/40 hover:bg-blue-500/5 transition-colors cursor-pointer group">
                <div className="flex items-center justify-between mb-3">
                  <Tag label={a.tag} />
                  <ArrowUpRight className="w-4 h-4 text-blue-500/30 group-hover:text-blue-400 transition-colors" />
                </div>
                <h3 className="text-gray-200 font-bold text-sm leading-snug mb-2 group-hover:text-blue-400 transition-colors">{a.title}</h3>
                <p className="text-gray-500 text-xs leading-relaxed mb-4 line-clamp-3">{a.excerpt}</p>
                <div className="flex items-center gap-3 text-[10px] text-gray-600">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{a.date}</span>
                  <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{a.readTime}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-blue-500/20 py-8 text-center text-xs text-gray-600 font-mono tracking-wider">
        POLYVERSE CAPITAL — BUILDING TOOLS FOR NICHE MARKETS
      </div>
    </div>
  );
}
