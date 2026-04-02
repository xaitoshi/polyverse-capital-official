import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const truncAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const label = user.type === 'wallet' && user.address
    ? truncAddr(user.address)
    : user.email ?? 'Account';

  const tier = user.profile?.subscription_tier ?? 'free';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-gray-400 text-xs font-mono hover:bg-white/[0.06] hover:text-white transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
        {label}
        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${
          tier === 'pro'
            ? 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10'
            : 'text-gray-600 border-white/10 bg-white/5'
        }`}>
          {tier.toUpperCase()}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-44 bg-[#0d0d0d] border border-white/10 rounded-xl overflow-hidden shadow-xl">
            <div className="px-4 py-3 border-b border-white/5">
              <div className="text-[10px] text-gray-600 tracking-wider">SIGNED IN AS</div>
              <div className="text-xs text-white font-mono truncate mt-0.5">{label}</div>
            </div>
            <button
              onClick={() => { signOut(); setOpen(false); }}
              className="w-full px-4 py-3 text-left text-xs text-red-400 hover:bg-red-500/10 transition-colors font-mono"
            >
              Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
