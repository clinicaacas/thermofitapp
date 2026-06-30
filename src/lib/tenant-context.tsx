import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  adminCreateUser,
  adminRemoveMembership,
  adminRemoveUser,
  adminResetUserPassword,
  adminSetMembership,
  adminUpdateUser,
  getTenantSnapshot,
  updateTenantSettings,
} from "@/lib/thermofit-auth.functions";

export type PlanId = "essencial" | "profissional" | "premium" | "enterprise" | "interno";
export type ProfileRole = "super_admin" | "dono" | "admin" | "equipe" | "cliente";
export type TenantStatus = "ativa" | "suspensa" | "cancelada";
export type UserStatus = "ativo" | "inativo" | "bloqueado" | "convite_pendente";

export type Plan = {
  id: PlanId;
  name: string;
  description: string;
  userLimit: number;
  clientLimit: number;
  features: string[];
  active: boolean;
};

export type TenantRole = "dono" | "admin" | "equipe";

export type Membership = {
  tenantId: string;
  tenantName: string;
  role: TenantRole;
  status: "ativo" | "inativo";
};

export type ManagedTenant = {
  id: string;
  clinicName: string;
  status: string;
  accountType: string | null;
};

export type TeamUser = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  profile: ProfileRole;
  status: UserStatus;
  mustChangePassword: boolean;
  tenantId: string;
  lastAccess?: string;
  kind?: "team" | "client";
  clientId?: string;
  memberships?: Membership[];
};

export type Tenant = {
  id: string;
  clinicName: string;
  systemName: string;
  systemSubtitle: string;
  publicAppUrl: string;
  ownerName: string;
  contactEmail: string;
  contactPhone: string;
  city: string;
  state: string;
  status: TenantStatus;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  defaultTheme: "light" | "dark";
  whiteLabelEnabled: boolean;
  brandName: string;
  brandShortName: string;
  brandLogoUrl?: string;
  brandPrimary: string;
  brandSecondary: string;
  footerText: string;
  subdomain: string;
  customDomain: string;
  planId: PlanId;
  renewalDate: string;
  createdAt: string;
  team: TeamUser[];
};

export const DEFAULT_PLANS: Plan[] = [
  { id: "interno", name: "Interno / Master", description: "Conta proprietária do SaaS. Acesso total e ilimitado.", userLimit: -1, clientLimit: -1, features: ["Usuários ilimitados", "Clientes ilimitados", "Acesso total ao sistema", "Sem restrições de plano"], active: true },
  { id: "essencial", name: "Essencial", description: "Para clínicas iniciando a operação digital.", userLimit: 2, clientLimit: 50, features: ["Até 2 usuários", "Até 50 clientes ativos", "Personalização básica de logo e cor", "Acesso aos módulos principais"], active: true },
  { id: "profissional", name: "Profissional", description: "Para clínicas em crescimento.", userLimit: 5, clientLimit: 200, features: ["Até 5 usuários", "Até 200 clientes ativos", "Personalização completa de marca", "Permissões por usuário", "Relatórios básicos"], active: true },
  { id: "premium", name: "Premium", description: "White Label completo para a sua marca.", userLimit: 15, clientLimit: 500, features: ["Até 15 usuários", "Até 500 clientes ativos", "White Label completo", "Permissões avançadas", "Relatórios completos", "Domínio personalizado (em breve)", "Suporte prioritário"], active: true },
  { id: "enterprise", name: "Enterprise", description: "Sob consulta. Recursos sob demanda.", userLimit: -1, clientLimit: -1, features: ["Usuários personalizados", "Clientes ativos personalizados", "White Label completo", "Domínio personalizado", "Permissões avançadas", "Recursos sob demanda"], active: true },
];

