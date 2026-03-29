import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import EarnPage from './components/EarnPage.tsx';
import EsportsPage from './components/EsportsPage.tsx';
import LiquidityDashboard from './components/LiquidityDashboard.tsx';
import './index.css';

const path = window.location.pathname;

function Root() {
  if (path === '/earn') return <EarnPage />;
  if (path === '/liquidity') return <LiquidityDashboard onClose={() => { window.location.href = '/'; }} />;
  if (path === '/esports') return <EsportsPage />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
