import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type PlanId = "essencial" | "profissional" | "premium" | "enterprise" | "interno";
export type ProfileRole = "super_admin" | "dono" | "admin" | "equipe";
export type TenantStatus = "ativa" | "suspensa" | "cancelada";

export type Plan = {
  id: PlanId;
  name: string;
  description: string;
  userLimit: number; // -1 = ilimitado/custom
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
  status: "ativo" | "inativo";
  lastAccess?: string;
};

export type Tenant = {
  id: string;
  clinicName: string;
  systemName: string;
  systemSubtitle: string;
  ownerName: string;
  contactEmail: string;
  contactPhone: string;
  city: string;
  state: string;
  status: TenantStatus;
  // appearance
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  defaultTheme: "light" | "dark";
  // white label
  whiteLabelEnabled: boolean;
  brandName: string;
  brandShortName: string;
  brandLogoUrl?: string;
  brandPrimary: string;
  brandSecondary: string;
  footerText: string;
  subdomain: string;
  customDomain: string;
  // plan
  planId: PlanId;
  renewalDate: string;
  createdAt: string;
  team: TeamUser[];
};

export const DEFAULT_PLANS: Plan[] = [
  {
    id: "essencial",
    name: "Essencial",
    description: "Para clínicas iniciando a operação digital.",
    userLimit: 2,
    clientLimit: 50,
    features: [
      "Até 2 usuários",
      "Até 50 clientes ativos",
      "Personalização básica de logo e cor",
      "Acesso aos módulos principais",
    ],
    active: true,
  },
  {
    id: "profissional",
    name: "Profissional",
    description: "Para clínicas em crescimento.",
    userLimit: 5,
    clientLimit: 200,
    features: [
      "Até 5 usuários",
      "Até 200 clientes ativos",
      "Personalização completa de marca",
      "Permissões por usuário",
      "Relatórios básicos",
    ],
    active: true,
  },
  {
    id: "premium",
    name: "Premium",
    description: "White Label completo para a sua marca.",
    userLimit: 15,
    clientLimit: 500,
    features: [
      "Até 15 usuários",
      "Até 500 clientes ativos",
      "White Label completo",
      "Permissões avançadas",
      "Relatórios completos",
      "Domínio personalizado (em breve)",
      "Suporte prioritário",
    ],
    active: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Sob consulta. Recursos sob demanda.",
    userLimit: -1,
    clientLimit: -1,
    features: [
      "Usuários personalizados",
      "Clientes ativos personalizados",
      "White Label completo",
      "Domínio personalizado",
      "Permissões avançadas",
      "Recursos sob demanda",
    ],
    active: true,
  },
];

const DEFAULT_TENANT: Tenant = {
  id: "acas",
  clinicName: "Clínica Acas",
  systemName: "ThermoFit",
  systemSubtitle: "Clínica Acas",
  ownerName: "Dra. Cynara Acas",
  contactEmail: "contato@clinicaacas.com.br",
  contactPhone: "",
  city: "",
  state: "",
  status: "ativa",
  primaryColor: "#5b6cff",
  secondaryColor: "#f1f2f6",
  accentColor: "#7c83ff",
  defaultTheme: "light",
  whiteLabelEnabled: false,
  brandName: "ThermoFit",
  brandShortName: "TF",
  brandPrimary: "#5b6cff",
  brandSecondary: "#f1f2f6",
  footerText: "© Clínica Acas",
  subdomain: "clinicaacas",
  customDomain: "",
  planId: "interno",
  renewalDate: "",
  createdAt: new Date().toISOString(),
  team: [
    {
      id: "u1",
      name: "Dra. Cynara Acas",
      email: "cynara@clinicaacas.com.br",
      role: "Super Admin",
      profile: "super_admin",
      status: "ativo",
    },
  ],
};

type Ctx = {
  tenant: Tenant;
  plans: Plan[];
  currentPlan: Plan;
  updateTenant: (patch: Partial<Tenant>) => void;
  updatePlan: (id: PlanId, patch: Partial<Plan>) => void;
  addUser: (u: Omit<TeamUser, "id">) => { ok: boolean; reason?: string };
  updateUser: (id: string, patch: Partial<TeamUser>) => void;
  removeUser: (id: string) => void;
};

const TenantCtx = createContext<Ctx | null>(null);
const STORAGE = "thermofit_tenant_v1";
const PLANS_STORAGE = "thermofit_plans_v1";

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Tenant>(DEFAULT_TENANT);
  const [plans, setPlans] = useState<Plan[]>(DEFAULT_PLANS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) setTenant({ ...DEFAULT_TENANT, ...JSON.parse(raw) });
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
      if (limit !== -1 && tenant.team.length >= limit) {
        return {
          ok: false,
          reason: `Seu plano atual permite até ${limit} usuários. Para adicionar mais pessoas, atualize seu plano.`,
        };
      }
      setTenant((t) => ({
        ...t,
        team: [...t.team, { ...u, id: crypto.randomUUID() }],
      }));
      return { ok: true };
    },
    updateUser: (id, patch) =>
      setTenant((t) => ({
        ...t,
        team: t.team.map((u) => (u.id === id ? { ...u, ...patch } : u)),
      })),
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
