import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MASTER_EMAIL = "studioacass@gmail.com";
const MASTER_TEMP_PASSWORD = "Acas@2026";
const PUBLIC_APP_URL = "https://thermofitapp.lovable.app";

const profileSchema = z.enum(["super_admin", "dono", "admin", "equipe"]);
const statusSchema = z.enum(["ativo", "inativo", "bloqueado", "convite_pendente"]);

type SupabaseAdmin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

function generateTemporaryPassword(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint32Array(len));
  return Array.from(bytes, (n) => chars[n % chars.length]).join("");
}

async function findAuthUserByEmail(admin: SupabaseAdmin, email: string) {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  return null;
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
    if (error) throw error;
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
  const canManage =
    data?.status === "ativo" &&
    data.tenant_id === tenantId &&
    ["super_admin", "dono", "admin"].includes(data.profile);
  if (!canManage) throw new Error("Forbidden");
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

  let team: ReturnType<typeof mapProfile>[] = [];
  const authHeader = getRequestHeader("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : null;
  if (token) {
    const { data } = await supabaseAdmin.auth.getUser(token);
    if (data.user) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
          .select("profile,status,tenant_id")
        .eq("id", data.user.id)
        .maybeSingle();
      if (
        profile?.status === "ativo" &&
        profile.tenant_id === tenant.id &&
        ["super_admin", "dono", "admin"].includes(profile.profile)
      ) {
        const { data: profiles, error } = await supabaseAdmin
          .from("profiles")
          .select("*")
          .eq("tenant_id", tenant.id)
          .order("created_at", { ascending: true });
        if (error) throw error;
        team = profiles.map(mapProfile);
      }
    }
  }

  return { tenant: { ...mapTenant(tenant), team } };
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

    // 1) Is this an end-client user?
    const { data: clientRow } = await supabaseAdmin
      .from("clients")
      .select("id, tenant_id, name, access_email, access_status, last_access_at, tenants(*)")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (clientRow) {
      if (clientRow.access_status && ["inativo", "bloqueado"].includes(clientRow.access_status)) {
        return { ok: false as const, reason: "Seu acesso ao app está desativado. Fale com a clínica." };
      }
      await supabaseAdmin
        .from("clients")
        .update({ last_access_at: new Date().toISOString() })
        .eq("id", clientRow.id);
      const tenants: any = (clientRow as any).tenants;
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
        tenant: tenants ? mapTenant(tenants) : undefined,
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
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenant = await ensureAcasTenant(supabaseAdmin);
    await assertUserManager(supabaseAdmin, context.userId, tenant.id);
    const password = generateTemporaryPassword();
    let authUser = await findAuthUserByEmail(supabaseAdmin, data.email);
    let existed = Boolean(authUser);
    if (authUser) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, { password, email_confirm: true });
      if (error) {
        console.error("Erro ao criar/atualizar usuário no Auth", error);
        throw new Error("Não foi possível salvar o usuário. Verifique as permissões do banco ou autenticação.");
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
        throw new Error("Não foi possível salvar o usuário. Verifique as permissões do banco ou autenticação.");
      }
      authUser = created.user;
    }
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: authUser.id,
        tenant_id: tenant.id,
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
      console.error("Erro ao criar perfil ou vincular clínica", error);
      throw new Error("Não foi possível salvar o usuário. Verifique as permissões do banco ou autenticação.");
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
      throw new Error("Não foi possível salvar o usuário. Verifique as permissões do banco ou autenticação.");
    }
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false, status: "ativo" })
      .eq("id", data.userId)
      .select("*")
      .single();
    if (error) {
      console.error("Erro ao atualizar perfil após redefinir senha", error);
      throw new Error("Não foi possível salvar o usuário. Verifique as permissões do banco ou autenticação.");
    }
    return { user: mapProfile(profile), temporaryPassword: password };
  });

export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid(), patch: z.record(z.any()) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenant = await ensureAcasTenant(supabaseAdmin);
    await assertUserManager(supabaseAdmin, context.userId, tenant.id);
    const allowed: Record<string, string> = {
      name: "name",
      email: "email",
      phone: "phone",
      role: "role",
      profile: "profile",
      status: "status",
      mustChangePassword: "must_change_password",
    };
    const patch: Record<string, unknown> = {};
    Object.entries(data.patch).forEach(([key, value]) => {
      if (key in allowed) patch[allowed[key]] = value;
    });
    const { data: profile, error } = await supabaseAdmin.from("profiles").update(patch as any).eq("id", data.userId).select("*").single();
    if (error) {
      console.error("Erro ao atualizar perfil", error);
      throw new Error("Não foi possível salvar o usuário. Verifique as permissões do banco ou autenticação.");
    }
    return { user: mapProfile(profile) };
  });

export const adminRemoveUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenant = await ensureAcasTenant(supabaseAdmin);
    await assertUserManager(supabaseAdmin, context.userId, tenant.id);
    const { data: profile } = await supabaseAdmin.from("profiles").select("profile").eq("id", data.userId).maybeSingle();
    if (profile?.profile === "super_admin") throw new Error("A conta Super Admin não pode ser removida.");
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    await supabaseAdmin.auth.admin.deleteUser(data.userId);
    return { ok: true };
  });