import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import EarnPage from './components/EarnPage';
import './index.css';

const pathname = window.location.pathname;
const Component = (pathname === '/earn' || pathname.startsWith('/earn/')) ? EarnPage : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Component />
  </StrictMode>,
);
