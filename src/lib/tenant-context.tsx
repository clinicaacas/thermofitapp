import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type PlanId = "essencial" | "profissional" | "premium" | "enterprise" | "interno";
export type ProfileRole = "super_admin" | "dono" | "admin" | "equipe";
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

export type TeamUser = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  profile: ProfileRole;
  status: UserStatus;
  password: string;
  mustChangePassword: boolean;
  tenantId: string;
  lastAccess?: string;
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
    if (email === "robsongesso26@gmail.com") {
      return {
        ...user,
        name: user.name || "Robson",
        role: user.role || "Equipe",
        profile: "equipe",
        status: "ativo",
        tenantId: next.id,
      };
    }
    return { ...user, tenantId: user.tenantId || next.id };
  });
  if (next.team.some((user) => user.email.toLowerCase() === "studioacass@gmail.com")) {
    next.planId = "interno";
    next.status = "ativa";
  }
  return next;
}

type Ctx = {
  tenant: Tenant;
  plans: Plan[];
  currentPlan: Plan;
  updateTenant: (patch: Partial<Tenant>) => void;
  updatePlan: (id: PlanId, patch: Partial<Plan>) => void;
  addUser: (u: Omit<TeamUser, "id" | "tenantId">) => { ok: boolean; reason?: string; user?: TeamUser };
  updateUser: (id: string, patch: Partial<TeamUser>) => void;
  removeUser: (id: string) => void;
};

const TenantCtx = createContext<Ctx | null>(null);
const STORAGE = "thermofit_tenant_v3";
const PLANS_STORAGE = "thermofit_plans_v2";

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Tenant>(DEFAULT_TENANT);
  const [plans, setPlans] = useState<Plan[]>(DEFAULT_PLANS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) setTenant(normalizeTenant(JSON.parse(raw)));
      const rawP = localStorage.getItem(PLANS_STORAGE);
      if (rawP) setPlans(JSON.parse(rawP));
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE, JSON.stringify(tenant));
  }, [tenant]);

  useEffect(() => {
    localStorage.setItem(PLANS_STORAGE, JSON.stringify(plans));
  }, [plans]);

  const currentPlan = useMemo(
    () => plans.find((p) => p.id === tenant.planId) ?? plans[0],
    [plans, tenant.planId],
  );

  const value: Ctx = {
    tenant,
    plans,
    currentPlan,
    updateTenant: (patch) => setTenant((t) => ({ ...t, ...patch })),
    updatePlan: (id, patch) =>
      setPlans((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p))),
    addUser: (u) => {
      const limit = currentPlan?.userLimit ?? 0;
      // Super Admin SaaS and Interno/Master plan have no limits
      const unlimited = u.profile === "super_admin" || tenant.planId === "interno" || limit === -1;
      if (!unlimited && tenant.team.length >= limit) {
        return { ok: false, reason: `Seu plano atual permite até ${limit} usuários. Para adicionar mais pessoas, atualize seu plano.` };
      }
      const newUser: TeamUser = { ...u, id: crypto.randomUUID(), tenantId: tenant.id };
      setTenant((t) => ({ ...t, team: [...t.team, newUser] }));
      return { ok: true, user: newUser };
    },
    updateUser: (id, patch) =>
      setTenant((t) => ({ ...t, team: t.team.map((u) => (u.id === id ? { ...u, ...patch } : u)) })),
    removeUser: (id) =>
      setTenant((t) => ({ ...t, team: t.team.filter((u) => u.id !== id) })),
  };

  return <TenantCtx.Provider value={value}>{children}</TenantCtx.Provider>;
}

export function useTenant() {
  const c = useContext(TenantCtx);
  if (!c) throw new Error("useTenant must be used within TenantProvider");
  return c;
}
