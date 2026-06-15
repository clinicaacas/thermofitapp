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
        must_change_password: true,
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
        .select("profile,status")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profile?.profile === "super_admin" && profile.status === "ativo") {
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

export const getCurrentUserProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("*, tenants(*)")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!profile) return { ok: false, reason: "Usuário sem perfil vinculado. Entre em contato com o administrador." };
    if (profile.status !== "ativo") return { ok: false, reason: "Seu acesso está inativo. Entre em contato com o administrador." };
    if (!profile.tenants || profile.tenants.status !== "ativa") {
      return { ok: false, reason: "Usuário sem clínica ativa vinculada. Entre em contato com o administrador." };
    }
    await supabaseAdmin.from("profiles").update({ last_access: new Date().toISOString() }).eq("id", context.userId);
    return { ok: true, user: mapProfile(profile), tenant: mapTenant(profile.tenants) };
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
      mustChangePassword: z.boolean().default(true),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertSuperAdmin(supabaseAdmin, context.userId);
    const tenant = await ensureAcasTenant(supabaseAdmin);
    const password = generateTemporaryPassword();
    let authUser = await findAuthUserByEmail(supabaseAdmin, data.email);
    if (authUser) {
      const { data: existingProfile } = await supabaseAdmin.from("profiles").select("id").eq("email", data.email.toLowerCase()).maybeSingle();
      if (existingProfile) throw new Error("Este e-mail já está cadastrado.");
      const { error } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, { password, email_confirm: true });
      if (error) throw error;
    } else {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: data.email.toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: { name: data.name },
      });
      if (error) throw error;
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
    if (error) throw error;
    return { user: mapProfile(profile), temporaryPassword: password };
  });

export const adminResetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertSuperAdmin(supabaseAdmin, context.userId);
    const password = generateTemporaryPassword();
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password });
    if (authError) throw authError;
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: true, status: "ativo" })
      .eq("id", data.userId)
      .select("*")
      .single();
    if (error) throw error;
    return { user: mapProfile(profile), temporaryPassword: password };
  });

export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid(), patch: z.record(z.any()) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertSuperAdmin(supabaseAdmin, context.userId);
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
    if (error) throw error;
    return { user: mapProfile(profile) };
  });

export const adminRemoveUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertSuperAdmin(supabaseAdmin, context.userId);
    const { data: profile } = await supabaseAdmin.from("profiles").select("profile").eq("id", data.userId).maybeSingle();
    if (profile?.profile === "super_admin") throw new Error("A conta Super Admin não pode ser removida.");
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    await supabaseAdmin.auth.admin.deleteUser(data.userId);
    return { ok: true };
  });