const DEFAULT_TENANT: Tenant = {
  id: "acas",
  clinicName: "Clínica Acas",
  systemName: "ThermoFit Acas",
  systemSubtitle: "Plano de Voo da Transformação",
  publicAppUrl: "https://thermofitapp.lovable.app",
  ownerName: "Dra. Cynara Acas",
  contactEmail: "contato@clinicaacas.com.br",
  contactPhone: "",
  city: "São Luís",
  state: "Maranhão",
  status: "ativa",
  primaryColor: "#5b6cff",
  secondaryColor: "#f1f2f6",
  accentColor: "#7c83ff",
  defaultTheme: "light",
  whiteLabelEnabled: false,
  brandName: "ThermoFit",
  brandShortName: "Clínica Acas",
  brandPrimary: "#5b6cff",
  brandSecondary: "#f1f2f6",
  footerText: "© Clínica Acas",
  subdomain: "clinicaacas.thermofit.app",
  customDomain: "",
  planId: "interno",
  renewalDate: "",
  createdAt: new Date().toISOString(),
  team: [],
};

function normalizeTenant(raw?: Partial<Tenant>): Tenant {
  const next: Tenant = { ...DEFAULT_TENANT, ...(raw ?? {}) };
  next.publicAppUrl = (next.publicAppUrl || DEFAULT_TENANT.publicAppUrl).replace(/\/$/, "");
  next.team = (next.team ?? []).map((user) => {
    const email = user.email.toLowerCase();
    if (email === "studioacass@gmail.com") {
      return {
        ...user,
        name: user.name || "Dra. Cynara Acas",
        role: "Super Admin",
        profile: "super_admin",
        status: "ativo",
        tenantId: next.id,
      };
    }
    return { ...user, tenantId: user.tenantId || next.id };
  });
  next.planId = "interno";
  next.status = "ativa";
  return next;
}

type Ctx = {
  tenant: Tenant;
  tenantLoading: boolean;
  tenantError: string | null;
  allTenants: ManagedTenant[];
  callerIsSuperAdmin: boolean;
  teamCount: number;
  plans: Plan[];
  currentPlan: Plan;
  updateTenant: (patch: Partial<Tenant>) => void;
  updatePlan: (id: PlanId, patch: Partial<Plan>) => void;
  refreshTenant: () => Promise<void>;
  addUser: (u: Omit<TeamUser, "id" | "tenantId" | "lastAccess">, memberships?: { tenantId: string; role: TenantRole; status?: "ativo" | "inativo" }[]) => Promise<{ ok: boolean; reason?: string; user?: TeamUser; temporaryPassword?: string; existed?: boolean }>;
  updateUser: (id: string, patch: Partial<TeamUser>) => Promise<void>;
  resetUserPassword: (id: string) => Promise<{ ok: boolean; reason?: string; user?: TeamUser; temporaryPassword?: string }>;
  removeUser: (id: string) => Promise<void>;
  setMembership: (userId: string, tenantId: string, role: TenantRole, status?: "ativo" | "inativo") => Promise<{ ok: boolean; reason?: string }>;
  removeMembership: (userId: string, tenantId: string) => Promise<{ ok: boolean; reason?: string }>;
};

