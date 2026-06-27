import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MASTER_EMAIL = "studioacass@gmail.com";
const MASTER_TEMP_PASSWORD = "Acas@2026";
const PUBLIC_APP_URL = "https://thermofitapp.lovable.app";

const profileSchema = z.enum(["super_admin", "dono", "admin", "equipe"]);
const statusSchema = z.enum(["ativo", "inativo", "bloqueado", "convite_pendente"]);
const tenantRoleSchema = z.enum(["dono", "admin", "equipe"]);
const membershipInputSchema = z.object({
  tenantId: z.string().uuid(),
  role: tenantRoleSchema,
  status: z.enum(["ativo", "inativo"]).default("ativo"),
});

type SupabaseAdmin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

function generateTemporaryPassword(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint32Array(len));
  return Array.from(bytes, (n) => chars[n % chars.length]).join("");
}

async function findAuthUserByEmail(admin: SupabaseAdmin, email: string) {
  const target = email.trim().toLowerCase();
  // Prefer profile lookup — GoTrue's listUsers can throw "Database error finding users"
  // when any row in auth.users is inconsistent. We mirror emails in public.profiles.
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", target)
    .maybeSingle();
  if (profile?.id) {
    const { data, error } = await admin.auth.admin.getUserById(profile.id);
    if (!error && data?.user) return data.user;
  }
  // Best-effort fallback: a single small page. Swallow errors so the snapshot
  // never blanks when listUsers is unhealthy.
  try {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) return null;
    return data.users.find((u) => u.email?.toLowerCase() === target) ?? null;
  } catch {
    return null;
  }
}

