import React, { useState } from 'react';
import { useConnect, useAccount } from 'wagmi';
import { supabase } from '../lib/supabase';

export default function AuthPage() {
  const [view, setView] = useState<'choice' | 'email' | 'email-sent'>('choice');
  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const { connect, connectors, isPending: walletPending, error: walletError } = useConnect();
  const { isConnecting } = useAccount();

  const handleEmailSubmit = async () => {
    if (!email.trim()) return;
    setEmailLoading(true);
    setEmailError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) {
      setEmailError(error.message);
      setEmailLoading(false);
    } else {
      setView('email-sent');
      setEmailLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="mb-10 text-center">
        <div className="text-3xl font-bold tracking-tight text-white mb-1">
          POLY<span className="text-blue-400">VERSE</span>
        </div>
        <div className="text-[11px] text-gray-600 tracking-widest">PREDICTION MARKET INTELLIGENCE</div>
      </div>

      <div className="w-full max-w-sm">
        {view === 'choice' && (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <h1 className="text-lg font-semibold text-white">Get Started</h1>
              <p className="text-sm text-gray-500 mt-1">Choose how you'd like to sign in</p>
            </div>

            {/* Wallet connect */}
            <div className="space-y-2">
              {connectors.map(connector => (
                <button
                  key={connector.uid}
                  onClick={() => connect({ connector })}
                  disabled={walletPending || isConnecting}
                  className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 font-mono text-sm hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                >
                  <WalletIcon />
                  {walletPending || isConnecting
                    ? 'Connecting…'
                    : connector.name === 'Injected'
                    ? 'Connect Wallet (MetaMask / Browser)'
                    : `Connect with ${connector.name}`}
                </button>
              ))}
              {connectors.length === 0 && (
                <div className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl bg-white/5 border border-white/10 text-gray-500 font-mono text-sm">
                  <WalletIcon />
                  No wallet detected
                </div>
              )}
              {walletError && (
                <p className="text-xs text-red-400 text-center">{walletError.message}</p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/5" />
              <span className="text-[10px] text-gray-700 tracking-widest">OR</span>
              <div className="flex-1 h-px bg-white/5" />
            </div>

            {/* Email */}
            <button
              onClick={() => setView('email')}
              className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl bg-white/[0.03] border border-white/10 text-gray-300 font-mono text-sm hover:bg-white/[0.06] transition-colors"
            >
              <EmailIcon />
              Continue with Email
            </button>

            <p className="text-[10px] text-gray-700 text-center mt-4">
              By continuing, you agree to our Terms of Service
            </p>
          </div>
        )}

        {view === 'email' && (
          <div className="space-y-4">
            <button
              onClick={() => { setView('choice'); setEmailError(null); }}
              className="text-[11px] text-gray-600 hover:text-gray-400 flex items-center gap-1 mb-2"
            >
              ← Back
            </button>
            <div className="text-center mb-4">
              <h1 className="text-lg font-semibold text-white">Sign in with Email</h1>
              <p className="text-sm text-gray-500 mt-1">We'll send you a magic link</p>
            </div>
            <input
              autoFocus
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleEmailSubmit(); }}
              placeholder="you@example.com"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-700 font-mono focus:outline-none focus:border-blue-500/50"
            />
            {emailError && (
              <p className="text-xs text-red-400">{emailError}</p>
            )}
            <button
              onClick={handleEmailSubmit}
              disabled={!email.trim() || emailLoading}
              className="w-full py-3.5 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-400 font-mono text-sm hover:bg-blue-500/30 transition-colors disabled:opacity-50"
            >
              {emailLoading ? 'Sending…' : 'Send Magic Link'}
            </button>
          </div>
        )}

        {view === 'email-sent' && (
          <div className="text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto">
              <EmailIcon className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Check your inbox</h1>
              <p className="text-sm text-gray-500 mt-1">
                Magic link sent to <span className="text-white">{email}</span>
              </p>
            </div>
            <button
              onClick={() => { setView('email'); setEmail(''); }}
              className="text-xs text-gray-600 hover:text-gray-400"
            >
              Use a different email
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function WalletIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18-3a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V9a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9" />
    </svg>
  );
}

function EmailIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}
