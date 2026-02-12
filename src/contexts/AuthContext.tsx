import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseAuthEnabled } from '../services/supabase';
import type { Session, User } from '@supabase/supabase-js';
import { trackOnboardingCompleted } from '../services/analytics';

const ONBOARDING_DONE_KEY = '@stax/onboarding_done';

type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  onboardingDone: boolean | null;
};

type AuthContextValue = AuthState & {
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  setOnboardingDone: (done: boolean) => Promise<void>;
  isAuthenticated: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingDone, setOnboardingDoneState] = useState<boolean | null>(null);

  const setOnboardingDone = useCallback(async (done: boolean) => {
    await AsyncStorage.setItem(ONBOARDING_DONE_KEY, done ? '1' : '0');
    setOnboardingDoneState(done);
    if (done) trackOnboardingCompleted();
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_DONE_KEY).then((v) => {
      setOnboardingDoneState(v === '1');
    });
  }, []);

  useEffect(() => {
    if (!supabase || !isSupabaseAuthEnabled()) {
      setLoading(false);
      setUser(null);
      setSession(null);
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (mounted) {
        setSession(s);
        setUser(s?.user ?? null);
        setLoading(false);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (mounted) {
        setSession(s);
        setUser(s?.user ?? null);
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error: Error | null }> => {
      if (!supabase) return { error: new Error('Auth not configured') };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error ?? null };
    },
    []
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<{ error: Error | null }> => {
      if (!supabase) return { error: new Error('Auth not configured') };
      const { error } = await supabase.auth.signUp({ email, password });
      return { error: error ?? null };
    },
    []
  );

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
  }, []);

  const isAuthenticated = !isSupabaseAuthEnabled() || Boolean(session?.user);

  const value: AuthContextValue = {
    user,
    session,
    loading,
    onboardingDone,
    signIn,
    signUp,
    signOut,
    setOnboardingDone,
    isAuthenticated,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