async function ensureAcasTenant(admin: SupabaseAdmin) {
  const payload = {
    slug: "acas",
    clinic_name: "Clínica Acas",
    system_name: "ThermoFit Acas",
    system_subtitle: "Plano de Voo da Transformação",
    public_app_url: PUBLIC_APP_URL,
    owner_name: "Dra. Cynara Acas",
    contact_email: MASTER_EMAIL,
    city: "São Luís",
    state: "Maranhão",
    status: "ativa" as const,
    plan_id: "interno" as const,
    account_type: "internal_master",
    user_limit: -1,
    client_limit: -1,
  };
  const { data, error } = await admin
    .from("tenants")
    .upsert(payload, { onConflict: "slug" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function ensureMasterAdmin(admin: SupabaseAdmin, tenantId: string) {
  let authUser = await findAuthUserByEmail(admin, MASTER_EMAIL);
  if (!authUser) {
    const { data, error } = await admin.auth.admin.createUser({
      email: MASTER_EMAIL,
      password: MASTER_TEMP_PASSWORD,
      email_confirm: true,
      user_metadata: { name: "Dra. Cynara Acas" },
    });
    if (error) return null;
    authUser = data.user;
  }

  const { data, error } = await admin
    .from("profiles")
    .upsert(
      {
        id: authUser.id,
        tenant_id: tenantId,
        name: "Dra. Cynara Acas",
        email: MASTER_EMAIL,
        phone: "",
        role: "Super Admin",
        profile: "super_admin",
        status: "ativo",
        must_change_password: false,
        permissions: { all: true },
      },
      { onConflict: "email" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function assertSuperAdmin(admin: SupabaseAdmin, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("profile,status")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.profile !== "super_admin" || data.status !== "ativo") {
    throw new Error("Forbidden");
  }
}

async function assertUserManager(admin: SupabaseAdmin, userId: string, tenantId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("profile,status,tenant_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("Erro ao validar permissões do administrador", error);
    throw error;
  }
  if (!data || data.status !== "ativo") throw new Error("Forbidden");
  if (data.profile === "super_admin") return;
  // Non super-admin must have an active membership with managing role in this tenant
  const { data: m } = await admin
    .from("profile_tenant_memberships")
    .select("role,status")
    .eq("profile_id", userId)
    .eq("tenant_id", tenantId)
    .eq("status", "ativo")
    .maybeSingle();
  const canManage = m && ["dono", "admin"].includes(m.role as string);
  if (!canManage) throw new Error("Forbidden");
}

async function isSuperAdmin(admin: SupabaseAdmin, userId: string): Promise<boolean> {
  const { data } = await admin
    .from("profiles")
    .select("profile,status")
    .eq("id", userId)
    .maybeSingle();
  return !!data && data.profile === "super_admin" && data.status === "ativo";
}

async function countActiveSuperAdmins(admin: SupabaseAdmin): Promise<number> {
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("profile", "super_admin")
    .eq("status", "ativo");
  return count ?? 0;
}

function mapTenant(row: any) {
  return {
    id: row.id,
    clinicName: row.clinic_name,
    systemName: row.system_name,
    systemSubtitle: row.system_subtitle,
    publicAppUrl: row.public_app_url,
    ownerName: row.owner_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    city: row.city,
    state: row.state,
    status: row.status,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    accentColor: row.accent_color,
    defaultTheme: row.default_theme,
    whiteLabelEnabled: row.white_label_enabled,
    brandName: row.brand_name,
    brandShortName: row.brand_short_name,
    brandPrimary: row.primary_color,
    brandSecondary: row.secondary_color,
    footerText: row.footer_text,
    subdomain: row.subdomain,
    customDomain: row.custom_domain,
    planId: row.plan_id,
    renewalDate: "",
    createdAt: row.created_at,
    team: [],
  };
}

function mapProfile(row: any) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    profile: row.profile,
    status: row.status,
    mustChangePassword: false,
    lastAccess: row.last_access ? new Date(row.last_access).toLocaleString("pt-BR") : "",
  };
}

export const getTenantSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const tenant = await ensureAcasTenant(supabaseAdmin);
  await ensureMasterAdmin(supabaseAdmin, tenant.id);

  // Ensure master super admin has membership in main tenant (idempotent)
  await supabaseAdmin
    .from("profile_tenant_memberships")
    .upsert(
      [{
        profile_id: (await supabaseAdmin.from("profiles").select("id").eq("email", "studioacass@gmail.com").maybeSingle()).data?.id,
        tenant_id: tenant.id,
        role: "dono",
        status: "ativo",
      }].filter((m) => !!m.profile_id) as any,
      { onConflict: "profile_id,tenant_id" },
    );

  const authHeader =
    getRequestHeader("authorization") ?? getRequestHeader("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.replace("Bearer ", "")
    : null;

  let callerId: string | null = null;
  let callerIsSuper = false;
  let callerIsInternalMember = false;
  if (token) {
    const { data } = await supabaseAdmin.auth.getUser(token);
    if (data.user) {
      callerId = data.user.id;
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("profile,status,tenant_id")
        .eq("id", data.user.id)
        .maybeSingle();
      callerIsSuper = !!profile && profile.profile === "super_admin" && profile.status === "ativo";
      callerIsInternalMember = Boolean(
        profile && profile.status === "ativo" &&
        (callerIsSuper || profile.tenant_id === tenant.id),
      );
      if (!callerIsInternalMember && callerId) {
        const { data: m } = await supabaseAdmin
          .from("profile_tenant_memberships")
          .select("id")
          .eq("profile_id", callerId)
          .eq("tenant_id", tenant.id)
          .eq("status", "ativo")
          .maybeSingle();
        callerIsInternalMember = !!m;
      }
    }
  }

  let team: (ReturnType<typeof mapProfile> & { memberships: Array<{ tenantId: string; tenantName: string; role: string; status: string }> })[] = [];
  let allTenants: Array<{ id: string; clinicName: string; status: string; accountType: string | null }> = [];

  if (callerIsInternalMember) {
    try {
      // Team scope: super_admin = all profiles via memberships; others = just members of this tenant
      let profileIds: string[] = [];
      if (callerIsSuper) {
        const { data: allProfiles } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .in("profile", ["super_admin", "dono", "admin", "equipe"]);
        profileIds = (allProfiles ?? []).map((p: any) => p.id);
      } else {
        const { data: memRows } = await supabaseAdmin
          .from("profile_tenant_memberships")
          .select("profile_id")
          .eq("tenant_id", tenant.id);
        profileIds = (memRows ?? []).map((m: any) => m.profile_id);
        // Always include direct profiles for legacy tenant_id linkage
        const { data: legacy } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("tenant_id", tenant.id)
          .in("profile", ["super_admin", "dono", "admin", "equipe"]);
        for (const r of legacy ?? []) if (!profileIds.includes((r as any).id)) profileIds.push((r as any).id);
      }

      if (profileIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("*")
          .in("id", profileIds)
          .order("created_at", { ascending: true });
        const { data: memberships } = await supabaseAdmin
          .from("profile_tenant_memberships")
          .select("profile_id,tenant_id,role,status,tenants(clinic_name)")
          .in("profile_id", profileIds);
        const memMap = new Map<string, Array<{ tenantId: string; tenantName: string; role: string; status: string }>>();
        for (const m of memberships ?? []) {
          const arr = memMap.get((m as any).profile_id) ?? [];
          arr.push({
            tenantId: (m as any).tenant_id,
            tenantName: ((m as any).tenants?.clinic_name as string) ?? "",
            role: (m as any).role,
            status: (m as any).status,
          });
          memMap.set((m as any).profile_id, arr);
        }
        team = (profiles ?? [])
          .filter((p: any) => p && p.id)
          .map((p: any) => {
            try {
              return { ...mapProfile(p), memberships: memMap.get(p.id) ?? [] };
            } catch (mapErr) {
              console.error("[getTenantSnapshot] mapProfile failed for row", p?.id, mapErr);
              return null;
            }
          })
          .filter((p): p is (ReturnType<typeof mapProfile> & { memberships: any[] }) => p !== null);
      }

      // Tenants visible to caller
      if (callerIsSuper) {
        const { data: t } = await supabaseAdmin
          .from("tenants")
          .select("id,clinic_name,status,account_type")
          .order("clinic_name", { ascending: true });
        allTenants = (t ?? []).map((r: any) => ({
          id: r.id, clinicName: r.clinic_name, status: r.status, accountType: r.account_type,
        }));
      } else if (callerId) {
        const { data: t } = await supabaseAdmin
          .from("profile_tenant_memberships")
          .select("tenants(id,clinic_name,status,account_type)")
          .eq("profile_id", callerId)
          .eq("status", "ativo");
        allTenants = (t ?? [])
          .map((r: any) => r.tenants)
          .filter(Boolean)
          .map((r: any) => ({
            id: r.id, clinicName: r.clinic_name, status: r.status, accountType: r.account_type,
          }));
      }
    } catch (teamErr) {
      console.error("[getTenantSnapshot] failed to load team", teamErr);
      team = [];
    }
  }

  return {
    tenant: { ...mapTenant(tenant), team },
    allTenants,
    callerIsSuperAdmin: callerIsSuper,
  };
});



export const checkInitialSetupStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const tenant = await ensureAcasTenant(supabaseAdmin);
  const master = await ensureMasterAdmin(supabaseAdmin, tenant.id);
  const { count, error } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("profile", "super_admin")
    .eq("status", "ativo");
  if (error) {
    console.error("Erro ao verificar setup inicial", error);
    throw error;
  }
  return {
    hasActiveSuperAdmin: Boolean(count && count > 0),
    hasMainTenant: Boolean(tenant?.id),
    masterAdminId: master.id,
  };
});

