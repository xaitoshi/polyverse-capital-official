import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { useAccount, useDisconnect, useSignMessage } from 'wagmi';
import { supabase, type Profile } from '../lib/supabase';

interface AuthUser {
  type: 'email' | 'wallet';
  email?: string;
  address?: string;
  profile: Profile | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const { address: walletAddress, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  // ── Fetch or create profile ──────────────────────────────────────────────
  const fetchOrCreateProfile = useCallback(async (opts: {
    supabaseUserId?: string;
    walletAddress?: string;
    email?: string;
  }) => {
    try {
      const { supabaseUserId, walletAddress: wa, email } = opts;

      // Try to find existing profile
      let query = supabase.from('profiles').select('*');
      if (supabaseUserId) {
        query = query.eq('supabase_user_id', supabaseUserId);
      } else if (wa) {
        query = query.eq('wallet_address', wa.toLowerCase());
      }

      const { data: existing } = await query.single();

      if (existing) {
        // Update last_active
        await supabase.from('profiles').update({ last_active: new Date().toISOString() })
          .eq('id', existing.id);
        setProfile(existing as Profile);
        return existing as Profile;
      }

      // Create new profile
      const { data: created, error } = await supabase.from('profiles').insert({
        supabase_user_id: supabaseUserId ?? null,
        wallet_address: wa ? wa.toLowerCase() : null,
        email: email ?? null,
      }).select().single();

      if (!error && created) {
        setProfile(created as Profile);
        return created as Profile;
      }
    } catch (e) {
      console.error('[Auth] fetchOrCreateProfile error', e);
    }
    return null;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (supabaseUser) {
      await fetchOrCreateProfile({ supabaseUserId: supabaseUser.id, email: supabaseUser.email ?? undefined });
    } else if (walletAddress && isConnected) {
      await fetchOrCreateProfile({ walletAddress });
    }
  }, [supabaseUser, walletAddress, isConnected, fetchOrCreateProfile]);

  // ── Supabase session listener ────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setSupabaseUser(s?.user ?? null);
      if (s?.user) {
        fetchOrCreateProfile({ supabaseUserId: s.user.id, email: s.user.email ?? undefined });
      } else if (!isConnected) {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setSupabaseUser(s?.user ?? null);
      if (s?.user) {
        fetchOrCreateProfile({ supabaseUserId: s.user.id, email: s.user.email ?? undefined })
          .then(() => setLoading(false));
      } else {
        if (!isConnected) setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Wallet connection listener ────────────────────────────────────────────
  useEffect(() => {
    if (isConnected && walletAddress && !supabaseUser) {
      fetchOrCreateProfile({ walletAddress }).then(() => setLoading(false));
    } else if (!isConnected && !supabaseUser) {
      setProfile(null);
      setLoading(false);
    }
  }, [isConnected, walletAddress, supabaseUser, fetchOrCreateProfile]);

  // ── Sign out ─────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    disconnect();
    setProfile(null);
    setSession(null);
    setSupabaseUser(null);
  }, [disconnect]);

  // ── Derive user object ────────────────────────────────────────────────────
  const user: AuthUser | null = (() => {
    if (supabaseUser) {
      return { type: 'email', email: supabaseUser.email, profile };
    }
    if (isConnected && walletAddress) {
      return { type: 'wallet', address: walletAddress, profile };
    }
    return null;
  })();

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
