import React, { useState, useRef, useEffect } from 'react';
import { Search, Globe2, Droplets, Activity, Layers, TrendingUp, ExternalLink, Menu, X } from 'lucide-react';
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
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (mobileSearchOpen) mobileSearchRef.current?.focus();
  }, [mobileSearchOpen]);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) { setResults([]); setIsOpen(false); return; }
    const lower = value.toLowerCase();
    const matched: SearchResult[] = [];
    for (const loc of marketData) {
      for (const m of loc.markets) {
        if (m.question.toLowerCase().includes(lower) || loc.title.toLowerCase().includes(lower)) {
          matched.push({ question: m.question, yesPrice: m.yesPrice, volume: m.volume, polymarketUrl: m.polymarketUrl, market: loc });
        }
      }
    }
    setResults(matched.slice(0, 10));
    setIsOpen(matched.length > 0);
  };

  const closeAll = () => {
    setMobileMenuOpen(false);
    setMobileSearchOpen(false);
    setIsOpen(false);
    setQuery('');
    setResults([]);
  };

  const SearchDropdown = () => isOpen && results.length > 0 ? (
    <div className="absolute top-full mt-2 right-0 w-[92vw] sm:w-96 max-h-72 overflow-y-auto bg-black/95 border border-blue-500/30 rounded-lg backdrop-blur-xl shadow-2xl z-50">
      {results.map((r, i) => (
        <button key={i} onClick={() => { onSelectMarket(r.market); closeAll(); }}
          className="w-full text-left px-4 py-3 hover:bg-blue-500/10 border-b border-blue-500/10 last:border-b-0 transition-colors">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-200 leading-snug truncate">{r.question}</div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs font-mono text-blue-400">YES {Math.round(r.yesPrice * 100)}¢</span>
                <span className="text-xs font-mono text-gray-500">{r.volume}</span>
                <span className="text-[10px] font-mono text-gray-600">{r.market.title}</span>
              </div>
            </div>
            {r.polymarketUrl && (
              <ExternalLink className="w-3.5 h-3.5 text-gray-600 hover:text-blue-400 shrink-0 mt-0.5"
                onClick={(e) => { e.stopPropagation(); window.open(r.polymarketUrl, '_blank', 'noopener,noreferrer'); }} />
            )}
          </div>
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className="absolute top-0 left-0 right-0 z-10 p-3 md:p-4">

      {/* ── Desktop layout (lg+) ─────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col gap-2 pointer-events-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-black/60 border border-blue-500/30 backdrop-blur-md px-4 py-2 rounded-lg text-blue-400 font-mono font-bold text-xl tracking-wider">
              <Globe2 className="w-6 h-6" />
              POLYVERSE CAPITAL
            </div>
            <button onClick={() => setDesktopMenuOpen(v => !v)}
              className={`p-2 backdrop-blur-md rounded-lg border transition-colors ${desktopMenuOpen ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-black/60 border-blue-500/30 text-blue-400 hover:bg-blue-500/10'}`}>
              {desktopMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => {}}
              className="bg-black/60 border border-blue-500/30 backdrop-blur-md px-4 py-2 rounded-lg text-blue-400 font-mono text-sm flex items-center gap-2 cursor-pointer hover:border-blue-500/60 hover:bg-blue-500/10 transition-colors">
              $PLVS <span className="text-xs bg-blue-500/20 px-1.5 py-0.5 rounded">COMING SOON</span>
            </button>
            <div className="relative" ref={wrapperRef}>
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-blue-500/50 z-10" />
              <input type="text" placeholder="Search markets..." value={query}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={() => { if (results.length > 0) setIsOpen(true); }}
                className="bg-black/60 border border-blue-500/30 backdrop-blur-md rounded-lg pl-10 pr-4 py-2 text-sm text-blue-50 focus:outline-none focus:border-blue-500 w-64 placeholder:text-blue-500/30 transition-colors" />
              <SearchDropdown />
            </div>
          </div>
        </div>

        {/* Desktop nav grid */}
        {desktopMenuOpen && (
          <div className="grid grid-cols-4 gap-2 bg-black/80 border border-blue-500/20 backdrop-blur-md rounded-xl p-3 w-fit">
            <button onClick={() => { setDesktopMenuOpen(false); window.location.href = '/liquidity'; }}
              className="flex items-center justify-center gap-2 py-3 px-6 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-lg text-sm font-mono hover:bg-blue-500/20 transition-colors">
              <Droplets className="w-4 h-4" /> Liquidity
            </button>
            <button onClick={() => { onOpenOsint(); setDesktopMenuOpen(false); }}
              className={`flex items-center justify-center gap-2 py-3 px-6 border rounded-lg text-sm font-mono transition-colors ${isOsintOpen ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-white/5 border-blue-500/20 text-gray-300 hover:bg-blue-500/10 hover:text-blue-400'}`}>
              <Activity className="w-4 h-4" /> Poly AI
            </button>
            <button onClick={() => { onOpenEcosystem(); setDesktopMenuOpen(false); }}
              className="flex items-center justify-center gap-2 py-3 px-6 bg-white/5 border border-blue-500/20 text-gray-300 rounded-lg text-sm font-mono hover:bg-blue-500/10 hover:text-blue-400 transition-colors">
              <Layers className="w-4 h-4" /> Ecosystem
            </button>
            <button onClick={() => { onOpenPolyEarn(); setDesktopMenuOpen(false); }}
              className="flex items-center justify-center gap-2 py-3 px-6 bg-white/5 border border-blue-500/20 text-gray-300 rounded-lg text-sm font-mono hover:bg-blue-500/10 hover:text-blue-400 transition-colors">
              <TrendingUp className="w-4 h-4" /> PolyEarn
            </button>
          </div>
        )}
      </div>

      {/* ── Mobile layout (< lg) ─────────────────────────────────────────── */}
      <div className="flex lg:hidden flex-col gap-2 pointer-events-auto">
        {/* Top row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-black/70 border border-blue-500/30 backdrop-blur-md px-2 py-1.5 rounded-lg text-blue-400 font-mono font-bold text-xs tracking-wider">
            <Globe2 className="w-3 h-3" />
            POLYVERSE CAPITAL
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => {}}
              className="bg-black/70 border border-blue-500/30 backdrop-blur-md px-2.5 py-1.5 rounded-lg text-blue-400 font-mono text-xs flex items-center gap-1.5 hover:bg-blue-500/10 transition-colors">
              $PLVS <span className="text-[9px] bg-blue-500/20 px-1 py-0.5 rounded">COMING SOON</span>
            </button>
            <button onClick={() => { setMobileSearchOpen(v => !v); setMobileMenuOpen(false); }}
              className={`p-2 backdrop-blur-md rounded-lg border transition-colors ${mobileSearchOpen ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-black/70 border-blue-500/30 text-blue-400 hover:bg-blue-500/10'}`}>
              <Search className="w-4 h-4" />
            </button>
            <button onClick={() => { setMobileMenuOpen(v => !v); setMobileSearchOpen(false); }}
              className={`p-2 backdrop-blur-md rounded-lg border transition-colors ${mobileMenuOpen ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-black/70 border-blue-500/30 text-blue-400 hover:bg-blue-500/10'}`}>
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile search */}
        {mobileSearchOpen && (
          <div className="relative" ref={wrapperRef}>
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-blue-500/50 z-10" />
            <input ref={mobileSearchRef} type="text" placeholder="Search markets..."
              value={query} onChange={(e) => handleSearch(e.target.value)}
              className="w-full bg-black/80 border border-blue-500/30 backdrop-blur-md rounded-lg pl-9 pr-4 py-2.5 text-sm text-blue-50 focus:outline-none focus:border-blue-500 placeholder:text-blue-500/30 transition-colors" />
            <SearchDropdown />
          </div>
        )}

        {/* Mobile nav grid */}
        {mobileMenuOpen && (
          <div className="grid grid-cols-2 gap-2 bg-black/80 border border-blue-500/20 backdrop-blur-md rounded-xl p-3">
            <button onClick={() => { closeAll(); window.location.href = '/liquidity'; }}
              className="flex items-center justify-center gap-2 py-3 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-lg text-sm font-mono hover:bg-blue-500/20 transition-colors">
              <Droplets className="w-4 h-4" /> Liquidity
            </button>
            <button onClick={() => { onOpenOsint(); closeAll(); }}
              className={`flex items-center justify-center gap-2 py-3 border rounded-lg text-sm font-mono transition-colors ${isOsintOpen ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-white/5 border-blue-500/20 text-gray-300 hover:bg-blue-500/10 hover:text-blue-400'}`}>
              <Activity className="w-4 h-4" /> Poly AI
            </button>
            <button onClick={() => { onOpenEcosystem(); closeAll(); }}
              className="flex items-center justify-center gap-2 py-3 bg-white/5 border border-blue-500/20 text-gray-300 rounded-lg text-sm font-mono hover:bg-blue-500/10 hover:text-blue-400 transition-colors">
              <Layers className="w-4 h-4" /> Ecosystem
            </button>
            <button onClick={() => { onOpenPolyEarn(); closeAll(); }}
              className="flex items-center justify-center gap-2 py-3 bg-white/5 border border-blue-500/20 text-gray-300 rounded-lg text-sm font-mono hover:bg-blue-500/10 hover:text-blue-400 transition-colors">
              <TrendingUp className="w-4 h-4" /> PolyEarn
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
