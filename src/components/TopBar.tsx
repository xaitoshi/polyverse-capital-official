import React, { useState, useRef, useEffect } from 'react';
import { ExternalLink, Search, Globe2, Droplets, Layers, TrendingUp, Menu, X, Gamepad2, Bot, Fish, Gift, Cloud, MessageSquare } from 'lucide-react';
import { MarketData } from '../data/mockData';

interface SearchResult {
  question: string;
  yesPrice: number;
  volume: string;
  polymarketUrl?: string;
  market: MarketData;
}

interface TopBarProps {
  onOpenEcosystem: () => void;
  onOpenPolyEarn: () => void;
  onOpenOsint: () => void;
  onOpenLiquidity: () => void;
  isOsintOpen: boolean;
  marketData: MarketData[];
  onSelectMarket: (market: MarketData) => void;
}

export default function TopBar({ onOpenEcosystem, onOpenPolyEarn, onOpenOsint, onOpenLiquidity, isOsintOpen, marketData, onSelectMarket }: TopBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => { if (mobileSearchOpen) mobileSearchRef.current?.focus(); }, [mobileSearchOpen]);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) { setResults([]); setIsOpen(false); return; }
    const lower = value.toLowerCase();
    const matched: SearchResult[] = [];
    for (const loc of marketData) {
      for (const m of loc.markets) {
        if (m.question.toLowerCase().includes(lower) || loc.title.toLowerCase().includes(lower))
          matched.push({ question: m.question, yesPrice: m.yesPrice, volume: m.volume, polymarketUrl: m.polymarketUrl, market: loc });
      }
    }
    setResults(matched.slice(0, 10));
    setIsOpen(matched.length > 0);
  };

  const closeAll = () => { setMobileMenuOpen(false); setMobileSearchOpen(false); setIsOpen(false); setQuery(''); setResults([]); };

  const NAV_ITEMS = [
    { label: 'LIQUIDITY', icon: <Droplets   className="w-3.5 h-3.5" />, action: () => { closeAll(); window.location.href = '/liquidity'; } },
    { label: 'MENTIONS',  icon: <MessageSquare className="w-3.5 h-3.5" />, href: '/mentions' },
    { label: 'ECOSYSTEM', icon: <Layers     className="w-3.5 h-3.5" />, action: () => { onOpenEcosystem(); closeAll(); } },
    { label: 'POLYEARN',  icon: <TrendingUp className="w-3.5 h-3.5" />, action: () => { onOpenPolyEarn(); closeAll(); } },
    { label: 'ODDIE',     icon: <Bot        className="w-3.5 h-3.5" />, href: 'https://t.me/oddiepmbot', external: true },
    { label: 'ESPORTS',   icon: <Gamepad2   className="w-3.5 h-3.5" />, href: '/esports' },
    { label: 'POLYLAKE',  icon: <Fish       className="w-3.5 h-3.5" />, href: '/polylake' },
    { label: 'REWARDS',   icon: <Gift       className="w-3.5 h-3.5" />, href: '/rewards' },
    { label: 'WEATHER',   icon: <Cloud      className="w-3.5 h-3.5" />, href: '/weather' },
  ] as const;

  const SearchDropdown = () => isOpen && results.length > 0 ? (
    <div className="absolute top-full mt-1 right-0 w-[92vw] sm:w-96 max-h-72 overflow-y-auto ascii-panel rounded-sm z-50">
      {results.map((r, i) => (
        <button key={i} onClick={() => { onSelectMarket(r.market); closeAll(); }}
          className="w-full text-left px-4 py-3 hover:bg-blue-500/5 border-b border-blue-500/10 last:border-b-0 transition-colors">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-ink leading-snug truncate">{r.question}</div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] phosphor">YES {Math.round(r.yesPrice * 100)}¢</span>
                <span className="text-[10px] text-ink-dim">{r.volume}</span>
                <span className="text-[9px] text-ink-dim/60">{r.market.title}</span>
              </div>
            </div>
            {r.polymarketUrl && (
              <ExternalLink className="w-3 h-3 text-ink-dim/50 hover:text-blue-400 shrink-0 mt-0.5"
                onClick={(e) => { e.stopPropagation(); window.open(r.polymarketUrl, '_blank', 'noopener,noreferrer'); }} />
            )}
          </div>
        </button>
      ))}
    </div>
  ) : null;

  const NavBtn = ({ item }: { item: { label: string; icon: React.ReactNode; action?: () => void; active?: boolean; href?: string; external?: boolean } }) => {
    const cls = `flex items-center gap-2 py-2.5 px-4 text-[10px] uppercase tracking-[0.2em] font-mono transition-all border rounded-sm
      ${item.active ? 'bg-blue-500/10 border-blue-400/50 text-blue-400' : 'ascii-panel text-ink-dim hover:bg-blue-500/5 hover:border-blue-400/30 hover:text-ink'}`;
    if (item.href) return (
      <a href={item.href} target={item.external ? '_blank' : undefined} rel={item.external ? 'noopener noreferrer' : undefined}
        onClick={closeAll} className={cls}>{item.icon}{item.label}</a>
    );
    return <button onClick={item.action} className={cls}>{item.icon}{item.label}</button>;
  };

  return (
    <div className="absolute top-0 left-0 right-0 z-10 p-3 md:p-4">

      {/* ── Desktop (lg+) ─────────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col gap-2 pointer-events-auto">
        <div className="flex items-center justify-between">

          {/* Logo */}
          <div className="ascii-panel crt-scanlines flex items-center gap-2.5 px-4 py-2.5 rounded-sm">
            <Globe2 className="w-4 h-4 text-blue-400" />
            <span className="phosphor text-sm tracking-[0.3em] uppercase font-bold">[ POLYVERSE CAPITAL ]</span>
            <span className="blink text-blue-400 text-sm">_</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative" ref={wrapperRef}>
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-blue-400/50 z-10" />
              <input type="text" placeholder="search markets_" value={query}
                onChange={(e) => handleSearch(e.target.value)}
                className="ascii-panel rounded-sm pl-9 pr-4 py-2 text-[11px] text-ink w-56 bg-transparent
                           focus:outline-none focus:border-blue-400/50 placeholder:text-ink-dim/40 transition-colors" />
              <SearchDropdown />
            </div>

            <button className="ascii-panel rounded-sm px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-ink-dim hover:text-blue-400 hover:border-blue-400/40 transition-colors">
              $PLVS <span className="text-amber ml-1">SOON</span>
            </button>

            <button onClick={() => setDesktopMenuOpen(v => !v)}
              className={`ascii-panel rounded-sm p-2.5 transition-all ${desktopMenuOpen ? 'bg-blue-500/10 border-blue-400/50 text-blue-400' : 'text-ink-dim hover:text-blue-400 hover:border-blue-400/40'}`}>
              {desktopMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {desktopMenuOpen && (
          <div className="grid grid-cols-3 gap-1.5 ascii-panel rounded-sm p-3 w-fit self-end">
            {NAV_ITEMS.map(item => <NavBtn key={item.label} item={item} />)}
          </div>
        )}
      </div>

      {/* ── Mobile (< lg) ─────────────────────────────────────────────────── */}
      <div className="flex lg:hidden flex-col gap-2 pointer-events-auto">
        <div className="flex items-center justify-between">
          <div className="ascii-panel crt-scanlines flex items-center gap-1.5 px-2.5 py-2 rounded-sm">
            <Globe2 className="w-3 h-3 text-blue-400" />
            <span className="phosphor text-[10px] tracking-[0.25em] uppercase font-bold">POLYVERSE</span>
            <span className="blink text-blue-400 text-xs">_</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button className="ascii-panel rounded-sm px-2.5 py-1.5 text-[9px] uppercase tracking-[0.15em] text-ink-dim">
              $PLVS <span className="text-amber ml-1">SOON</span>
            </button>
            <button onClick={() => { setMobileSearchOpen(v => !v); setMobileMenuOpen(false); }}
              className={`ascii-panel rounded-sm p-2 transition-all ${mobileSearchOpen ? 'bg-blue-500/10 border-blue-400/50 text-blue-400' : 'text-ink-dim hover:text-blue-400'}`}>
              <Search className="w-4 h-4" />
            </button>
            <button onClick={() => { setMobileMenuOpen(v => !v); setMobileSearchOpen(false); }}
              className={`ascii-panel rounded-sm p-2 transition-all ${mobileMenuOpen ? 'bg-blue-500/10 border-blue-400/50 text-blue-400' : 'text-ink-dim hover:text-blue-400'}`}>
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {mobileSearchOpen && (
          <div className="relative" ref={wrapperRef}>
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-blue-400/50 z-10" />
            <input ref={mobileSearchRef} type="text" placeholder="search markets_" value={query}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full ascii-panel rounded-sm pl-9 pr-4 py-2.5 text-[11px] text-ink bg-transparent
                         focus:outline-none focus:border-blue-400/50 placeholder:text-ink-dim/40" />
            <SearchDropdown />
          </div>
        )}

        {mobileMenuOpen && (
          <div className="grid grid-cols-2 gap-1.5 ascii-panel rounded-sm p-3">
            {NAV_ITEMS.map(item => <NavBtn key={item.label} item={item} />)}
          </div>
        )}
      </div>

    </div>
  );
}
