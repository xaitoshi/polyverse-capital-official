import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import dns from 'dns';
import net from 'net';
import path from 'path';
import {defineConfig, loadEnv, Plugin} from 'vite';

// Middleware plugin: proxies any URL server-side to avoid CORS
function fetchProxyPlugin(): Plugin {
  return {
    name: 'fetch-proxy',
    configureServer(server) {
      server.middlewares.use('/api/fetch-url', async (req, res) => {
        const qs = req.url?.split('?')[1] ?? '';
        const url = new URLSearchParams(qs).get('url');
        if (!url) { res.statusCode = 400; res.end('missing url param'); return; }
        try {
          const upstream = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          const contentType = upstream.headers.get('content-type') ?? 'application/json';
          const text = await upstream.text();
          res.setHeader('Content-Type', contentType);
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(text);
        } catch (e) {
          res.statusCode = 500;
          res.end(String(e));
        }
      });
    },
  };
}

// Force Node.js to use IPv4 — fixes ETIMEDOUT with Cloudflare-hosted APIs on Node 20+
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), fetchProxyPlugin()],
    define: {
      global: 'globalThis',
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.FINNHUB_API_KEY': JSON.stringify(env.FINNHUB_API_KEY || ''),
      'process.env.NEWSDATA_API_KEY': JSON.stringify(env.NEWSDATA_API_KEY || ''),
      'process.env.DFLOW_API_KEY': JSON.stringify(env.DFLOW_API_KEY || ''),
      'process.env.COMMONSTACK_API_KEY': JSON.stringify(env.COMMONSTACK_API_KEY || ''),
      'process.env.MASSIVE_API_KEY': JSON.stringify(env.MASSIVE_API_KEY || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api/poly-web': {
          target: 'https://polymarket.com',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api\/poly-web/, ''),
        },
        '/api/polymarket': {
          target: 'https://gamma-api.polymarket.com',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api\/polymarket/, ''),
        },
        '/api/kalshi': {
          target: 'https://dev-prediction-markets-api.dflow.net',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api\/kalshi/, ''),
        },
        '/api/dflow-trade': {
          target: 'https://dev-quote-api.dflow.net',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api\/dflow-trade/, ''),
        },
        '/api/poly-data': {
          target: 'https://data-api.polymarket.com',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api\/poly-data/, ''),
        },
        '/api/clob': {
          target: 'https://clob.polymarket.com',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api\/clob/, ''),
        },
        '/api/massive': {
          target: 'https://api.massive.com',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api\/massive/, ''),
        },
      },
    },
  };
});
