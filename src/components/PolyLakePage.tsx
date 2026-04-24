import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, Plus, Trash2, X, ChevronDown, ChevronUp, Send, Sparkles } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Wallet {
  id: string;
  address: string;
  label: string | null;
  category: string;
  display_name: string | null;
  pfp_url: string | null;
  win_rate: number | null;
  total_pnl: number | null;
  open_positions: number | null;
  portfolio_value: number | null;
  added_at: string;
  last_refreshed_at: string | null;
  ai_summary: string | null;
}

interface Trade {
  trade_id: string;
  timestamp: string | null;
  type: string;
  outcome: string;
  title: string;
  price: number | null;
  usdc_size: number | null;
}

interface Position {
  condition_id: string;
  title: string;
  outcome: string;
  avg_price: number | null;
  current_value: number | null;
  cash_pnl: number | null;
  percent_pnl: number | null;
  closed: boolean;
  winning_outcome: string | null;
}

interface ChatMessage { role: 'user' | 'ai'; text: string }

// ── Constants ─────────────────────────────────────────────────────────────────
const CATEGORIES = ['Uncategorized', 'Crypto', 'Politics', 'Sports', 'Economics', 'Science', 'Pop Culture', 'Multi-market'];

const CAT_COLORS: Record<string, string> = {
  Crypto:        'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  Politics:      'text-red-400 bg-red-400/10 border-red-400/30',
  Sports:        'text-green-400 bg-green-400/10 border-green-400/30',
  Economics:     'text-blue-400 bg-blue-400/10 border-blue-400/30',
  Science:       'text-purple-400 bg-purple-400/10 border-purple-400/30',
  'Pop Culture': 'text-pink-400 bg-pink-400/10 border-pink-400/30',
  'Multi-market':'text-cyan-400 bg-cyan-400/10 border-cyan-400/30',
  Uncategorized: 'text-gray-500 bg-gray-500/10 border-gray-500/30',
};