export const getCurrentUserProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Is this an end-client user? Look up by auth_user_id, then fallback by email.
    let clientRow: any = null;
    {
      const { data, error } = await supabaseAdmin
        .from("clients")
        .select("id, tenant_id, name, access_email, access_status, last_access_at")
        .eq("auth_user_id", context.userId)
        .maybeSingle();
      if (error) console.error("getCurrentUserProfile: clients by auth_user_id error", error);
      clientRow = data ?? null;
    }
    if (!clientRow) {
      // Fallback: find the auth user's email, then match clients by access_email or email and self-heal the link.
      const { data: authUserData } = await supabaseAdmin.auth.admin.getUserById(context.userId);
      const email = authUserData?.user?.email?.toLowerCase()?.trim();
      if (email) {
        const { data: byAccess } = await supabaseAdmin
          .from("clients")
          .select("id, tenant_id, name, access_email, access_status, last_access_at")
          .or(`access_email.eq.${email},email.eq.${email}`)
          .is("auth_user_id", null)
          .limit(1)
          .maybeSingle();
        if (byAccess) {
          const { data: linked } = await supabaseAdmin
            .from("clients")
            .update({ auth_user_id: context.userId, access_email: email, access_status: byAccess.access_status ?? "ativo" })
            .eq("id", byAccess.id)
            .select("id, tenant_id, name, access_email, access_status, last_access_at")
            .single();
          clientRow = linked ?? byAccess;
        }
      }
    }
    if (clientRow) {
      if (clientRow.access_status && ["inativo", "bloqueado"].includes(clientRow.access_status)) {
        return { ok: false as const, reason: "Seu acesso ao app está desativado. Fale com a clínica." };
      }
      await supabaseAdmin
        .from("clients")
        .update({ last_access_at: new Date().toISOString() })
        .eq("id", clientRow.id);
      const { data: tenantRow } = await supabaseAdmin
        .from("tenants")
        .select("*")
        .eq("id", clientRow.tenant_id)
        .maybeSingle();
      return {
        ok: true as const,
        user: {
          id: context.userId,
          tenantId: clientRow.tenant_id,
          name: clientRow.name,
          email: clientRow.access_email ?? "",
          phone: "",
          role: "Cliente",
          profile: "cliente",
          status: "ativo",
          mustChangePassword: false,
          lastAccess: "",
          kind: "client" as const,
          clientId: clientRow.id,
        },
        tenant: tenantRow ? mapTenant(tenantRow) : undefined,
      };
    }


    // 2) Internal team member.
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("*, tenants(*)")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!profile) return { ok: false as const, reason: "Usuário sem perfil vinculado. Entre em contato com o administrador." };
    if (profile.status !== "ativo") return { ok: false as const, reason: "Seu acesso está inativo. Entre em contato com o administrador." };
    if (!profile.tenants || profile.tenants.status !== "ativa") {
      return { ok: false as const, reason: "Usuário sem clínica ativa vinculada. Entre em contato com o administrador." };
    }
    await supabaseAdmin.from("profiles").update({ last_access: new Date().toISOString() }).eq("id", context.userId);
    return { ok: true as const, user: { ...mapProfile(profile), kind: "team" as const }, tenant: mapTenant(profile.tenants) };
  });


