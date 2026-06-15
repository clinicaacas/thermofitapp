import { createContext, useContext, useEffect, useCallback, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserProfile, markPasswordChanged } from "@/lib/thermofit-auth.functions";
import { useTenant, type TeamUser } from "./tenant-context";

type AuthCtx = {
  user: TeamUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; reason?: string }>;
  signOut: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<{ ok: boolean; reason?: string }>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { refreshTenant } = useTenant();
  const fetchProfile = useServerFn(getCurrentUserProfile);
  const savePasswordChanged = useServerFn(markPasswordChanged);
  const [user, setUser] = useState<TeamUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    const profile = await fetchProfile();
    if (!profile.ok) return profile;
    setUser(profile.user);
    void refreshTenant();
    return { ok: true as const };
  }, [fetchProfile, refreshTenant]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setLoading(false);
        return;
      }
      loadProfile().finally(() => setLoading(false));
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) setUser(null);
      if (event === "SIGNED_IN" || event === "USER_UPDATED") void loadProfile();
    });
    return () => data.subscription.unsubscribe();
  }, [loadProfile]);

  const value: AuthCtx = {
    user,
    loading,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) {
        return { ok: false, reason: "E-mail ou senha incorretos." };
      }
      const profile = await loadProfile();
      if (!profile.ok) {
        await supabase.auth.signOut();
        return { ok: false, reason: profile.reason };
      }
      return { ok: true };
    },
    signOut: async () => {
      await supabase.auth.signOut();
      setUser(null);
    },
    changePassword: async (newPassword) => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return { ok: false, reason: "Não foi possível atualizar a senha." };
      await savePasswordChanged();
      setUser((current) => current ? { ...current, mustChangePassword: false } : current);
      return { ok: true };
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}

export function generateTempPassword(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}