const TenantCtx = createContext<Ctx | null>(null);
const PLANS_STORAGE = "thermofit_plans_v2";

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Tenant>(DEFAULT_TENANT);
  const [tenantLoading, setTenantLoading] = useState(true);
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [allTenants, setAllTenants] = useState<ManagedTenant[]>([]);
  const [callerIsSuperAdmin, setCallerIsSuperAdmin] = useState(false);
  const [teamCount, setTeamCount] = useState(0);
  const [plans, setPlans] = useState<Plan[]>(DEFAULT_PLANS);
  const getSnapshot = useServerFn(getTenantSnapshot);
  const saveTenant = useServerFn(updateTenantSettings);
  const createUser = useServerFn(adminCreateUser);
  const saveUser = useServerFn(adminUpdateUser);
  const resetPassword = useServerFn(adminResetUserPassword);
  const deleteUser = useServerFn(adminRemoveUser);
  const setMembershipFn = useServerFn(adminSetMembership);
  const removeMembershipFn = useServerFn(adminRemoveMembership);

  const refreshTenant = useCallback(async () => {
    setTenantLoading(true);
    setTenantError(null);
    try {
      const r = await getSnapshot();
      setTenant(normalizeTenant(r.tenant as Partial<Tenant>));
      setAllTenants(((r as any).allTenants ?? []) as ManagedTenant[]);
      setCallerIsSuperAdmin(!!(r as any).callerIsSuperAdmin);
      setTeamCount(Number((r as any).teamCount ?? 0));
    } catch (err) {
      console.error("Erro ao buscar dados do tenant", err);
      setTenantError("Não foi possível carregar os dados administrativos.");
    } finally {
      setTenantLoading(false);
    }
  }, [getSnapshot]);

  useEffect(() => {
    try {
      const rawP = localStorage.getItem(PLANS_STORAGE);
      if (rawP) setPlans(JSON.parse(rawP));
    } catch {}
    void refreshTenant();
  }, [refreshTenant]);

  useEffect(() => {
    localStorage.setItem(PLANS_STORAGE, JSON.stringify(plans));
  }, [plans]);

  const currentPlan = useMemo(
    () => plans.find((p) => p.id === tenant.planId) ?? plans[0],
    [plans, tenant.planId],
  );

  const value: Ctx = {
    tenant,
    tenantLoading,
    tenantError,
    allTenants,
    callerIsSuperAdmin,
    teamCount,
    plans,
    currentPlan,
    refreshTenant,
    updateTenant: (patch) => {
      setTenant((t) => normalizeTenant({ ...t, ...patch }));
      void saveTenant({ data: patch }).then((r) => setTenant((t) => normalizeTenant({ ...t, ...r.tenant }))).catch(() => {});
    },
    updatePlan: (id, patch) =>
      setPlans((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p))),
    addUser: async (u, memberships) => {
      const limit = currentPlan?.userLimit ?? 0;
      const unlimited = u.profile === "super_admin" || tenant.planId === "interno" || limit === -1;
      if (!unlimited && tenant.team.length >= limit) {
        return { ok: false, reason: `Seu plano atual permite até ${limit} usuários. Para adicionar mais pessoas, atualize seu plano.` };
      }
      try {
        const result = await createUser({ data: { ...u, memberships: memberships ?? [] } as any });
        await refreshTenant();
        return { ok: true, user: result.user, temporaryPassword: result.temporaryPassword, existed: result.existed };
      } catch (err) {
        console.error("Erro ao criar usuário", err);
        return { ok: false, reason: err instanceof Error ? err.message : "Não foi possível salvar o usuário." };
      }
    },
    updateUser: async (id, patch) => {
      await saveUser({ data: { userId: id, patch } });
      await refreshTenant();
    },
    resetUserPassword: async (id) => {
      try {
        const result = await resetPassword({ data: { userId: id } });
        await refreshTenant();
        return { ok: true, user: result.user, temporaryPassword: result.temporaryPassword };
      } catch (err) {
        console.error("Erro ao redefinir senha", err);
        return { ok: false, reason: err instanceof Error ? err.message : "Não foi possível redefinir a senha." };
      }
    },
    removeUser: async (id) => {
      await deleteUser({ data: { userId: id } });
      await refreshTenant();
    },
    setMembership: async (userId, tenantId, role, status = "ativo") => {
      try {
        await setMembershipFn({ data: { userId, tenantId, role, status } });
        await refreshTenant();
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: err instanceof Error ? err.message : "Falha ao salvar vínculo." };
      }
    },
    removeMembership: async (userId, tenantId) => {
      try {
        await removeMembershipFn({ data: { userId, tenantId } });
        await refreshTenant();
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: err instanceof Error ? err.message : "Falha ao remover vínculo." };
      }
    },
  };

  return <TenantCtx.Provider value={value}>{children}</TenantCtx.Provider>;
}

export function useTenant() {
  const c = useContext(TenantCtx);
  if (!c) throw new Error("useTenant must be used within TenantProvider");
  return c;
}