export const markPasswordChanged = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const updateTenantSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.record(z.any()).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertSuperAdmin(supabaseAdmin, context.userId);
    const patch: Record<string, unknown> = {};
    const map: Record<string, string> = {
      clinicName: "clinic_name",
      systemName: "system_name",
      systemSubtitle: "system_subtitle",
      publicAppUrl: "public_app_url",
      ownerName: "owner_name",
      contactEmail: "contact_email",
      contactPhone: "contact_phone",
      city: "city",
      state: "state",
      status: "status",
      primaryColor: "primary_color",
      secondaryColor: "secondary_color",
      accentColor: "accent_color",
      defaultTheme: "default_theme",
      whiteLabelEnabled: "white_label_enabled",
      brandName: "brand_name",
      brandShortName: "brand_short_name",
      footerText: "footer_text",
      subdomain: "subdomain",
      customDomain: "custom_domain",
      planId: "plan_id",
    };
    Object.entries(data).forEach(([key, value]) => {
      if (key in map) patch[map[key]] = value;
    });
    if ("plan_id" in patch && patch.plan_id === "interno") {
      patch.user_limit = -1;
      patch.client_limit = -1;
      patch.account_type = "internal_master";
    }
    const { data: tenant, error } = await supabaseAdmin
      .from("tenants")
      .update(patch as any)
      .eq("slug", "acas")
      .select("*")
      .single();
    if (error) throw error;
    return { tenant: mapTenant(tenant) };
  });

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      name: z.string().min(1).max(180),
      email: z.string().email().max(255),
      phone: z.string().max(60).optional().default(""),
      role: z.string().max(120).optional().default("Equipe"),
      profile: profileSchema.default("equipe"),
      status: statusSchema.default("ativo"),
      mustChangePassword: z.boolean().default(false),
      memberships: z.array(membershipInputSchema).optional().default([]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenant = await ensureAcasTenant(supabaseAdmin);
    const callerIsSuper = await isSuperAdmin(supabaseAdmin, context.userId);

    // Anchor tenant for legacy profiles.tenant_id
    let anchorTenantId = tenant.id;
    if (data.memberships.length > 0) {
      anchorTenantId = data.memberships[0].tenantId;
    }
    await assertUserManager(supabaseAdmin, context.userId, anchorTenantId);

    // Guard: only super admin may grant super_admin role
    if (data.profile === "super_admin" && !callerIsSuper) {
      throw new Error("Apenas Super Admin pode conceder o papel Super Admin.");
    }

    // Guard: non-super may only create memberships in tenants they manage
    if (!callerIsSuper) {
      for (const m of data.memberships) {
        await assertUserManager(supabaseAdmin, context.userId, m.tenantId);
      }
    }

    const password = generateTemporaryPassword();
    let authUser = await findAuthUserByEmail(supabaseAdmin, data.email);
    let existed = Boolean(authUser);
    if (authUser) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, { password, email_confirm: true });
      if (error) {
        console.error("Erro ao criar/atualizar usuário no Auth", error);
        throw new Error("Não foi possível salvar o usuário.");
      }
    } else {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: data.email.toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: { name: data.name },
      });
      if (error) {
        console.error("Erro ao criar usuário no Auth", error);
        throw new Error("Não foi possível salvar o usuário.");
      }
      authUser = created.user;
    }

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: authUser.id,
        tenant_id: anchorTenantId,
        name: data.name,
        email: data.email.toLowerCase(),
        phone: data.phone,
        role: data.role || "Equipe",
        profile: data.profile,
        status: data.status,
        must_change_password: data.mustChangePassword,
      }, { onConflict: "email" })
      .select("*")
      .single();
    if (error) {
      console.error("Erro ao criar perfil", error);
      throw new Error("Não foi possível salvar o usuário.");
    }

    // Apply memberships (idempotent upsert)
    const membershipsToWrite = data.memberships.length > 0
      ? data.memberships
      : data.profile !== "super_admin"
        ? [{ tenantId: anchorTenantId, role: (data.profile as "dono" | "admin" | "equipe"), status: "ativo" as const }]
        : [];
    for (const m of membershipsToWrite) {
      await supabaseAdmin
        .from("profile_tenant_memberships")
        .upsert({
          profile_id: profile.id,
          tenant_id: m.tenantId,
          role: m.role,
          status: m.status,
          created_by: context.userId,
        }, { onConflict: "profile_id,tenant_id" });
    }

    return { user: mapProfile(profile), temporaryPassword: password, existed };
  });

