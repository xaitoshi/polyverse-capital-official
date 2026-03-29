import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import EarnPage from './components/EarnPage.tsx';
import './index.css';

const isEarn = window.location.pathname === '/earn';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isEarn ? <EarnPage /> : <App />}
  </StrictMode>,
);
