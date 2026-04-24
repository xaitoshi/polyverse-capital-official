import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import EarnPage from './components/EarnPage.tsx';
import EsportsPage from './components/EsportsPage.tsx';
import LiquidityDashboard from './components/LiquidityDashboard.tsx';
import PolyLakePage from './components/PolyLakePage.tsx';
import RewardsPage from './components/RewardsPage.tsx';
import AuthPage from './components/AuthPage.tsx';
import WeatherversePage from './components/weatherverse/WeatherversePage.tsx';
import { AuthProvider, useAuth } from './contexts/AuthContext.tsx';
import { wagmiConfig } from './lib/wagmi.ts';
import './index.css';

const queryClient = new QueryClient();
const path = window.location.pathname;

function Router() {
  const { user, loading } = useAuth();

  // Public routes — no auth required
  if (path === '/esports') return <EsportsPage />;
  if (path === '/weather') return <WeatherversePage />;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <AuthPage />;

  if (path === '/earn') return <EarnPage />;
  if (path === '/liquidity') return <LiquidityDashboard onClose={() => { window.location.href = '/'; }} />;
  if (path === '/polylake') return <PolyLakePage />;
  if (path === '/dashboard') return <App />;
  if (path === '/rewards') return <RewardsPage />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Router />
        </AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