const SUGGESTED_PROMPTS = [
  'Which wallets have the highest win rate?',
  'Show me wallets profitable in Crypto markets',
  'Which wallets are currently long on Politics?',
  'Find wallets with recent BUY trades in the last week',
  'Who has the biggest open PnL right now?',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
// Extract wallet address or username from a Polymarket URL or raw input
// Handles: 0x address | polymarket.com/profile/0x... | polymarket.com/@username
function parsePolymarketInput(raw: string): string {
  const s = raw.trim();
  // Extract 0x address if present in URL
  const addrMatch = s.match(/0x[a-fA-F0-9]{40}/);
  if (addrMatch) return addrMatch[0];
  // Extract @username from URL like polymarket.com/@jimmyhasballs
  const userMatch = s.match(/polymarket\.com\/@([\w.-]+)/i);
  if (userMatch) return `@${userMatch[1]}`;
  // Bare @username
  if (s.startsWith('@')) return s;
  return s;
}

const truncAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const fmtPct   = (v: number | null) => v == null ? 'N/A' : `${Math.round(v * 100)}%`;
const fmtUsd   = (v: number | null) => v == null ? 'N/A' : `${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`;
const pnlColor = (v: number | null) => v == null ? 'text-gray-500' : v >= 0 ? 'text-green-400' : 'text-red-400';
const wrColor  = (v: number | null) => v == null ? 'text-gray-500' : v >= 0.6 ? 'text-green-400' : v >= 0.5 ? 'text-blue-400' : 'text-orange-400';

// ── WalletCard ────────────────────────────────────────────────────────────────
function WalletCard({
  wallet, onRefresh, onDelete, onUpdateCategory, onUpdateLabel,
}: {
  wallet: Wallet;
  onRefresh: (addr: string) => void;
  onDelete: (addr: string) => void;
  onUpdateCategory: (addr: string, cat: string) => void;
  onUpdateLabel: (addr: string, label: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab]           = useState<'positions' | 'trades'>('positions');
  const [detail, setDetail]     = useState<{ trades: Trade[]; positions: Position[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(wallet.label || '');
  const [refreshing, setRefreshing] = useState(false);

  const loadDetail = async () => {
    if (detail) return;
    setDetailLoading(true);
    try {
      const r = await fetch(`/api/polylake/detail?address=${wallet.address}`);
      const data = await r.json();
      setDetail(data);
    } catch {}
    setDetailLoading(false);
  };

  const toggleExpand = () => {
    if (!expanded) loadDetail();
    setExpanded(v => !v);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setDetail(null);
    await onRefresh(wallet.address);
    setRefreshing(false);
    // Reload detail after refresh
    try {
      const r = await fetch(`/api/polylake/detail?address=${wallet.address}`);
      setDetail(await r.json());
    } catch {}
  };

  const catClass = CAT_COLORS[wallet.category] ?? CAT_COLORS['Uncategorized'];
  const name = wallet.display_name || truncAddr(wallet.address);

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {wallet.pfp_url
              ? <img src={wallet.pfp_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
              : <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 shrink-0 flex items-center justify-center text-[10px] text-blue-400 font-mono">{name.slice(0, 2).toUpperCase()}</div>
            }
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">{name}</div>
              <div className="text-[10px] text-gray-600 font-mono">{truncAddr(wallet.address)}</div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={handleRefresh} disabled={refreshing}
              className="p-1.5 rounded-lg hover:bg-white/5 text-gray-600 hover:text-gray-300 transition-colors disabled:opacity-40">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => onDelete(wallet.address)}
              className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Label edit */}
        {editingLabel ? (
          <div className="flex items-center gap-2">
            <input autoFocus value={labelDraft} onChange={e => setLabelDraft(e.target.value)}
              onBlur={() => { onUpdateLabel(wallet.address, labelDraft); setEditingLabel(false); }}
              onKeyDown={e => { if (e.key === 'Enter') { onUpdateLabel(wallet.address, labelDraft); setEditingLabel(false); } }}
              className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500/50 font-mono" />
            <button onClick={() => setEditingLabel(false)} className="text-gray-600 hover:text-gray-400"><X className="w-3 h-3" /></button>
          </div>
        ) : (
          <button onClick={() => setEditingLabel(true)}
            className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors text-left">
            {wallet.label || '+ add label'}
          </button>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[9px] text-gray-600 tracking-wider">WIN RATE</div>
            <div className={`text-sm font-bold font-mono ${wrColor(wallet.win_rate)}`}>{fmtPct(wallet.win_rate)}</div>
          </div>
          <div>
            <div className="text-[9px] text-gray-600 tracking-wider">OPEN PnL</div>
            <div className={`text-sm font-bold font-mono ${pnlColor(wallet.total_pnl)}`}>{fmtUsd(wallet.total_pnl)}</div>
          </div>
          <div>
            <div className="text-[9px] text-gray-600 tracking-wider">PORTFOLIO</div>
            <div className="text-sm font-bold font-mono text-white">
              {wallet.portfolio_value != null ? `$${wallet.portfolio_value.toFixed(2)}` : '—'}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-gray-600 tracking-wider">OPEN POS</div>
            <div className="text-sm font-bold font-mono text-white">{wallet.open_positions ?? '—'}</div>
          </div>
        </div>

        {/* AI summary */}
        {wallet.ai_summary && (
          <div className="text-[11px] text-gray-400 leading-relaxed border-l-2 border-purple-500/30 pl-2">
            {wallet.ai_summary}
          </div>
        )}

        {/* Category selector + expand toggle */}
        <div className="flex items-center justify-between">
          <select
            value={wallet.category}
            onChange={e => onUpdateCategory(wallet.address, e.target.value)}
            className={`text-[10px] font-mono border rounded px-2 py-0.5 bg-transparent focus:outline-none cursor-pointer ${catClass}`}>
            {CATEGORIES.map(c => <option key={c} value={c} className="bg-[#0d0d0d] text-white">{c}</option>)}
          </select>
          <button onClick={toggleExpand} className="flex items-center gap-1 text-[10px] text-gray-600 hover:text-gray-300 transition-colors">
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'collapse' : 'details'}
          </button>
        </div>
        {wallet.last_refreshed_at && (
          <div className="text-[9px] text-gray-700">
            refreshed {new Date(wallet.last_refreshed_at).toLocaleString()}
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-white/5">
          <div className="flex border-b border-white/5">
            {(['positions', 'trades'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2 text-[10px] font-mono tracking-wider transition-colors ${tab === t ? 'text-blue-400 bg-blue-500/5 border-b border-blue-500/30' : 'text-gray-600 hover:text-gray-400'}`}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          {detailLoading && (
            <div className="p-4 text-center text-[10px] text-gray-600">loading…</div>
          )}

          {detail && tab === 'positions' && (
            <div className="max-h-64 overflow-y-auto">
              {detail.positions.length === 0 ? (
                <div className="p-4 text-[10px] text-gray-600 text-center">No positions stored — hit refresh</div>
              ) : detail.positions.map((p, i) => {
                const won = p.winning_outcome && p.outcome && p.winning_outcome.toLowerCase() === p.outcome.toLowerCase();
                return (
                  <div key={p.condition_id + i} className="px-4 py-2.5 border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-gray-300 leading-snug truncate">{p.title}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[9px] font-mono font-bold ${p.outcome === 'Yes' ? 'text-green-400' : 'text-orange-400'}`}>{p.outcome}</span>
                          <span className="text-[9px] text-gray-600">@ {Math.round((p.avg_price ?? 0) * 100)}¢</span>
                          {p.closed && <span className={`text-[8px] px-1 rounded ${won ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{won ? 'WON' : 'LOST'}</span>}
                        </div>
                      </div>
                      <div className={`text-[11px] font-bold font-mono shrink-0 ${pnlColor(p.cash_pnl)}`}>
                        {fmtUsd(p.cash_pnl)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {detail && tab === 'trades' && (
            <div className="max-h-64 overflow-y-auto">
              {detail.trades.length === 0 ? (
                <div className="p-4 text-[10px] text-gray-600 text-center">No trades stored — hit refresh</div>
              ) : detail.trades.map((t, i) => (
                <div key={t.trade_id + i} className="px-4 py-2.5 border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-gray-300 truncate">{t.title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[9px] font-mono font-bold ${t.type === 'BUY' ? 'text-green-400' : t.type === 'SELL' ? 'text-orange-400' : 'text-gray-500'}`}>{t.type}</span>
                        <span className={`text-[9px] font-mono ${t.outcome === 'Yes' ? 'text-green-400' : 'text-orange-400'}`}>{t.outcome}</span>
                        <span className="text-[9px] text-gray-600">@ {Math.round((t.price ?? 0) * 100)}¢</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[11px] font-mono text-gray-300">{t.usdc_size != null ? `$${t.usdc_size.toFixed(2)}` : '—'}</div>
                      <div className="text-[9px] text-gray-600">{t.timestamp ? new Date(t.timestamp).toLocaleDateString() : '—'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PolyLakePage() {
  const [wallets, setWallets]               = useState<Wallet[]>([]);
  const [loading, setLoading]               = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Add wallet modal
  const [addOpen, setAddOpen]               = useState(false);
  const [addAddress, setAddAddress]         = useState('');
  const [addLabel, setAddLabel]             = useState('');
  const [addCategory, setAddCategory]       = useState('Uncategorized');
  const [addLoading, setAddLoading]         = useState(false);
  const [addError, setAddError]             = useState<string | null>(null);

  // Chat
  // Discover from market
  const [discoverUrl, setDiscoverUrl]       = useState('');
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverError, setDiscoverError]   = useState<string | null>(null);
  const [discoverResult, setDiscoverResult] = useState<{ event: { title: string; slug: string; markets: number }; wallets: any[] } | null>(null);

  const [chatMessages, setChatMessages]     = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput]           = useState('');
  const [chatLoading, setChatLoading]       = useState(false);
  const chatEndRef                          = useRef<HTMLDivElement>(null);

  const fetchWallets = useCallback(async () => {
    try {
      const r = await fetch('/api/polylake/wallets');
      const text = await r.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = null; }
      console.log('[PolyLake] fetchWallets', r.status, data);
      setWallets(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[PolyLake] fetchWallets error', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchWallets(); }, [fetchWallets]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  const handleAddWallet = async () => {
    if (!addAddress.trim()) return;
    setAddLoading(true); setAddError(null);
    try {
      const r = await fetch('/api/polylake/wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addAddress.trim(), label: addLabel || null, category: addCategory }),
      });

      let data: any = null;
      const text = await r.text();
      try { data = JSON.parse(text); } catch { data = { error: `Server returned non-JSON (${r.status}): ${text.slice(0, 200)}` }; }

      console.log('[PolyLake] add wallet response', r.status, data);

      if (!r.ok) {
        setAddError(data?.error || data?.message || `Error ${r.status}`);
        setAddLoading(false);
        return;
      }

      const address = data?.address || addAddress.trim();
      setAddOpen(false); setAddAddress(''); setAddLabel(''); setAddCategory('Uncategorized');
      await fetchWallets();

      // Auto-refresh in background — don't block modal close
      fetch('/api/polylake/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      }).then(() => fetchWallets()).catch(console.error);

    } catch (e: any) {
      console.error('[PolyLake] add wallet error', e);
      setAddError(e.message || 'Network error');
    }
    setAddLoading(false);
  };

  const handleRefresh = async (address: string) => {
    await fetch('/api/polylake/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    await fetchWallets();
  };

  const handleDelete = async (address: string) => {
    if (!confirm(`Remove ${truncAddr(address)} from PolyLake?`)) return;
    await fetch(`/api/polylake/wallets?address=${address}`, { method: 'DELETE' });
    setWallets(w => w.filter(x => x.address !== address));
  };

  const handleUpdateCategory = async (address: string, category: string) => {
    setWallets(w => w.map(x => x.address === address ? { ...x, category } : x));
    await fetch('/api/polylake/wallets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, category }),
    });
  };

  const handleUpdateLabel = async (address: string, label: string) => {
    setWallets(w => w.map(x => x.address === address ? { ...x, label: label || null } : x));
    await fetch('/api/polylake/wallets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, label: label || null }),
    });
  };

  const handleRefreshAll = async () => {
    for (const w of wallets) {
      await fetch('/api/polylake/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: w.address }),
      });
    }
    await fetchWallets();
  };

  const handleDiscover = async () => {
    if (!discoverUrl.trim()) return;
    setDiscoverLoading(true); setDiscoverError(null); setDiscoverResult(null);
    try {
      const r = await fetch(`/api/polylake/discover?url=${encodeURIComponent(discoverUrl.trim())}`);
      const data = await r.json();
      if (!r.ok) { setDiscoverError(data.error || 'Discovery failed'); }
      else setDiscoverResult(data);
    } catch (e: any) { setDiscoverError(e.message); }
    setDiscoverLoading(false);
  };

  const handleAddFromDiscover = async (wallet: any) => {
    await fetch('/api/polylake/wallets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: wallet.user, label: wallet.displayName || null, category: 'Uncategorized' }),
    });
    fetch('/api/polylake/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: wallet.user }),
    }).then(() => fetchWallets()).catch(() => {});
    await fetchWallets();
  };

  const sendChat = async (msg?: string) => {
    const text = msg ?? chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput('');
    setChatMessages(m => [...m, { role: 'user', text }]);
    setChatLoading(true);
    try {
      const r = await fetch('/api/polylake/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await r.json();
      setChatMessages(m => [...m, { role: 'ai', text: data.reply || data.error || 'No response.' }]);
    } catch (e: any) {
      setChatMessages(m => [...m, { role: 'ai', text: 'Error: ' + e.message }]);
    }
    setChatLoading(false);
  };

  const filtered = selectedCategory === 'All'
    ? wallets
    : wallets.filter(w => w.category === selectedCategory);

  // Stats
  const totalPnl = wallets.reduce((s, w) => s + (w.total_pnl ?? 0), 0);
  const avgWr = wallets.filter(w => w.win_rate != null).reduce((s, w) => s + (w.win_rate ?? 0), 0)
    / (wallets.filter(w => w.win_rate != null).length || 1);

  return (
    <div className="min-h-screen bg-[#04070c] text-ink font-mono">

      {/* Nav */}
      <div className="border-b border-white/5 px-6 py-3 flex items-center justify-between">
        <a href="/" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">← polyverse.capital</a>
        <span className="text-[10px] text-gray-600 tracking-widest">POLYLAKE · WALLET INTELLIGENCE</span>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              POLY<span className="text-blue-400">LAKE</span>
            </h1>
            <p className="text-gray-500 text-sm mt-1">Track, categorise, and analyse prediction market wallets</p>
          </div>
          <div className="flex items-center gap-2">
            {wallets.length > 0 && (
              <button onClick={handleRefreshAll}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-xs hover:bg-white/10 hover:text-white transition-colors">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh All
              </button>
            )}
            <button onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-400 text-xs hover:bg-blue-500/30 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Wallet
            </button>
          </div>
        </div>

        {/* Stats */}
        {wallets.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'WALLETS TRACKED', val: wallets.length.toString(), color: 'text-blue-400' },
              { label: 'AVG WIN RATE', val: fmtPct(avgWr), color: wrColor(avgWr) },
              { label: 'TOTAL OPEN PnL', val: fmtUsd(totalPnl), color: pnlColor(totalPnl) },
              { label: 'CATEGORIES', val: new Set(wallets.map(w => w.category)).size.toString(), color: 'text-purple-400' },
            ].map(s => (
              <div key={s.label} className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
                <div className="text-[9px] text-gray-600 tracking-wider mb-1">{s.label}</div>
                <div className={`text-xl font-bold ${s.color}`}>{s.val}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Discover from Market ── */}
        <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-3">
          <div className="text-[10px] text-blue-400 tracking-widest">DISCOVER WALLETS FROM MARKET</div>
          <div className="flex gap-2">
            <input
              value={discoverUrl}
              onChange={e => { setDiscoverUrl(e.target.value); setDiscoverResult(null); setDiscoverError(null); }}
              onKeyDown={e => { if (e.key === 'Enter') handleDiscover(); }}
              placeholder="https://polymarket.com/event/…"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder:text-gray-700 focus:outline-none focus:border-blue-500/50"
            />
            <button onClick={handleDiscover} disabled={!discoverUrl.trim() || discoverLoading}
              className="px-4 py-2 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-400 text-xs font-mono hover:bg-blue-500/30 transition-colors disabled:opacity-40 whitespace-nowrap">
              {discoverLoading ? 'scanning…' : 'Find Wallets'}
            </button>
          </div>

          {discoverError && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">⚠ {discoverError}</div>
          )}

          {discoverResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-gray-300 font-semibold">{discoverResult.event.title}</div>
                <div className="text-[10px] text-gray-600">{discoverResult.wallets.length} wallets found</div>
              </div>
              {discoverResult.wallets.length === 0 ? (
                <div className="text-[10px] text-gray-600">No position data available for this market yet.</div>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {discoverResult.wallets.map((w, i) => {
                    const alreadyTracked = wallets.some(t => t.address === w.user);
                    const name = w.displayName || (w.username ? `@${w.username}` : null) || truncAddr(w.user);
                    return (
                      <div key={w.user} className="flex items-center gap-3 bg-white/[0.02] border border-white/5 rounded-lg px-3 py-2 hover:bg-white/[0.04]">
                        <div className="text-[10px] text-gray-600 w-5 shrink-0">#{i + 1}</div>
                        {w.pfpUrl
                          ? <img src={w.pfpUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                          : <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/30 shrink-0 flex items-center justify-center text-[9px] text-blue-400">{name.slice(0, 2).toUpperCase()}</div>
                        }
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-white font-mono truncate">{name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {w.positions.map((p: any, j: number) => (
                              <span key={j} className={`text-[9px] font-mono ${p.outcome === 'Yes' ? 'text-green-400' : 'text-orange-400'}`}>
                                {p.outcome} @ {Math.round(p.avgPrice * 100)}¢
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[11px] font-mono text-white">${w.totalSize.toFixed(0)} <span className="text-gray-600 text-[9px]">shares</span></div>
                          <div className={`text-[10px] font-mono ${w.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {w.totalPnl >= 0 ? '+' : ''}${w.totalPnl.toFixed(2)}
                          </div>
                        </div>
                        <button
                          onClick={() => handleAddFromDiscover(w)}
                          disabled={alreadyTracked}
                          className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-mono border transition-colors ${
                            alreadyTracked
                              ? 'border-green-500/20 text-green-600 bg-green-500/5 cursor-default'
                              : 'border-blue-500/30 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20'
                          }`}>
                          {alreadyTracked ? '✓ tracked' : '+ add'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Category filter */}
        {wallets.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {['All', ...CATEGORIES.filter(c => wallets.some(w => w.category === c))].map(cat => (
              <button key={cat} onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-mono border transition-colors ${
                  selectedCategory === cat
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                    : 'bg-white/[0.02] border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20'
                }`}>
                {cat}
                {cat !== 'All' && <span className="ml-1.5 text-[9px] opacity-60">{wallets.filter(w => w.category === cat).length}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Wallet grid */}
        {loading ? (
          <div className="text-center py-16 text-gray-600 text-sm">loading wallets…</div>
        ) : wallets.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <div className="text-gray-600 text-sm">No wallets tracked yet.</div>
            <button onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-colors text-sm">
              <Plus className="w-4 h-4" /> Add your first wallet
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-600 text-sm">No wallets in this category.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(w => (
              <WalletCard
                key={w.address}
                wallet={w}
                onRefresh={handleRefresh}
                onDelete={handleDelete}
                onUpdateCategory={handleUpdateCategory}
                onUpdateLabel={handleUpdateLabel}
              />
            ))}
          </div>
        )}

        {/* ── PolyLake AI Chat ─────────────────────────────────────────── */}
        <div className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-white/5">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-[10px] text-purple-400 tracking-widest">POLYLAKE AI</span>
            <span className="text-[9px] text-gray-700 ml-1">· ask anything about your tracked wallets</span>
          </div>

          {/* Messages */}
          <div className="min-h-[180px] max-h-[400px] overflow-y-auto px-5 py-4 space-y-4">
            {chatMessages.length === 0 && (
              <div className="space-y-3">
                <div className="text-[10px] text-gray-700">Try asking:</div>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_PROMPTS.map(p => (
                    <button key={p} onClick={() => sendChat(p)}
                      className="px-3 py-1.5 rounded-lg bg-purple-500/5 border border-purple-500/20 text-gray-500 text-[10px] font-mono hover:bg-purple-500/10 hover:text-gray-300 transition-colors text-left">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-blue-500/20 border border-blue-500/30 text-blue-100'
                    : 'bg-white/[0.04] border border-white/10 text-gray-300'
                }`}>
                  {m.role === 'ai' && <span className="text-[9px] text-purple-400 block mb-1">PolyLake AI</span>}
                  {m.text}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-white/5 px-4 py-3 flex items-center gap-2">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
              placeholder="Ask about your wallets…"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-gray-700 focus:outline-none"
            />
            <button onClick={() => sendChat()} disabled={!chatInput.trim() || chatLoading}
              className="p-2 rounded-lg bg-purple-500/20 border border-purple-500/40 text-purple-400 hover:bg-purple-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="text-center pb-8">
          <a href="/" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-colors text-sm">
            ← Back to Polyverse
          </a>
        </div>
      </div>

      {/* Add wallet modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="bg-[#0d0d0d] border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Add Wallet to PolyLake</div>
              <button onClick={() => { setAddOpen(false); setAddError(null); }} className="text-gray-600 hover:text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-[10px] text-gray-600 mb-1.5 tracking-wider">WALLET ADDRESS OR POLYMARKET LINK *</div>
                <input
                  value={addAddress}
                  onChange={e => setAddAddress(parsePolymarketInput(e.target.value))}
                  placeholder="0x… or polymarket.com/@username"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder:text-gray-700 focus:outline-none focus:border-blue-500/50"
                />
                {addAddress && !addAddress.startsWith('0x') && !addAddress.startsWith('@') && (
                  <div className="text-[10px] text-yellow-500 mt-1">⚠ Paste the full URL, @username, or a 0x address</div>
                )}
                {addAddress.startsWith('@') && (
                  <div className="text-[10px] text-blue-400 mt-1">↗ will resolve username to wallet address</div>
                )}
              </div>
              <div>
                <div className="text-[10px] text-gray-600 mb-1.5 tracking-wider">LABEL (optional)</div>
                <input
                  value={addLabel} onChange={e => setAddLabel(e.target.value)}
                  placeholder="e.g. Big Crypto Whale"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-700 focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <div>
                <div className="text-[10px] text-gray-600 mb-1.5 tracking-wider">CATEGORY</div>
                <select value={addCategory} onChange={e => setAddCategory(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50">
                  {CATEGORIES.map(c => <option key={c} value={c} className="bg-[#0d0d0d]">{c}</option>)}
                </select>
              </div>
            </div>
            {addError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5 text-xs text-red-400 break-all">
                ⚠ {addError}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setAddOpen(false); setAddError(null); }}
                className="flex-1 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-sm hover:bg-white/10 transition-colors">
                Cancel
              </button>
              <button onClick={handleAddWallet} disabled={!addAddress.trim() || addLoading}
                className="flex-1 py-2 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-400 text-sm hover:bg-blue-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {addLoading ? 'Adding…' : 'Add & Refresh'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