export const adminResetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenant = await ensureAcasTenant(supabaseAdmin);
    await assertUserManager(supabaseAdmin, context.userId, tenant.id);
    const password = generateTemporaryPassword();
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password });
    if (authError) {
      console.error("Erro ao redefinir senha no Auth", authError);
      throw new Error("Não foi possível redefinir a senha.");
    }
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false, status: "ativo" })
      .eq("id", data.userId)
      .select("*")
      .single();
    if (error) throw new Error("Não foi possível atualizar o perfil.");
    return { user: mapProfile(profile), temporaryPassword: password };
  });

export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid(), patch: z.record(z.any()) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenant = await ensureAcasTenant(supabaseAdmin);
    await assertUserManager(supabaseAdmin, context.userId, tenant.id);
    const callerIsSuper = await isSuperAdmin(supabaseAdmin, context.userId);

    // Guard: only super admin can grant/revoke super_admin role
    if (data.patch.profile && data.patch.profile === "super_admin" && !callerIsSuper) {
      throw new Error("Apenas Super Admin pode conceder o papel Super Admin.");
    }
    const { data: target } = await supabaseAdmin
      .from("profiles").select("profile,status").eq("id", data.userId).maybeSingle();
    if (target?.profile === "super_admin") {
      if (!callerIsSuper && data.patch.profile && data.patch.profile !== "super_admin") {
        throw new Error("Apenas Super Admin pode revogar o papel Super Admin.");
      }
      // Last super admin guard: block deactivating or downgrading the last active super admin
      const wouldRemove =
        (data.patch.profile && data.patch.profile !== "super_admin") ||
        (data.patch.status && data.patch.status !== "ativo");
      if (wouldRemove) {
        const count = await countActiveSuperAdmins(supabaseAdmin);
        if (count <= 1) throw new Error("Não é possível remover o último Super Admin ativo.");
      }
    }

    const allowed: Record<string, string> = {
      name: "name", email: "email", phone: "phone", role: "role",
      profile: "profile", status: "status", mustChangePassword: "must_change_password",
    };
    const patch: Record<string, unknown> = {};
    Object.entries(data.patch).forEach(([key, value]) => {
      if (key in allowed) patch[allowed[key]] = value;
    });
    const { data: profile, error } = await supabaseAdmin
      .from("profiles").update(patch as any).eq("id", data.userId).select("*").single();
    if (error) throw new Error("Não foi possível atualizar o usuário.");
    return { user: mapProfile(profile) };
  });

