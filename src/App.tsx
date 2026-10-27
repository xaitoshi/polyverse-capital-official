/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import GoldfishCanvas from './components/GoldfishCanvas';
import TopBar from './components/TopBar';
import BottomOverlay from './components/BottomOverlay';
import MarketPanel from './components/MarketPanel';
import EcosystemModal from './components/EcosystemModal';
import AdminModal from './components/AdminModal';
import OsintPanel, { OsintAlert } from './components/OsintPanel';
import TradeModal, { TradeMarket } from './components/TradeModal';
import PolyEarnPage from './components/PolyEarnPage';
import ResearchSection from './components/ResearchSection';
import LiquidityDashboard from './components/LiquidityDashboard';
import { MarketData } from './data/mockData';
import { fetchPolymarkets } from './services/polymarketService';
import { fetchKalshiMarkets } from './services/kalshiService';

const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

export default function App() {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  const [selectedMarket, setSelectedMarket] = useState<MarketData | null>(null);
  const [isEcosystemOpen, setIsEcosystemOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [ecosystemKey, setEcosystemKey] = useState(0);
  const [marketData, setMarketData] = useState<MarketData[]>([]);
  const [isOsintOpen, setIsOsintOpen] = useState(false);
  const [osintAlerts, setOsintAlerts] = useState<OsintAlert[]>([]);
  const [tradeMarket, setTradeMarket] = useState<TradeMarket | null>(null);
  const [isPolyEarnOpen, setIsPolyEarnOpen] = useState(false);
  const [isLiquidityOpen, setIsLiquidityOpen] = useState(false);

  const handleOpenOsint = () => {
    setIsOsintOpen(true);
    setSelectedMarket(null);
  };

  const handleSelectMarket = (market: MarketData) => {
    setSelectedMarket(market);
    setIsOsintOpen(false);
  };

  const handleRefreshMarkets = useCallback(async () => {
    const [poly, kalshi] = await Promise.all([fetchPolymarkets(true), fetchKalshiMarkets(true)]);
    const merged = [...poly, ...kalshi];
    setMarketData(merged);
    return merged;
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [poly, kalshi] = await Promise.all([fetchPolymarkets(), fetchKalshiMarkets()]);
      if (mounted) setMarketData([...poly, ...kalshi]);
    };
    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const handleTrade = useCallback((m: TradeMarket) => {
    setTradeMarket(m);
    setSelectedMarket(null);
  }, []);

  return (
    <ConnectionProvider endpoint={SOLANA_RPC}>
      <WalletProvider wallets={wallets} autoConnect>
        <div className="bg-[#04070c] font-mono text-ink crt-flicker">

          {/* Hero — interactive blue goldfish */}
          <div className="relative w-full h-screen overflow-hidden bg-[#111214]">
            <GoldfishCanvas contained />

            <div className="absolute inset-0 z-[1] flex items-center justify-center pointer-events-none select-none px-6">
              <p className="max-w-[14rem] sm:max-w-none text-center font-mono font-bold uppercase tracking-[0.14em] sm:tracking-[0.22em] text-blue-400/85 text-xs sm:text-sm leading-snug">
                Home of Prediction Markets Research
              </p>
            </div>

            <div data-goldfish-ui className="contents">
            <TopBar
              onOpenEcosystem={() => setIsEcosystemOpen(true)}
              onOpenPolyEarn={() => setIsPolyEarnOpen(true)}
              onOpenOsint={handleOpenOsint}
              onOpenLiquidity={() => setIsLiquidityOpen(true)}
              isOsintOpen={isOsintOpen}
              marketData={marketData}
              onSelectMarket={handleSelectMarket}
            />

            {selectedMarket && (
              <MarketPanel
                market={selectedMarket}
                onClose={() => setSelectedMarket(null)}
                onTrade={handleTrade}
              />
            )}

            {tradeMarket && (
              <TradeModal market={tradeMarket} onClose={() => setTradeMarket(null)} />
            )}

            {isOsintOpen && (
              <OsintPanel
                marketData={marketData}
                onClose={() => setIsOsintOpen(false)}
                onAlerts={setOsintAlerts}
                onRefreshMarkets={handleRefreshMarkets}
              />
            )}

            {isEcosystemOpen && (
              <EcosystemModal
                key={ecosystemKey}
                onClose={() => setIsEcosystemOpen(false)}
                onOpenAdmin={() => setIsAdminOpen(true)}
              />
            )}

            {isPolyEarnOpen && (
              <PolyEarnPage onClose={() => setIsPolyEarnOpen(false)} />
            )}

            {isLiquidityOpen && (
              <LiquidityDashboard onClose={() => setIsLiquidityOpen(false)} />
            )}

            {isAdminOpen && (
              <AdminModal onClose={() => { setIsAdminOpen(false); setEcosystemKey(k => k + 1); }} />
            )}

            <BottomOverlay />
            </div>

            {/* Scroll hint */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none animate-bounce">
              <span className="text-[10px] font-mono text-blue-400/40 tracking-widest">SCROLL</span>
              <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
                <path d="M1 1L6 6L11 1" stroke="rgba(94,241,255,0.3)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
          </div>

          {/* Research section */}
          <ResearchSection />
        </div>
      </WalletProvider>
    </ConnectionProvider>
  );
}
