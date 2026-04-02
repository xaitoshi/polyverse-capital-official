import React, { useState } from 'react';
import { useConnect, useAccount } from 'wagmi';
import { supabase } from '../lib/supabase';

type AuthView = 'hidden' | 'choice' | 'email' | 'forgot' | 'forgot-sent';
type EmailTab = 'login' | 'signup';

export default function AuthPage() {
  const [authView, setAuthView] = useState<AuthView>('hidden');
  const [emailTab, setEmailTab] = useState<EmailTab>('login');
  const [walletExpanded, setWalletExpanded] = useState(false);

  // Shared fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { connect, connectors, isPending: walletPending, error: walletError } = useConnect();
  const { isConnecting } = useAccount();

  const resetForm = () => {
    setEmail(''); setPassword(''); setConfirmPassword('');
    setError(null); setSuccessMsg(null);
  };

  const handleSignIn = async () => {
    if (!email.trim() || !password) return;
    setLoading(true); setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) { setError(err.message); setLoading(false); }
    else { window.location.href = '/dashboard'; }
  };

  const handleSignUp = async () => {
    if (!email.trim() || !password) return;
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true); setError(null);
    const { error: err } = await supabase.auth.signUp({ email: email.trim(), password });
    if (err) { setError(err.message); setLoading(false); }
    else { window.location.href = '/dashboard'; }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) return;
    setLoading(true); setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/dashboard`,
    });
    if (err) { setError(err.message); setLoading(false); }
    else { setAuthView('forgot-sent'); setLoading(false); }
  };

  const openAuth = () => { setAuthView('choice'); setWalletExpanded(false); resetForm(); };

  const passwordStrength = (pw: string) => {
    if (!pw) return null;
    if (pw.length < 6) return 'weak';
    if (pw.length < 10) return 'fair';
    return 'strong';
  };
  const strength = emailTab === 'signup' ? passwordStrength(password) : null;
  const strengthColor = strength === 'weak' ? 'bg-red-500' : strength === 'fair' ? 'bg-yellow-500' : 'bg-blue-400';
  const strengthWidth = strength === 'weak' ? 'w-1/3' : strength === 'fair' ? 'w-2/3' : 'w-full';

  return (
    <div className="min-h-screen bg-[#050505] text-white overflow-hidden relative flex flex-col">

      {/* ── Background image ──────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0">
        <img
          src="/auth-bg.png"
          alt=""
          className="absolute opacity-30"
          style={{ width: '60%', height: '60%', top: '20%', left: '20%', objectFit: 'contain' }}
        />
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(to right, #050505 35%, transparent 65%, #050505 100%)',
        }} />
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(to bottom, #050505 0%, transparent 15%, transparent 80%, #050505 100%)',
        }} />
      </div>

      {/* ── Navbar ────────────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-2.5">
          <GlobeIcon className="w-7 h-7 text-blue-400" />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { openAuth(); setEmailTab('login'); }}
            className="px-4 py-2 rounded-full border border-white/15 text-sm text-gray-300 hover:text-white hover:border-white/30 transition-colors font-mono"
          >
            Sign in
          </button>
          <button
            onClick={() => { openAuth(); setEmailTab('signup'); }}
            className="px-5 py-2 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 text-sm font-semibold hover:bg-blue-500/30 transition-colors"
          >
            Get started
          </button>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex items-center px-8 md:px-16 pb-16">
        <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

          {/* Left */}
          <div className="space-y-8">
            {/* Headline */}
            <div className="space-y-0">
              {/* Mobile layout */}
              <div className="md:hidden">
                <h1 className="text-5xl font-bold leading-tight tracking-tight flex items-center gap-3 flex-wrap">
                  <img src="/polymarket-logo.png" alt="Polymarket" className="h-12 w-auto inline-block" />
                  <span>tools for</span>
                </h1>
                <h1 className="text-5xl font-bold leading-tight tracking-tight italic font-light text-blue-400">
                  niche markets
                </h1>
              </div>
              {/* Desktop layout */}
              <div className="hidden md:block">
                <h1 className="text-6xl font-bold leading-tight tracking-tight">
                  Polymarket tools
                </h1>
                <h1 className="text-6xl font-bold leading-tight tracking-tight">
                  for <span className="italic font-light text-blue-400">niche markets</span>
                </h1>
              </div>
            </div>

            {/* Sub */}
            <p className="text-gray-500 text-sm leading-relaxed max-w-sm">
              Track wallets, analyse trader behaviour, and find edges across Polymarket's niche events. All in one place.
            </p>

            {/* Auth area */}
            {authView === 'hidden' && (
              <button
                onClick={openAuth}
                className="inline-flex items-center gap-3 px-6 py-3.5 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-400 font-semibold text-sm hover:bg-blue-500/30 transition-colors"
              >
                <span className="w-5 h-5 rounded-full bg-black/20 flex items-center justify-center">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </span>
                Start for free
              </button>
            )}

            {authView === 'choice' && (
              <div className="space-y-3 max-w-xs">
                {/* Wallet */}
                <button
                  onClick={() => setWalletExpanded(v => !v)}
                  className="w-full flex items-center px-5 py-3.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm font-mono hover:bg-blue-500/20 transition-colors"
                >
                  <WalletIcon2 className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-center">Connect Wallet</span>
                  <svg className={`w-3.5 h-3.5 shrink-0 transition-transform ${walletExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {walletExpanded && (
                  <div className="space-y-1.5 pl-2">
                    {connectors.length === 0
                      ? <p className="text-xs text-gray-600 px-2">No wallet detected</p>
                      : connectors.map(c => (
                        <button key={c.uid} onClick={() => connect({ connector: c })}
                          disabled={walletPending || isConnecting}
                          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-gray-300 text-xs font-mono hover:bg-blue-500/10 hover:border-blue-500/20 hover:text-blue-400 transition-colors disabled:opacity-50">
                          <WalletIcon2 className="w-3.5 h-3.5 shrink-0" />
                          {walletPending || isConnecting ? 'Connecting…' : c.name === 'Injected' ? 'MetaMask / Browser Wallet' : c.name}
                        </button>
                      ))
                    }
                    {walletError && <p className="text-xs text-red-400 px-2">{walletError.message}</p>}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-white/5" />
                  <span className="text-[10px] text-gray-700 tracking-widest">OR</span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>

                {/* Email */}
                <button
                  onClick={() => { setAuthView('email'); resetForm(); }}
                  className="w-full flex items-center px-5 py-3.5 rounded-full bg-white/[0.04] border border-white/10 text-gray-300 text-sm font-mono hover:bg-white/[0.08] transition-colors"
                >
                  <EmailIcon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-center">Continue with Email</span>
                </button>
              </div>
            )}

            {authView === 'email' && (
              <div className="space-y-3 max-w-xs">
                <button onClick={() => { setAuthView('choice'); resetForm(); }} className="text-[11px] text-gray-600 hover:text-gray-400 flex items-center gap-1">
                  ← Back
                </button>

                {/* Tabs */}
                <div className="flex rounded-xl bg-white/[0.04] border border-white/8 p-1 gap-1">
                  {(['login', 'signup'] as EmailTab[]).map(tab => (
                    <button
                      key={tab}
                      onClick={() => { setEmailTab(tab); resetForm(); }}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                        emailTab === tab
                          ? 'bg-blue-500/20 border border-blue-500/30 text-blue-400'
                          : 'text-gray-600 hover:text-gray-400'
                      }`}
                    >
                      {tab === 'login' ? 'Log In' : 'Sign Up'}
                    </button>
                  ))}
                </div>

                {/* Fields */}
                <input
                  autoFocus
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-700 font-mono focus:outline-none focus:border-blue-500/50"
                />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && emailTab === 'login') handleSignIn(); }}
                  placeholder="Password"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-700 font-mono focus:outline-none focus:border-blue-500/50"
                />

                {/* Password strength bar (signup only) */}
                {emailTab === 'signup' && password && (
                  <div className="space-y-1">
                    <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${strengthColor} ${strengthWidth}`} />
                    </div>
                    <p className="text-[10px] text-gray-600 capitalize">{strength} password</p>
                  </div>
                )}

                {emailTab === 'signup' && (
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSignUp(); }}
                    placeholder="Confirm password"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-700 font-mono focus:outline-none focus:border-blue-500/50"
                  />
                )}

                {error && <p className="text-xs text-red-400">{error}</p>}

                <button
                  onClick={emailTab === 'login' ? handleSignIn : handleSignUp}
                  disabled={!email.trim() || !password || loading}
                  className="w-full py-3 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 font-semibold text-sm hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                >
                  {loading ? (emailTab === 'login' ? 'Signing in…' : 'Creating account…') : (emailTab === 'login' ? 'Sign In' : 'Create Account')}
                </button>

                {emailTab === 'login' && (
                  <button
                    onClick={() => { setAuthView('forgot'); setPassword(''); setError(null); }}
                    className="w-full text-center text-[11px] text-gray-600 hover:text-gray-400 transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
            )}

            {authView === 'forgot' && (
              <div className="space-y-3 max-w-xs">
                <button onClick={() => { setAuthView('email'); setEmailTab('login'); resetForm(); }} className="text-[11px] text-gray-600 hover:text-gray-400 flex items-center gap-1">
                  ← Back
                </button>
                <p className="text-xs text-gray-500 leading-relaxed">Enter your email and we'll send a reset link.</p>
                <input
                  autoFocus
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleForgotPassword(); }}
                  placeholder="you@example.com"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-700 font-mono focus:outline-none focus:border-blue-500/50"
                />
                {error && <p className="text-xs text-red-400">{error}</p>}
                <button
                  onClick={handleForgotPassword}
                  disabled={!email.trim() || loading}
                  className="w-full py-3 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 font-semibold text-sm hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </div>
            )}

            {authView === 'forgot-sent' && (
              <div className="space-y-2 max-w-xs">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                    <EmailIcon className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">Check your inbox</div>
                    <div className="text-xs text-gray-500">Reset link sent to {email}</div>
                  </div>
                </div>
                <button onClick={() => { setAuthView('email'); setEmailTab('login'); resetForm(); }} className="text-xs text-gray-600 hover:text-gray-400">
                  Back to sign in
                </button>
              </div>
            )}
          </div>

          {/* Right — decorative cards */}
          <div className="hidden lg:flex flex-col gap-4 items-end">
            {/* Card 1 - market tracker */}
            <div className="w-72 bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500 tracking-wider font-mono">TOP WALLET</span>
                <span className="text-[10px] font-mono text-blue-400">0x4f2a…8e1c</span>
              </div>
              <div>
                <div className="text-2xl font-bold">$84,230</div>
                <div className="text-sm text-gray-500">portfolio value</div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400 font-mono">Win rate</span>
                <span className="text-blue-400 font-bold font-mono">+68%</span>
              </div>
              <div className="h-px bg-white/5" />
              <div className="space-y-1.5">
                {[
                  { label: 'YES · Will BTC hit $120k?', val: '+$2,140' },
                  { label: 'NO · Fed rate cut in June?', val: '+$890' },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-500 truncate max-w-[160px]">{r.label}</span>
                    <span className="text-[11px] text-blue-400 font-mono shrink-0">{r.val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 2 - market discovery */}
            <div className="w-64 bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-2xl p-4 space-y-2">
              <div className="text-[10px] text-gray-500 tracking-wider font-mono">MARKET DISCOVERY</div>
              <div className="text-sm text-white font-semibold leading-snug">Will BYND beat Q1 earnings?</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full w-[38%] rounded-full bg-blue-500" />
                </div>
                <span className="text-[11px] text-gray-400 font-mono">38¢ YES</span>
              </div>
              <div className="text-[10px] text-gray-600">3 tracked wallets positioned</div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 pb-6 text-center">
        <p className="text-[10px] text-gray-700">By continuing, you agree to our Terms of Service</p>
      </div>
    </div>
  );
}

function GlobeIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="12" cy="12" r="9.5" />
      <ellipse cx="12" cy="12" rx="3.8" ry="9.5" />
      <line x1="2.5" y1="9" x2="21.5" y2="9" />
      <line x1="2.5" y1="15" x2="21.5" y2="15" />
    </svg>
  );
}

function WalletIcon2({ className = 'w-4 h-4' }: { className?: string }) {
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
