import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useTenant, type TeamUser } from "./tenant-context";

type AuthCtx = {
  user: TeamUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => { ok: boolean; reason?: string };
  signOut: () => void;
  changePassword: (newPassword: string) => void;
};

const Ctx = createContext<AuthCtx | null>(null);
const SESSION_KEY = "thermofit_session_v1";

export function AuthProvider({ children }: { children: ReactNode }) {
  const { tenant, updateUser } = useTenant();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) setUserId(JSON.parse(raw));
    } catch {}
    setLoading(false);
  }, []);

  const user = userId ? tenant.team.find((u) => u.id === userId) ?? null : null;

  const value: AuthCtx = {
    user,
    loading,
    signIn: (email, password) => {
      const found = tenant.team.find(
        (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
      );
      if (!found || found.password !== password) {
        return { ok: false, reason: "E-mail ou senha incorretos." };
      }
      if (found.status === "inativo" || found.status === "bloqueado") {
        return { ok: false, reason: "Usuário sem permissão de acesso. Contate o administrador." };
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify(found.id));
      setUserId(found.id);
      updateUser(found.id, { lastAccess: new Date().toLocaleString("pt-BR") });
      return { ok: true };
    },
    signOut: () => {
      localStorage.removeItem(SESSION_KEY);
      setUserId(null);
    },
    changePassword: (newPassword) => {
      if (!user) return;
      updateUser(user.id, { password: newPassword, mustChangePassword: false });
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
