"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { UserContext } from "@transwave/contracts";
import { api, supabase } from "./api";

type AuthValue = { session: Session | null; user: UserContext | null; loading: boolean; error: string; signIn(email: string, password: string): Promise<void>; signOut(): Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<UserContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) setSession(data.session); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session) { setUser(null); setLoading(false); return; }
    setLoading(true); setError("");
    api.me(session).then(setUser).catch(reason => { setError(reason instanceof Error ? reason.message : "Unable to load account"); setUser(null); }).finally(() => setLoading(false));
  }, [session]);

  const value = useMemo<AuthValue>(() => ({ session, user, loading, error,
    async signIn(email, password) { setLoading(true); setError(""); const result = await supabase.auth.signInWithPassword({ email, password }); if (result.error) { setLoading(false); throw result.error; } },
    async signOut() { await supabase.auth.signOut(); setUser(null); }
  }), [session, user, loading, error]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be inside AuthProvider");
  return value;
}