export const adminRemoveUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenant = await ensureAcasTenant(supabaseAdmin);
    await assertUserManager(supabaseAdmin, context.userId, tenant.id);
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("profile,status").eq("id", data.userId).maybeSingle();
    if (profile?.profile === "super_admin") {
      const count = await countActiveSuperAdmins(supabaseAdmin);
      if (count <= 1) throw new Error("Não é possível remover o último Super Admin ativo.");
    }
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    await supabaseAdmin.auth.admin.deleteUser(data.userId);
    return { ok: true };
  });

// ---------- Memberships management ----------

export const adminSetMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    userId: z.string().uuid(),
    tenantId: z.string().uuid(),
    role: tenantRoleSchema,
    status: z.enum(["ativo", "inativo"]).default("ativo"),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertUserManager(supabaseAdmin, context.userId, data.tenantId);
    const { error } = await supabaseAdmin
      .from("profile_tenant_memberships")
      .upsert({
        profile_id: data.userId,
        tenant_id: data.tenantId,
        role: data.role,
        status: data.status,
        created_by: context.userId,
        deactivated_at: data.status === "inativo" ? new Date().toISOString() : null,
        deactivated_by: data.status === "inativo" ? context.userId : null,
      }, { onConflict: "profile_id,tenant_id" });
    if (error) {
      console.error("Erro ao salvar membership", error);
      throw new Error("Não foi possível salvar o vínculo.");
    }
    return { ok: true };
  });

export const adminRemoveMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    userId: z.string().uuid(),
    tenantId: z.string().uuid(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertUserManager(supabaseAdmin, context.userId, data.tenantId);
    // Soft-delete: mark inactive so history is preserved
    const { error } = await supabaseAdmin
      .from("profile_tenant_memberships")
      .update({
        status: "inativo",
        deactivated_at: new Date().toISOString(),
        deactivated_by: context.userId,
      })
      .eq("profile_id", data.userId)
      .eq("tenant_id", data.tenantId);
    if (error) throw new Error("Não foi possível remover o vínculo.");
    return { ok: true };
  });